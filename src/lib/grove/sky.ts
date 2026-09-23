import * as THREE from 'three';
import { U } from './shared';

// ─── The sky ──────────────────────────────────────────────────────────────
// Light first, then weather. The air is modelled as it is: Rayleigh, Mie and
// ozone in a shell round a planet, each thinning with height, and sunlight
// scattered once on its way to the eye. That is integrated into a small
// sky-view table (Hillaire's) whenever the sun moves, with Schüler's
// approximation to the Chapman function for the sun's own path through the
// air; the screen then only reads the table. It gives what a hand-mixed
// gradient never quite does: a blue sky overhead while the sun is on the
// horizon, a hot glow round it, the far side pink, and — with the sun six
// degrees under the cloud — the blue hour, lit from the top of the sky down.
// The island's light is the same sums, done on the CPU, so the sky and what
// it lights cannot disagree.
//
// Below the horizon is a sea of cumulus. Its tops are a height field baked
// once into a small tileable texture (cauliflower domes on domes, gathered
// into towers and valleys by a slow noise) and the eye's ray is marched
// into it, so near puffs hide far ones and the tops stand up; each is lit
// by the sun from almost level, with the long shadows that makes, and by
// the sky above, and the air between (from the same table, which stops its
// downward rays at the cloud) lies over it. Overhead there is a thin field
// of altocumulus, gilt underneath near the sun.
//
// Everything is linear HDR: the sheet is half-float, and the post pass
// tone-maps sky and island together, so the sun's disc can bloom.

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = position;
	vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	gl_Position = p.xyww;
}
`;

// the air, in kilometres: an eye three up, cloud tops at one and a half
const ATMO = /* glsl */ `
const float PI = 3.14159265;
const float LN2 = 0.6931472;
const float RP = 6360.0, RA = 6420.0;
const float EYE = 3.0, CLOUD = 1.6, HIGH = 6.5;
const vec3 BR = vec3(5.802e-3, 13.558e-3, 33.1e-3);   // Rayleigh, H 8
const float BMS = 5.5e-3, BME = 6.1e-3;               // an evening's Mie, H 1.2
const vec3 BO = vec3(0.650e-3, 1.881e-3, 0.085e-3);   // ozone, a layer at 25
float phaseR(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
float phaseHG(float mu, float g) {
	float g2 = g * g;
	return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}
// Schüler: the Chapman function times the density, X and h in half-heights
float chapman(float X, float h, float c) {
	float s = sqrt(X + h);
	if (c >= 0.0) return s / (s * c + 1.0) * exp2(-h);
	float x0 = sqrt(1.0 - c * c) * (X + h);
	return 2.0 * sqrt(x0) * exp2(X - x0) - s / (1.0 - s * c) * exp2(-h);
}
// optical depth from a point at radius r to the sun, cosChi off its zenith
vec3 sunTau(float r, float cosChi) {
	float h = r - RP;
	float cR = chapman(RP / (8.0 * LN2), h / (8.0 * LN2), cosChi) * 8.0;
	float cM = chapman(RP / (1.2 * LN2), h / (1.2 * LN2), cosChi) * 1.2;
	// ozone rides with the Rayleigh column, scaled to its own
	return (BR + BO * 1.875) * cR + BME * cM;
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uMix;   // 0 night .. 1 day
uniform vec3 uSun;
uniform vec3 uMoon;
uniform float uStars; // 0 in the environment capture, 1 on screen
uniform float uSea;   // the scale of the cloud below
uniform sampler2D uCloud;
uniform float uLift;
uniform float uSkySat;
uniform float uHigh;
uniform sampler2D uLutDay;
uniform float uE;
uniform float uCover; // how much of the cloud below is open sky
uniform vec3 uSunEye;   // sunlight as it reaches the eye, the cloud, the high cloud
uniform vec3 uSunCloud;
uniform vec3 uSunHigh;
uniform vec3 uMoonLight;
uniform float uParity;  // -1 draws every pixel; 0 or 1, half of them, chequered

${ATMO}

// the sky-view table: azimuth from the sun across, elevation up, with the
// rows crowded toward the horizon where the colour changes fastest
vec4 sky(sampler2D lut, vec3 d, vec3 s) {
	vec2 dh = normalize(d.xz + vec2(1e-6, 0.0));
	vec2 sh = normalize(s.xz + vec2(1e-6, 0.0));
	float phi = acos(clamp(dot(dh, sh), -1.0, 1.0));
	float el = asin(clamp(d.y, -1.0, 1.0));
	float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / (PI * 0.5));
	return texture(lut, vec2(phi / PI, v));
}

float h21(vec2 p) {
	vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	q += dot(q, q.yzx + 33.33);
	return fract((q.x + q.y) * q.z);
}

// ── the cloud sea ──
// The layer's tops lie between SEA_B below the eye and SEA_B - SEA_A; the
// eye is SEA_B above its floor, in units the texture is scaled into.
const float SEA_B = 1.0;
const float SEA_A = 0.34;
vec2 gX, gY; // the floor plane's footprint per pixel, for filtering
// a slow swell over the whole sheet, so it never repeats in rows: it
// changes over many puffs, so one reading serves a whole ray
float swell(vec2 p, float k) {
	vec2 c = p * uSea * 0.071 + vec2(0.63, 0.12);
	float m = textureGrad(uCloud, c, gX * uSea * 0.071 * k, gY * uSea * 0.071 * k).a;
	// and where it opens altogether, onto clear air
	return (0.55 + 0.9 * m) * smoothstep(uCover, uCover + 0.3, m);
}
float SW = 1.0;
float seaH(vec2 p, float k) {
	vec2 a = p * uSea + vec2(uTime * 0.0021, uTime * 0.0008);
	vec2 b = p * uSea * 0.37 + vec2(0.31, 0.77) - vec2(uTime * 0.0007, 0.0);
	float h1 = textureGrad(uCloud, a, gX * uSea * k, gY * uSea * k).r;
	float h2 = textureGrad(uCloud, b, gX * uSea * 0.37 * k, gY * uSea * 0.37 * k).r;
	return clamp((h1 * 0.78 + h2 * 0.52 - 0.18) * SW, 0.0, 1.0);
}

struct Hit { vec2 p; float h; float t; float ok; };

Hit marchSea(vec3 d) {
	Hit r;
	float de = -d.y;
	float t0 = (SEA_B - SEA_A) / de;
	float t1 = SEA_B / de;
	float tb = t1;
	float prevY = 0.0, prevS = 0.0, prevT = t0;
	r.ok = 0.0; r.t = t1; r.p = d.xz * t1; r.h = 0.0;
	SW = swell(d.xz * mix(t0, t1, 0.4), 1.0);
	// finer where the ray skims the tops, or the far cloud comes out in
	// terraces
	int N = de < 0.12 ? 16 : 10;
	for (int i = 0; i <= 16; i++) {
		if (i > N) break;
		float t = mix(t0, t1, float(i) / float(N));
		vec2 p = d.xz * t;
		float y = SEA_B - de * t;          // height of the ray above the floor
		float s = SEA_A * seaH(p, t / tb); // height of the tops here
		if (y <= s && s > 0.004) {
			// between the last step and this one: where they cross
			float tt = t;
			if (i > 0) {
				// narrow the crossing down between the last two steps
				float lo = prevT, hi = t;
				for (int j = 0; j < 4; j++) {
					float mid = 0.5 * (lo + hi);
					float ym = SEA_B - de * mid;
					if (ym <= SEA_A * seaH(d.xz * mid, mid / tb)) hi = mid; else lo = mid;
				}
				tt = 0.5 * (lo + hi);
			}
			r.t = tt;
			r.p = d.xz * tt;
			r.h = seaH(r.p, tt / tb);
			r.ok = 1.0;
			return r;
		}
		prevY = y; prevS = s; prevT = t;
	}
	return r;
}

// the light on a cloud top: from a light that is almost level, with the long
// shadows of the tops between; from the sky above; and through the thin edges
vec3 shadeSea(Hit hit, vec3 d, vec3 l, vec3 lightCol, vec3 amb, float tb) {
	float k = hit.t / tb;
	float e = 0.02;
	float hx = seaH(hit.p + vec2(e, 0.0), k) - hit.h;
	float hz = seaH(hit.p + vec2(0.0, e), k) - hit.h;
	// the tops drawn a little rounder than they are, so each puff reads
	vec3 n = normalize(vec3(-hx * SEA_A * 1.8 / e, 1.0, -hz * SEA_A * 1.8 / e));
	// shadow: walk toward the light over the tops
	float y0 = hit.h * SEA_A;
	float vis = 1.0;
	vec2 ld = normalize(l.xz + 1e-5);
	float rise = l.y / max(length(l.xz), 1e-3);
	for (int i = 1; i <= 3; i++) {
		float s = 0.07 * float(i * i);
		float hs = seaH(hit.p + ld * s, k) * SEA_A;
		vis *= smoothstep(-0.03, 0.02, (y0 + rise * s) - hs);
	}
	float ndl = dot(n, l);
	float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
	float mu = dot(d, l);
	// the edges are thin and the light comes through them toward the eye
	float thin = 1.0 - smoothstep(0.1, 0.55, hit.h);
	float glow = phaseHG(mu, 0.6) * 4.0 * PI * thin * 0.6;
	float ao = mix(0.22, 1.0, smoothstep(0.0, 0.8, hit.h));
	// irradiance to radiance: a white Lambertian top under a light of this
	// colour is that colour over pi
	vec3 c = lightCol * (wrap * vis / 3.14159 + glow * vis * 0.25);
	c += amb * ao * (0.35 + 0.45 * n.y);
	return c * 0.9;
}

// ── the high cloud ──
float highC(vec2 p, vec2 gx, vec2 gy) {
	// drifts of cloud: slow fbm for where it is, finer for its ragged
	// edges, and a little of the puffs for texture within
	vec2 a = p * 0.19 + vec2(uTime * 0.0035, -uTime * 0.0011);
	vec4 c = textureGrad(uCloud, a, gx * 0.19, gy * 0.19);
	vec4 c2 = textureGrad(uCloud, p * 0.047 + vec2(0.4, 0.1), gx * 0.047, gy * 0.047);
	float f = c2.a * 0.72 + c.b * 0.42 + c.g * 0.12;
	return smoothstep(0.66, 0.92, f);
}

vec3 starField(vec2 p, float t, float band) {
	vec3 acc = vec3(0.0);
	for (int i = 0; i < 3; i++) {
		float fi = float(i);
		float dens = 10.0 + fi * 12.0;
		vec2 g = p * dens;
		vec2 id = floor(g);
		vec2 f = fract(g) - 0.5;
		float h = h21(id + fi * 31.7);
		float on = step(0.86 + fi * 0.045 - band * 0.09, h);
		vec2 off = vec2(h21(id + fi * 7.1 + 2.3), h21(id + fi * 7.1 + 5.9)) - 0.5;
		float d = length(f - off * 0.72) / dens;
		float core = exp(-d * (820.0 - fi * 90.0));
		float halo = exp(-d * 210.0) * 0.05;
		float tw = 0.55 + 0.45 * sin(t * (0.5 + h * 1.7) + h * 63.0);
		float lum = (0.2 + 0.8 * h21(id + fi * 13.3)) * (1.0 - fi * 0.3);
		vec3 tint = mix(vec3(0.74, 0.83, 1.0), vec3(1.0, 0.9, 0.76), h21(id + fi * 3.7));
		acc += tint * (core + halo) * on * tw * lum;
	}
	return acc;
}

vec3 meteor(vec2 p, float t, float seed) {
	float ts = t / 26.0 + seed;
	float slot = floor(ts), lt = fract(ts);
	float h = h21(vec2(slot, seed + 1.0));
	float live = step(0.62, h) * step(lt, 0.045);
	float u = lt / 0.045;
	vec2 a = vec2(mix(-1.2, 1.2, h21(vec2(slot, seed + 3.0))), mix(0.25, 0.7, h21(vec2(slot, seed + 5.0))));
	float ang = mix(-1.05, -0.45, h21(vec2(slot, seed + 8.0)));
	vec2 dir = vec2(cos(ang), sin(ang));
	vec2 head = a + dir * (u * 0.9);
	vec2 tail = head - dir * (0.10 + 0.06 * h);
	vec2 pa = p - tail, ba = head - tail;
	float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
	float d = length(pa - ba * hh);
	float streak = exp(-d * 2200.0) + exp(-d * 640.0) * 0.10;
	return streak * pow(hh, 2.6) * sin(u * 3.14159) * live * vec3(0.86, 0.92, 1.0) * 1.2;
}

// a disc with an edge exactly a pixel soft however small the sheet
float disc(vec3 d, vec3 c, float r, out float rr) {
	float x = length(d - c);   // chord: precise where acos is not
	rr = x / r;
	float w = max(fwidth(x), 1e-5);
	return 1.0 - smoothstep(r - w, r + w, x);
}

void main() {
	vec3 d = normalize(vDir);
	float e = d.y;
	float t = uTime;
	// footprints on the two planes, taken here where every pixel runs them
	float dn = max(-e, 0.004);
	vec2 floorP = d.xz * (SEA_B / dn);
	gX = dFdx(floorP);
	gY = dFdy(floorP);
	float up = max(e, 0.004);
	vec2 roofP = d.xz / (up + 0.035);
	vec2 rX = dFdx(roofP), rY = dFdy(roofP);
	// while the view holds still, each frame redraws half the sheet
	if (uParity >= 0.0 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y) + uParity, 2.0) < 1.0) discard;

	// the sun, sinking under the cloud as the lights go down
	vec3 s = uSun;
	float E = uE;   // the sun's irradiance, in the units the grade expects

	Hit hit;
	hit.ok = 0.0;
	if (e < 0.0) hit = marchSea(d);
	float tb = SEA_B / dn;

	float hc = 0.0;
	// the high cloud goes where it would be finer than a pixel, near the
	// horizon: there it is only streaks that crawl as the view moves
	float rFp = (length(rX) + length(rY)) * 0.19;
	if (e > 0.0) hc = highC(roofP, rX, rY) * uHigh * smoothstep(0.02, 0.12, e) * (1.0 - smoothstep(0.04, 0.16, rFp));
	vec3 up3 = vec3(0.0, 1.0, 0.0);

	vec3 col = vec3(0.0);
	// how many puffs one pixel spans on the cloud below
	float farBlur = smoothstep(0.012, 0.06, (length(gX) + length(gY)) * uSea);

	if (uMix > 0.001) {
		vec3 day;
		// Above the horizon the table is read higher than the eye looks: the
		// picture shows only the first few degrees of sky, where the real
		// thing is still milky, and a sky that deepens to blue toward the top
		// of the frame is what an afternoon over the cloud is remembered as.
		vec3 dA = d;
		if (e > 0.0) {
			float eL = 1.0 - pow(1.0 - e, uLift);
			dA = vec3(0.0, eL, 0.0);
			dA.xz = d.xz / max(length(d.xz), 1e-4) * sqrt(max(0.0, 1.0 - eL * eL));
		}
		vec4 air = sky(uLutDay, dA, s);
		vec3 zen = sky(uLutDay, up3, s).rgb * E;
		vec3 away = sky(uLutDay, normalize(vec3(-s.x, 0.02, -s.z)), s).rgb * E;
		vec3 near = sky(uLutDay, normalize(vec3(s.x, 0.02, s.z)), s).rgb * E;
		// the light of the whole sky on a level white surface, over pi
		vec3 amb = zen * 0.72 + away * 0.2 + near * 0.08;
		if (e >= 0.0) {
			day = air.rgb * E;
			// and a little richer than the table, which the grade would pale
			day = max(mix(vec3(dot(day, vec3(0.2126, 0.7152, 0.0722))), day, uSkySat), 0.0);
			if (hc > 0.0) {
				// lit from below and the side by a sun at the horizon: gilt
				// bellies near it, blue-grey ones away from it
				float mu = dot(d, s);
				float toward = hc - highC(roofP + normalize(s.xz) * 0.9, rX, rY);
				float edge = clamp(0.35 - toward * 1.6, 0.0, 1.0);
				vec3 lit = uSunHigh * E * (phaseHG(mu, 0.5) * 0.55 + 0.035) * (0.35 + 0.65 * edge);
				vec3 cc = lit + zen * 0.78 * (1.1 - hc * 0.35);
				day = mix(day, cc, hc * 0.88);
			}
		} else {
			vec3 cloud = shadeSea(hit, d, s, uSunCloud * E * 0.62, amb, tb);
			// the gaps: clear air all the way down, pale near the horizon
			// and deepening to blue as the eye looks further down into it
			vec3 low = sky(uLutDay, normalize(vec3(d.x, 0.04, d.z)), s).rgb * E;
			vec3 gap = mix(low * 0.95, mix(zen, low, 0.4) * 1.12, smoothstep(0.0, 0.2, -e));
			// a cloud's edge is thin, and the blue shows through it
			day = mix(gap, cloud, hit.ok * smoothstep(0.004, 0.12, hit.h));
			// Toward the horizon a pixel spans more than a puff, and whether the
			// ray hits one or slips between is chance: as the view moves it
			// crawls. There the sea is drawn as its own average, a soft band.
			vec3 avg = mix(gap, uSunCloud * E * 0.62 * 0.19 + amb * 0.55, 0.55);
			day = mix(day, avg, farBlur);
			// and at the horizon itself the far haze meets the sky with no line
			day = mix(day, low, (1.0 - smoothstep(0.0, 0.045, -e)) * 0.85);
			// and the air between, from the table, which stops at the cloud;
			// held light, or the whole sea goes to milk
			day = day * mix(air.a, 1.0, 0.6) + air.rgb * E * 0.32;
		}
		// the sun: a disc darkened toward its limb, which is what makes it
		// round rather than a hole in the sky
		float rr;
		float sd = disc(d, s, 0.0095, rr);
		float limb = 0.5 + 0.5 * sqrt(max(0.0, 1.0 - rr * rr));
		float over = (e < 0.0 ? 1.0 - hit.ok : 1.0) * (1.0 - hc);
		day += uSunEye * E * 7.0 * sd * limb * over;
		col += day * uMix;
	}

	float moonVis = 0.0;
	if (uMix < 0.999) {
		// The blue hour is mostly light scattered many times over, which the
		// table (one bounce) does not carry: so the night's air is drawn, not
		// computed — indigo overhead, a paler band low down, the moon's glow.
		vec3 night;
		vec3 zenN = vec3(0.0042, 0.0068, 0.022);
		vec3 horN = vec3(0.019, 0.024, 0.05);
		float mu = dot(d, uMoon);
		vec3 moonAir = uMoonLight * (phaseHG(mu, 0.8) * 0.35 + phaseR(mu) * 0.12) * 0.05;
		vec3 amb = zenN * 1.7 + horN * 0.35;
		if (e >= 0.0) {
			night = mix(horN, zenN, pow(e, 0.45)) + moonAir;
			float az = atan(d.z, d.x);
			float el = asin(clamp(e, -1.0, 1.0));
			vec2 p = vec2(az * cos(el), el) * 3.8;
			vec3 bandN = normalize(vec3(0.35, 0.55, -0.76));
			float band = exp(-pow(dot(d, bandN) * 3.2, 2.0));
			band *= 0.35 + 0.65 * textureGrad(uCloud, d.xz * 0.9 + d.y * 0.3, rX * 0.01, rY * 0.01).b;
			float fade = smoothstep(0.0, 0.14, e) * (1.0 - hc * 0.9);
			night += band * vec3(0.010, 0.012, 0.022) * fade;
			night += starField(p, t, band) * fade * uStars * 0.9;
			night += meteor(vec2(az, el), t, 0.0) * uStars * fade;
			if (hc > 0.0) {
				// the high cloud by moonlight: grey, silvered near the moon
				vec3 cc = uMoonLight * (0.03 + phaseHG(mu, 0.6) * 0.8) + amb * 0.55;
				night = mix(night, cc, hc * 0.85);
			}
		} else {
			vec3 cloud = shadeSea(hit, d, uMoon, uMoonLight, amb, tb);
			vec3 gap = amb * 0.4;
			night = mix(gap, cloud, hit.ok * smoothstep(0.004, 0.12, hit.h));
			night = mix(night, mix(gap, uMoonLight * 0.19 + amb * 0.55, 0.55), farBlur);
			// the moon's lane across the tops beneath it
			float lane = exp(-abs(atan(d.x, -d.z) - atan(uMoon.x, -uMoon.z)) * 6.0 / (dn * 4.0 + 0.12));
			night += uMoonLight * 0.05 * lane * hit.ok * smoothstep(0.2, 0.8, hit.h);
			// into the band low down with distance
			float haze = 1.0 - exp(-hit.t * 0.026);
			night = mix(night, horN + moonAir, haze);
		}
		// the moon itself is drawn over the sheet at the screen's own
		// resolution (BACK_F); here only whether it can be seen, into alpha:
		// it sets behind the cloud, and is gone before it could show through
		// a gap beneath the horizon
		float overM = (e < 0.0 ? (1.0 - hit.ok) * (1.0 - smoothstep(0.0, 0.035, -e)) : 1.0) * (1.0 - hc * 0.75);
		moonVis = overM;
		// its halo in the damp air
		float ma = length(d - uMoon);
		night += vec3(0.5, 0.56, 0.72) * (exp(-ma * 34.0) * 0.12 + exp(-ma * 6.0) * 0.012) * overM;
		col += night * (1.0 - uMix);
	}

	gl_FragColor = vec4(max(col, 0.0), moonVis);
}
`;

// The sky-view table. Each texel is one direction: azimuth from the sun
// across, elevation up (rows crowded toward the horizon). Along it, sunlight
// scattered once toward the eye, summed in 24 steps; downward rays stop at
// the cloud tops, and alpha keeps how much of the cloud shows through the air.
const LUT_F = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSunEl;
uniform float uMie;
uniform float uPath;
${ATMO}
void main() {
	float phi = vUv.x * PI;
	float sv = vUv.y * 2.0 - 1.0;
	float el = sign(sv) * sv * sv * PI * 0.5;
	vec3 d = vec3(sin(phi) * cos(el), sin(el), cos(phi) * cos(el));
	vec3 sun = vec3(0.0, sin(uSunEl), cos(uSunEl));
	vec3 o = vec3(0.0, RP + EYE, 0.0);
	float tMax;
	if (d.y < 0.0) tMax = min((EYE - CLOUD) / max(-d.y, 1e-4), uPath);
	else {
		float b = dot(o, d);
		float c = dot(o, o) - RA * RA;
		tMax = min(-b + sqrt(max(b * b - c, 0.0)), uPath);
	}
	float mu = dot(d, sun);
	float pR = phaseR(mu), pM = phaseHG(mu, 0.8);
	vec3 L = vec3(0.0), tau = vec3(0.0);
	const int N = 24;
	for (int i = 0; i < N; i++) {
		float t0 = tMax * pow(float(i) / float(N), 2.0);
		float t1 = tMax * pow(float(i + 1) / float(N), 2.0);
		float ds = t1 - t0;
		vec3 p = o + d * (0.5 * (t0 + t1));
		float r = length(p);
		float h = r - RP;
		float dR = exp(-h / 8.0), dM = exp(-h / 1.2), dO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
		vec3 ext = BR * dR + BME * uMie * dM + BO * dO;
		vec3 Ts = exp(-(tau + ext * ds * 0.5 + sunTau(r, dot(p / r, sun))));
		L += Ts * (BR * dR * pR + BMS * uMie * dM * pM) * ds;
		tau += ext * ds;
	}
	// a little for all the light scattered more than once
	L += L * vec3(0.18, 0.22, 0.3);
	gl_FragColor = vec4(L, dot(exp(-tau), vec3(0.2126, 0.7152, 0.0722)));
}
`;

