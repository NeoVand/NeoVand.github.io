import * as THREE from 'three';
import { U } from './shared';

// ─── The sky ──────────────────────────────────────────────────────────────
// The flat grove's weather, carried into three dimensions: the same gyroid
// FBM for the cloud, the same three sheets of stars with the Milky Way
// arriving as a crowding of them, the same meteor every half-minute or so.
// What changes is that it is read off the direction of a ray rather than a
// place on the screen, so it holds still in the world while the camera
// moves through it. The cloud overhead is a plane the ray meets, which is
// exactly the perspective the old shader faked with its 1/uv.y; and the
// island floats, so below the horizon there is more sky — a sea of cloud,
// lit from the side by a sun that is almost down.

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = position;
	vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	gl_Position = p.xyww;
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

float gyroid(vec3 p) { return dot(sin(p), cos(p.yzx)); }
float fbmG(vec3 p, float t, float w, float aa) {
	float r = 0.0, a = 0.5;
	for (int i = 0; i < 4; i++) {
		p.z += t + r * w;
		r += abs(gyroid(p / a)) * a;
		a /= aa;
	}
	return r;
}
float h21(vec2 p) {
	vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	q += dot(q, q.yzx + 33.33);
	return fract((q.x + q.y) * q.z);
}
vec2 h22(vec2 p) {
	vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	q += dot(q, q.yzx + 33.33);
	return fract((q.xx + q.yz) * q.zy);
}
// a cloud top seen from above is a heap of domes: each cell of a Worley
// field is one puff, and three octaves of them make the cauliflower
// Each returns the height and its slope together — the slope of a dome is
// known exactly — so the light on a cloud costs one pass, not two samples.
vec3 dome(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec3 best = vec3(0.0);
	for (int y = -1; y <= 1; y++)
		for (int x = -1; x <= 1; x++) {
			vec2 g = vec2(float(x), float(y));
			vec2 o = h22(i + g);
			float r = 0.55 + 0.35 * o.x;
			vec2 dv = (g + o - f) / r;
			float s = max(0.0, 1.0 - dot(dv, dv));
			float k = 0.6 + 0.4 * o.y;
			float h = sqrt(s) * k;
			if (h > best.x) best = vec3(h, k * dv / (r * max(sqrt(s), 0.08)));
		}
	return best;
}
vec3 puffs(vec2 p, float lod) {
	vec3 a = dome(p) * 0.62;
	vec3 b = dome(p * 2.3 + 3.7) * (0.28 * lod);
	b.yz *= 2.3;
	vec3 c = dome(p * 5.1 + 9.1) * (0.12 * lod * lod);
	c.yz *= 5.1;
	return a + b + c;
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
		float on = step(0.855 + fi * 0.045 - band * 0.09, h);
		vec2 off = vec2(h21(id + fi * 7.1 + 2.3), h21(id + fi * 7.1 + 5.9)) - 0.5;
		float d = length(f - off * 0.72) / dens;
		float core = exp(-d * (760.0 - fi * 90.0));
		float halo = exp(-d * 190.0) * 0.07;
		float tw = 0.45 + 0.55 * sin(t * (0.5 + h * 1.7) + h * 63.0);
		float lum = (0.18 + 0.62 * h21(id + fi * 13.3)) * (1.0 - fi * 0.32);
		vec3 tint = mix(vec3(0.74, 0.83, 1.0), vec3(1.0, 0.91, 0.76), h21(id + fi * 3.7));
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
	return streak * pow(hh, 2.6) * sin(u * 3.14159) * live * vec3(0.86, 0.92, 1.0) * 0.65;
}

