import * as THREE from 'three';
import { U } from '../shared';

// ─── The wind in the trees ────────────────────────────────────────────────
// A tree bends, it is not pushed: the whole of it leans about its foot by an
// angle that grows with height — height, not distance along the wood, so
// that any two pieces of the crown near each other in space lean together
// and cannot scissor through one another, however differently they are
// connected. Over that lean a slow sway, a smooth field in space, so the
// crown moves in masses and not as one rigid thing; and each leaf turns on
// its own stalk, which bounds how far any leaf can go by its own length.
//
// A touch sends a gust through one crown: a wave travelling out from the
// hand and dying away, in the same sway and in the leaves' turning. And
// wherever the pointer rests, the leaves near it part a little.
//
// The same sums run on the CPU for the birds, so a perched bird stays on
// its twig.

export const WIND_U = {
	uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
	uRustle: { value: new THREE.Vector4(0, -100, 0, -100) },
	uRustleAmp: { value: 0 }
};

export const FLORA_WIND = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
uniform vec4 uRustle;
uniform float uRustleAmp;
uniform vec3 uPtr;
uniform float uPtrAmp;

vec3 rotAxis(vec3 v, vec3 a, float ang) {
	float c = cos(ang), s = sin(ang);
	return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);
}
float gust(float t, float travel) {
	return sin(t * 0.83 - travel) * 0.5 + sin(t * 1.61 - travel * 1.7 + 1.3) * 0.3
		+ sin(t * 0.31 - travel * 0.5) * 0.2;
}
// how hard the last touch is still shaking things at p: a ring running out
// from the hand at a few metres a second, dying as it goes
float rustleAt(vec3 p) {
	float dt = uTime - uRustle.w;
	if (dt < 0.0 || dt > 4.0) return 0.0;
	float d = distance(p, uRustle.xyz);
	float front = dt * 3.2 - d;
	return uRustleAmp * exp(-dt * 1.4) * exp(-d * 0.45) * smoothstep(-0.6, 0.4, front)
		* sin(front * 7.0);
}
// the lean and sway of a point of the plant whose foot is base.xyz and whose
// height is base.w; flex is how much it gives (wood stiffens toward the root)
vec3 bendTree(vec3 p, vec4 base, float flex) {
	float h = clamp((p.y - base.y) / base.w, 0.0, 1.4);
	float w = h * h;
	vec3 dir = normalize(vec3(uWindDir.x, 0.0, uWindDir.y));
	float travel = dot(p.xz, uWindDir) * 0.18;
	float g = gust(uTime, travel);
	float lean = (0.35 + 0.65 * g) * uWind * 0.045 * w;
	vec3 axis = normalize(cross(vec3(0.0, 1.0, 0.0), dir));
	vec3 q = base.xyz + rotAxis(p - base.xyz, axis, lean);
	// the slow sway, a field in space: masses of the crown move together
	vec3 f = p * 0.55;
	vec3 sway = vec3(
		sin(uTime * 1.13 + f.x * 1.3 + f.z * 0.7 + f.y * 0.4),
		sin(uTime * 0.97 + f.y * 1.1 + f.x * 0.6) * 0.35,
		cos(uTime * 1.27 + f.z * 1.2 - f.y * 0.8)
	) * (0.028 * uWind * w * flex);
	float rs = rustleAt(p);
	sway += vec3(0.7, 0.25, -0.5) * rs * 0.07 * h * flex;
	return q + sway;
}
// the leaves near the pointer part and lift: a smooth field, never a pick
vec3 partAt(vec3 p) {
	vec3 d = p - uPtr;
	float k = uPtrAmp * smoothstep(1.3, 0.0, length(d));
	return (normalize(d + vec3(0.0, 0.001, 0.0)) + vec3(0.0, 0.5, 0.0)) * k * 0.12;
}
`;

// ── the CPU's copy, for birds on twigs ──
const gust = (t: number, travel: number) =>
	Math.sin(t * 0.83 - travel) * 0.5 +
	Math.sin(t * 1.61 - travel * 1.7 + 1.3) * 0.3 +
	Math.sin(t * 0.31 - travel * 0.5) * 0.2;

const _a = new THREE.Vector3(),
	_d = new THREE.Vector3(),
	_v = new THREE.Vector3(),
	_q = new THREE.Quaternion();

/** Where the wind has a point of a plant (foot `base`, height `h`) now. */
export function bendTree(
	p: THREE.Vector3,
	base: THREE.Vector3,
	height: number,
	flex: number,
	out: THREE.Vector3
) {
	const t = U.uTime.value,
		wind = U.uWind.value;
	const wd = WIND_U.uWindDir.value;
	const h = Math.min(Math.max((p.y - base.y) / height, 0), 1.4);
	const w = h * h;
	const travel = (p.x * wd.x + p.z * wd.y) * 0.18;
	const lean = (0.35 + 0.65 * gust(t, travel)) * wind * 0.045 * w;
	_d.set(wd.x, 0, wd.y).normalize();
	_a.set(0, 1, 0).cross(_d).normalize();
	_q.setFromAxisAngle(_a, lean);
	_v.copy(p).sub(base).applyQuaternion(_q).add(base);
	const fx = p.x * 0.55,
		fy = p.y * 0.55,
		fz = p.z * 0.55;
	const k = 0.028 * wind * w * flex;
	out.set(
		_v.x + Math.sin(t * 1.13 + fx * 1.3 + fz * 0.7 + fy * 0.4) * k,
		_v.y + Math.sin(t * 0.97 + fy * 1.1 + fx * 0.6) * 0.35 * k,
		_v.z + Math.cos(t * 1.27 + fz * 1.2 - fy * 0.8) * k
	);
	return out;
}

/** Shake one crown from the point touched. */
export function rustleFrom(p: THREE.Vector3, amp = 1) {
	WIND_U.uRustle.value.set(p.x, p.y, p.z, U.uTime.value);
	WIND_U.uRustleAmp.value = amp;
}

export function windUniforms() {
	return {
		uTime: U.uTime,
		uWind: U.uWind,
		uPtr: U.uPtr,
		uPtrAmp: U.uPtrAmp,
		uWindDir: WIND_U.uWindDir,
		uRustle: WIND_U.uRustle,
		uRustleAmp: WIND_U.uRustleAmp
	};
}