// The cloud's shapes, baked once: a tileable RGBA sheet the sky reads with
// hardware filtering, which is both cheaper than noise evaluated per pixel
// and free of the shimmer noise has when its features fall under a pixel.
//   r  cumulus tops: domes on domes, gathered into towers and valleys
//   g  altocumulus: small puffs in drifts
//   b  fine fbm, for the moon's seas and the Milky Way's dust
//   a  a slow fbm, to vary the high cloud's cover
const BAKE_F = /* glsl */ `
precision highp float;
varying vec2 vUv;
vec2 h22(vec2 p) {
	vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	q += dot(q, q.yzx + 33.33);
	return fract((q.xx + q.yz) * q.zy);
}
// every noise wraps on the unit square: cells are taken modulo the period
float domes(vec2 uv, float P, float seed) {
	vec2 p = uv * P;
	vec2 i = floor(p), f = fract(p);
	float best = 0.0;
	for (int y = -1; y <= 1; y++)
		for (int x = -1; x <= 1; x++) {
			vec2 g = vec2(float(x), float(y));
			vec2 o = h22(mod(i + g, P) + seed);
			float r = 0.62 + 0.36 * o.x;
			vec2 dv = (g + o - f) / r;
			float s = 1.0 - dot(dv, dv);
			if (s > 0.0) best = max(best, sqrt(s) * (0.55 + 0.45 * o.y));
		}
	return best;
}
float grad(vec2 uv, float P, float seed) {
	vec2 p = uv * P;
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	float n = 0.0;
	for (int y = 0; y <= 1; y++)
		for (int x = 0; x <= 1; x++) {
			vec2 g = vec2(float(x), float(y));
			vec2 a = h22(mod(i + g, P) + seed) * 6.2831853;
			float v = dot(vec2(cos(a.x), sin(a.x)), f - g);
			n += v * (x == 0 ? 1.0 - u.x : u.x) * (y == 0 ? 1.0 - u.y : u.y);
		}
	return n * 1.4;
}
float fbm(vec2 uv, float P, float seed) {
	float s = 0.0, a = 0.5;
	for (int i = 0; i < 5; i++) {
		s += grad(uv, P, seed + float(i) * 17.0) * a;
		P *= 2.0;
		a *= 0.5;
	}
	return s;
}
void main() {
	vec2 uv = vUv;
	vec2 w = vec2(fbm(uv, 3.0, 1.0), fbm(uv, 3.0, 9.0)) * 0.035;
	float big = domes(uv + w, 5.0, 3.0);
	float mid = domes(uv + w * 1.6, 11.0, 7.0);
	float small = domes(uv + w * 2.2, 23.0, 11.0);
	float fine = domes(uv, 47.0, 13.0);
	float heap = big * 0.56 + mid * 0.3 + small * 0.15 + fine * 0.06;
	float cover = smoothstep(-0.42, 0.5, fbm(uv, 2.0, 21.0));
	float r = heap * (0.38 + 0.62 * cover) + 0.1 * cover;
	float alto = domes(uv + w * 3.0, 29.0, 31.0) * smoothstep(-0.25, 0.45, fbm(uv, 4.0, 41.0));
	float b = fbm(uv, 8.0, 51.0) * 0.5 + 0.5;
	float a = fbm(uv, 2.0, 61.0) * 0.5 + 0.5;
	gl_FragColor = vec4(r, alto, b, a);
}
`;