void main() {
	vec3 d = normalize(vDir);
	float e = d.y;
	vec3 col = vec3(0.0);
	float t = uTime;

	// ── day: a quarter to eight on a summer evening ──
	if (uMix > 0.001) {
		vec3 hor = vec3(0.985, 0.78, 0.60);
		vec3 zen = vec3(0.34, 0.47, 0.69);
		float sa = acos(clamp(dot(d, uSun), -1.0, 1.0));
		// the horizon is warmest under the sun and cooler round the back
		float toward = dot(normalize(vec2(d.x, d.z) + 1e-5), normalize(uSun.xz)) * 0.5 + 0.5;
		vec3 horz = mix(vec3(0.80, 0.76, 0.78), hor, 0.35 + 0.65 * toward);
		vec3 sky = mix(horz, zen, smoothstep(-0.02, 0.62, e));
		sky += vec3(1.0, 0.66, 0.36) * exp(-sa * 3.0) * 0.32;
		sky += vec3(1.0, 0.80, 0.55) * exp(-sa * 16.0) * 0.45;

		vec3 day = sky;
		if (e > 0.0) {
			// cloud on a plane overhead
			vec2 pc = d.xz / (e + 0.06);
			float tc = t * 0.016;
			vec3 q = vec3(pc * 0.42, 0.0);
			q.xy += vec2(tc * 2.0, 0.0);
			q.y += fbmG(q * 10.0, -tc * 3.0, 0.0, 1.9) * 0.07;
			float c = fbmG(q, tc, 0.3, 1.7) * 0.5 - 0.5;
			c *= smoothstep(0.02, 0.32, e);
			vec3 shade = vec3(0.72, 0.68, 0.78);
			vec3 lit = vec3(1.0, 0.84, 0.66);
			vec3 cloud = mix(shade, vec3(0.97, 0.93, 0.92), smoothstep(0.02, 0.34, c));
			cloud = mix(cloud, lit, exp(-sa * 1.4) * 0.9);
			day = mix(sky, cloud, smoothstep(0.0, 0.16, c) * 0.92);
			// long thin streaks of stratus just over the horizon, gilt from below
			float az = atan(d.x, -d.z);
			float band = smoothstep(0.012, 0.035, e) * smoothstep(0.16, 0.06, e);
			float st = fbmG(vec3(az * 7.0 + tc * 0.4, e * 90.0, 0.0), tc * 0.3, 0.2, 2.1);
			st = smoothstep(0.95, 1.55, st) * band;
			vec3 streak = mix(vec3(0.84, 0.66, 0.66), vec3(1.0, 0.8, 0.56), 0.35 + 0.65 * toward);
			day = mix(day, streak, st * 0.7);
		} else {
			// the sea of cloud below: a field of heights, lit from the side.
			// Its slope toward the sun is read off a second sample taken a
			// step along the sun's bearing, which is all the normal a cloud top
			// lit from almost level needs.
			float de = -e;
			vec2 pc = d.xz / (de + 0.015);
			float tc = t * 0.012;
			vec2 q = pc * uSea + vec2(tc, tc * 0.35);
			// fine octaves give way with distance, before they can shimmer
			float lod = smoothstep(0.03, 0.16, de);
			vec2 sd2 = normalize(uSun.xz);
			vec3 hp = puffs(q, lod);
			float top = smoothstep(0.08, 0.75, hp.x);
			float slope = dot(hp.yz, sd2);
			float lit = clamp(0.55 + slope * 0.55, 0.0, 1.0);
			vec3 gap = vec3(0.38, 0.39, 0.56);
			vec3 shade = vec3(0.66, 0.62, 0.74);
			vec3 sunlit = vec3(1.0, 0.83, 0.68);
			vec3 sea = mix(gap, shade, top);
			sea = mix(sea, sunlit, top * lit * (0.45 + 0.55 * toward));
			// a gilt edge on the tops nearest the sun
			sea += vec3(1.0, 0.72, 0.45) * pow(lit, 5.0) * top * (0.25 + 0.75 * exp(-sa * 1.6)) * 0.35;
			sea += vec3(1.0, 0.62, 0.34) * exp(-sa * 2.4) * 0.25;
			// thinning into the haze at the horizon
			day = mix(sea, horz, exp(-de * 9.0) * 0.92);
		}
		// the sun, a little softer than white
		float sa2 = acos(clamp(dot(d, uSun), -1.0, 1.0));
		day += vec3(1.0, 0.86, 0.66) * smoothstep(0.022, 0.017, sa2) * 1.4;
		col += day * uMix;
	}

	// ── night ──
	if (uMix < 0.999) {
		vec3 sky = vec3(0.0);
		if (e > -0.02) {
			float az = atan(d.z, d.x);
			float el = asin(clamp(e, -1.0, 1.0));
			// the flat sky counted two units to a screen's height; a screen here
			// is about half a radian, so the same density is nearly four to one
			vec2 p = vec2(az * cos(el), el) * 3.8;
			vec3 bandN = normalize(vec3(0.35, 0.55, -0.76));
			float band = exp(-pow(dot(d, bandN) * 3.2, 2.0));
			float neb = smoothstep(0.34, 1.0, fbmG(d * 9.0, t * 0.004, 0.25, 1.9));
			band *= 0.30 + 0.70 * neb;
			float fade = smoothstep(-0.02, 0.12, e);
			sky += band * vec3(0.016, 0.018, 0.030) * fade;
			sky += starField(p, t, band) * fade * uStars;
			sky += meteor(vec2(az, el), t, 0.0) * uStars;
		}
		float ma = acos(clamp(dot(d, uMoon), -1.0, 1.0));
		if (e < 0.0) {
			// the same sea of cloud, in moonlight: silver on the tops that face
			// the moon, and a path of light laid across it underneath
			float de = -e;
			vec2 pc = d.xz / (de + 0.015);
			float tc = t * 0.012;
			vec2 q = pc * uSea + vec2(tc, tc * 0.35);
			float lod = smoothstep(0.03, 0.16, de);
			vec2 md = normalize(uMoon.xz);
			vec3 hp = puffs(q, lod);
			float top = smoothstep(0.08, 0.75, hp.x);
			float lit = clamp(0.5 + dot(hp.yz, md) * 0.55, 0.0, 1.0);
			float mtoward = dot(normalize(d.xz + 1e-5), md) * 0.5 + 0.5;
			// cloud, not water: soft grey masses, their tops only a little silvered
			vec3 sea = mix(vec3(0.008, 0.01, 0.016), vec3(0.05, 0.056, 0.072), top);
			sea += vec3(0.07, 0.08, 0.1) * top * lit * (0.35 + 0.65 * mtoward);
			// the moon's path: a broad pale lane across the cloud under it
			float path = exp(-abs(atan(d.x, -d.z) - atan(uMoon.x, -uMoon.z)) * 5.0 / (de * 4.0 + 0.15));
			sea += vec3(0.10, 0.11, 0.14) * path * (0.3 + 0.7 * top);
			sky = mix(sea, vec3(0.04, 0.045, 0.06), exp(-de * 12.0) * 0.9);
		}
		// the moon: a lit disc, a little mottled, and a halo
		// the moon: a full disc, darker toward the limb, with the grey seas
		// laid across it — broad and soft, the way they look without a lens
		const float MR = 0.026;
		float disc = smoothstep(MR, MR - 0.0018, ma);
		vec3 mp = (d - uMoon) / MR;
		float seas = smoothstep(0.55, 1.05, fbmG(mp * 1.7 + vec3(1.3, 2.1, 0.4), 0.0, 0.15, 1.8));
		float limb = sqrt(max(0.0, 1.0 - pow(ma / MR, 2.0)));
		sky *= 1.0 - disc;
		sky += disc * vec3(0.94, 0.95, 0.97) * (0.93 - 0.2 * seas) * (0.78 + 0.22 * limb);
		sky += vec3(0.62, 0.68, 0.82) * exp(-ma * 26.0) * 0.14;
		sky += vec3(0.30, 0.36, 0.50) * exp(-ma * 5.0) * 0.07;
		col += sky * (1.0 - uMix);
	}

	// authored in display colour, as the flat sky was; taken to linear so the
	// same values light the scene when the sky is captured as its environment
	gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), 1.0);
	#include <colorspace_fragment>
}
`;

// The sky is soft — cloud, and stars drawn with a smooth falloff — so it is
// drawn into a smaller sheet than the screen and laid behind the scene by a
// copy that costs nothing: the flat site capped its sky under a retina
// viewport's worth of pixels for the same reason. The noise that breaks up
// banding goes on in the copy, in the screen's own pixels and colour.
const BACK_V = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = position.xy * 0.5 + 0.5;
	gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;
const BACK_F = /* glsl */ `
uniform sampler2D uSky;
uniform float uTime;
varying vec2 vUv;
float h21(vec2 p) {
	vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	q += dot(q, q.yzx + 33.33);
	return fract((q.x + q.y) * q.z);
}
void main() {
	gl_FragColor = texture2D(uSky, vUv);
	#include <colorspace_fragment>
	gl_FragColor.rgb += (h21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
	gl_FragColor.a = 1.0;
}
`;

export function createSky() {
	const uniforms = {
		uTime: U.uTime,
		uMix: { value: 1 },
		uSun: { value: new THREE.Vector3(0.7, 0.12, -0.7).normalize() },
		uMoon: { value: new THREE.Vector3(-0.55, 0.52, -0.65).normalize() },
		uStars: { value: 1 },
		uSea: { value: 0.28 }
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

	// the sheet: sRGB bytes, so the gradient keeps its steps in the darks
	const target = new THREE.WebGLRenderTarget(2, 2, {
		depthBuffer: false,
		colorSpace: THREE.SRGBColorSpace,
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
			uniforms: { uSky: { value: target.texture }, uTime: U.uTime },
			vertexShader: BACK_V,
			fragmentShader: BACK_F,
			depthWrite: false,
			depthTest: false,
			toneMapped: false
		})
	);
	backdrop.renderOrder = -1000;
	backdrop.frustumCulled = false;

	return {
		mesh,
		uniforms,
		backdrop,
		/** size the sheet: the screen's pixels, up to a budget */
		setSize(px: number, py: number, budget: number) {
			const s = Math.min(1, Math.sqrt(budget / Math.max(1, px * py)));
			const w = Math.max(2, Math.round(px * s)),
				h = Math.max(2, Math.round(py * s));
			if (target.width !== w || target.height !== h) target.setSize(w, h);
		},
		render(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
			const prev = renderer.getRenderTarget();
			renderer.setRenderTarget(target);
			renderer.render(scene, camera);
			renderer.setRenderTarget(prev);
		}
	};
}