// The sky is soft, so it is drawn into a smaller sheet than the screen and
// laid behind the scene by a copy that costs nothing.
const BACK_V = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = position.xy * 0.5 + 0.5;
	gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;
const BACK_F = /* glsl */ `
uniform sampler2D uSky;
uniform vec2 uTexel;
uniform sampler2D uMoonTex;
uniform vec3 uMoon;
uniform float uMoonOn;
uniform vec2 uMoonGain;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
varying vec2 vUv;
void main() {
	// four taps on a rotated grid, half a texel out: the edges of cloud
	// against cloud behind it are a hard step in the sheet, and this is
	// their antialiasing
	vec2 a = uTexel * vec2(0.42, 0.18), b = uTexel * vec2(-0.18, 0.42);
	vec4 s = texture2D(uSky, vUv + a) + texture2D(uSky, vUv - a)
		+ texture2D(uSky, vUv + b) + texture2D(uSky, vUv - b);
	vec3 c = s.rgb * 0.25;
	if (uMoonOn > 0.001) {
		// The moon, as the old site had it: a painting of the full moon, laid
		// on its disc in the disc's own frame. It is drawn here, at the
		// screen's resolution, since in the sheet it would be soft; the sheet
		// says, in alpha, how much cloud is in front of it.
		vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
		vec3 d = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
		float x = length(d - uMoon);
		if (x < 0.02) {
			float w = max(fwidth(x), 1e-5);
			float md = 1.0 - smoothstep(0.0165 - w, 0.0165 + w, x);
			vec3 mR = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0)));
			vec3 mU = cross(mR, uMoon);
			vec2 mp = vec2(dot(d - uMoon, mR), dot(d - uMoon, mU)) / 0.0165;
			// read a little inside the painting's own edge, and with the old
			// site's brightness(1.28) contrast(1.06): its darkest sea stays
			// well above the night, so the limb is a clean circle all round
			float face = texture2D(uMoonTex, 0.5 + mp * 0.415).r;
			float v = clamp((face * 1.28 - 0.5) * 1.06 + 0.5, 0.0, 1.0);
			vec3 moon = vec3(1.0, 0.975, 0.93) * uMoonGain.x * pow(v, uMoonGain.y);
			c = mix(c, moon, md * s.a * 0.25 * uMoonOn);
		}
	}
	gl_FragColor = vec4(c, 1.0);
}
`;

/**
 * The moon the old site had (Open Clipart, CC0), drawn into a canvas once it
 * has loaded; until then a plain pale disc. Its grey is read as it is, not as
 * sRGB, since it is a picture of brightness rather than a colour.
 */
function moonTexture() {
	const c = document.createElement('canvas');
	c.width = c.height = 512;
	const g = c.getContext('2d')!;
	g.fillStyle = '#c8c8c8';
	g.fillRect(0, 0, 512, 512);
	const tex = new THREE.CanvasTexture(c);
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.anisotropy = 4;
	const img = new Image();
	img.onload = () => {
		// under it the painting's own mid grey, so nothing dark rings the rim
		g.fillStyle = '#8c8c8c';
		g.fillRect(0, 0, 512, 512);
		g.drawImage(img, 0, 0, 512, 512);
		tex.needsUpdate = true;
	};
	img.src = '/media/moon.svg';
	return tex;
}

export function createSky() {
	const cloud = new THREE.WebGLRenderTarget(512, 512, {
		depthBuffer: false,
		wrapS: THREE.RepeatWrapping,
		wrapT: THREE.RepeatWrapping,
		minFilter: THREE.LinearMipmapLinearFilter,
		magFilter: THREE.LinearFilter,
		generateMipmaps: true
	});
	const lutOpts = {
		depthBuffer: false,
		type: THREE.HalfFloatType,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		wrapS: THREE.ClampToEdgeWrapping,
		wrapT: THREE.ClampToEdgeWrapping,
		generateMipmaps: false
	};
	const lutDay = new THREE.WebGLRenderTarget(256, 192, lutOpts);
	const uniforms = {
		uTime: U.uTime,
		uMix: { value: 1 },
		uSun: { value: new THREE.Vector3(0.7, 0.06, -0.7).normalize() },
		uMoon: { value: new THREE.Vector3(-0.55, 0.52, -0.65).normalize() },
		uStars: { value: 1 },
		uSea: { value: 0.32 },
		uCloud: { value: cloud.texture },
		uLift: { value: 7.5 },
		uSkySat: { value: 1.45 },
		uHigh: { value: 1 },
		uLutDay: { value: lutDay.texture },
		uE: { value: 16 },
		uCover: { value: 0.52 },
		uSunEye: { value: new THREE.Color() },
		uSunCloud: { value: new THREE.Color() },
		uSunHigh: { value: new THREE.Color() },
		uMoonLight: { value: new THREE.Color(0.2, 0.245, 0.35) },
		uParity: { value: -1 }
	};
	const mat = new THREE.ShaderMaterial({
		uniforms,
		vertexShader: VERT,
		fragmentShader: FRAG,
		side: THREE.BackSide,
		depthWrite: false,
		depthTest: false,
		fog: false,
		toneMapped: false
	});
	const mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), mat);
	mesh.renderOrder = -1000;
	mesh.frustumCulled = false;
	mesh.onBeforeRender = (_r, _s, camera) => {
		mesh.position.copy(camera.position);
		mesh.updateMatrixWorld();
	};
	const scene = new THREE.Scene();
	scene.add(mesh);

	const target = new THREE.WebGLRenderTarget(2, 2, {
		depthBuffer: false,
		type: THREE.HalfFloatType,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		generateMipmaps: false
	});
	const tri = new THREE.BufferGeometry();
	tri.setAttribute(
		'position',
		new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
	);
	const backdrop = new THREE.Mesh(
		tri,
		new THREE.ShaderMaterial({
			uniforms: {
				uSky: { value: target.texture },
				uTexel: { value: new THREE.Vector2(0.5, 0.5) },
				uMoonTex: { value: moonTexture() },
				uMoon: uniforms.uMoon,
				uMoonOn: { value: 0 },
				uMoonGain: { value: new THREE.Vector2(2.4, 2.2) },
				uProjInv: { value: new THREE.Matrix4() },
				uCamWorld: { value: new THREE.Matrix4() }
			},
			vertexShader: BACK_V,
			fragmentShader: BACK_F,
			depthWrite: false,
			depthTest: false,
			toneMapped: false
		})
	);
	backdrop.renderOrder = -1000;
	backdrop.frustumCulled = false;
	// the camera the sheet was last drawn from, which the moon must share
	let skyCam: THREE.Camera | null = null;
	backdrop.onBeforeRender = (_r, _s, camera) => {
		const u = (backdrop.material as THREE.ShaderMaterial).uniforms;
		const c = skyCam ?? camera;
		u.uProjInv.value.copy(c.projectionMatrixInverse);
		u.uCamWorld.value.copy(c.matrixWorld);
		// the moon stays out in the first of the daylight, as it does, and
		// has set by the time the day is full
		u.uMoonOn.value = 1 - THREE.MathUtils.smoothstep(uniforms.uMix.value, 0.55, 0.85);
	};

	let baked = false;
	const lutMat = new THREE.ShaderMaterial({
		// a clear afternoon: little haze, and the horizon's path held short so
		// the low sky stays blue rather than going to milk
		uniforms: { uSunEl: { value: 0 }, uMie: { value: 0.35 }, uPath: { value: 160 } },
		vertexShader: BACK_V,
		fragmentShader: LUT_F
	});
	const lutQuad = new THREE.Mesh(tri, lutMat);
	lutQuad.frustumCulled = false;
	const lutScene = new THREE.Scene();
	lutScene.add(lutQuad);
	const flat = new THREE.Camera();
	let drawn = 99;
	const drawLut = (renderer: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget, el: number) => {
		lutMat.uniforms.uSunEl.value = el;
		const prev = renderer.getRenderTarget();
		renderer.setRenderTarget(rt);
		renderer.render(lutScene, flat);
		renderer.setRenderTarget(prev);
	};
	return {
		mesh,
		uniforms,
		lutUniforms: lutMat.uniforms,
		/** redraw the table on the next update */
		redraw() {
			drawn = 99;
		},
		backdrop,
		/** draw the cloud's shapes into their sheet, once */
		bake(renderer: THREE.WebGLRenderer) {
			if (baked) return;
			baked = true;
			cloud.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
			const q = new THREE.Mesh(
				tri,
				new THREE.ShaderMaterial({ vertexShader: BACK_V, fragmentShader: BAKE_F })
			);
			q.frustumCulled = false;
			const s = new THREE.Scene();
			s.add(q);
			const prev = renderer.getRenderTarget();
			renderer.setRenderTarget(cloud);
			renderer.render(s, new THREE.Camera());
			renderer.setRenderTarget(prev);
			(q.material as THREE.Material).dispose();
		},
		/** redraw the tables if the sun has moved, and the light it gives */
		update(renderer: THREE.WebGLRenderer) {
			const el = Math.asin(THREE.MathUtils.clamp(uniforms.uSun.value.y, -1, 1));
			if (Math.abs(el - drawn) > 1e-4) {
				drawn = el;
				drawLut(renderer, lutDay, el);
				sunLight(el, 3.0, uniforms.uSunEye.value);
				sunLight(el, 1.6, uniforms.uSunCloud.value);
				sunLight(el, 6.5, uniforms.uSunHigh.value);
			}
		},
		/** size the sheet: the screen's pixels, up to a budget */
		setSize(px: number, py: number, budget: number) {
			const s = Math.min(1, Math.sqrt(budget / Math.max(1, px * py)));
			const w = Math.max(2, Math.round(px * s)),
				h = Math.max(2, Math.round(py * s));
			if (target.width !== w || target.height !== h) target.setSize(w, h);
			(backdrop.material as THREE.ShaderMaterial).uniforms.uTexel.value.set(1 / w, 1 / h);
		},
		/** draw the sheet: all of it, or one colour of the chequer */
		render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, parity = -1) {
			uniforms.uParity.value = parity;
			skyCam = camera;
			const prev = renderer.getRenderTarget();
			const clear = renderer.autoClear;
			renderer.autoClear = false;
			renderer.setRenderTarget(target);
			renderer.render(scene, camera);
			renderer.setRenderTarget(prev);
			renderer.autoClear = clear;
		}
	};
}

/** Sunlight after the air, at an altitude in kilometres, for a sun at an
 *  elevation in radians: the sky shader's own sums (Rayleigh, Mie, ozone,
 *  Schüler's Chapman), done once on the CPU for the island's light. */
export function sunLight(el: number, alt = 3.0, out = new THREE.Color()) {
	const RP = 6360,
		LN2 = Math.LN2;
	const chapman = (X: number, h: number, c: number) => {
		const s = Math.sqrt(X + h);
		if (c >= 0) return (s / (s * c + 1)) * Math.pow(2, -h);
		const x0 = Math.sqrt(1 - c * c) * (X + h);
		return 2 * Math.sqrt(x0) * Math.pow(2, X - x0) - (s / (1 - s * c)) * Math.pow(2, -h);
	};
	const c = Math.sin(el);
	const cR = chapman(RP / (8 * LN2), alt / (8 * LN2), c) * 8;
	const cM = chapman(RP / (1.2 * LN2), alt / (1.2 * LN2), c) * 1.2;
	const BR = [5.802e-3, 13.558e-3, 33.1e-3],
		BO = [0.65e-3, 1.881e-3, 0.085e-3],
		BME = 6.1e-3;
	const tau = (i: number) => (BR[i] + BO[i] * 1.875) * cR + BME * cM;
	return out.setRGB(Math.exp(-tau(0)), Math.exp(-tau(1)), Math.exp(-tau(2)));
}
