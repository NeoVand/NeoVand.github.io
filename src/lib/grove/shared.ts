import * as THREE from 'three';

// ─── What every material in the grove shares ──────────────────────────────
// One clock, one wind, one lamp. These objects are handed to every patched
// material by reference, so setting a value here reaches all of them.
export const U = {
	uTime: { value: 0 },
	/** 0 by day, 1 by night. By night the grove is a greyscale drawing. */
	uNight: { value: 0 },
	uWind: { value: 1 },
	/** where the pointer's ray meets the lawn, and how hard it is pushing */
	uPtr: { value: new THREE.Vector3(0, -100, 0) },
	uPtrAmp: { value: 0 },
	/** the light's direction in view space, for leaves lit from behind */
	uSunView: { value: new THREE.Vector3(0, 1, 0) },
	uSunColor: { value: new THREE.Color(1, 0.8, 0.6) }
};

// The wind is a smooth function of where a point stands, not of which branch
// it belongs to, so a mesh bent by it cannot open at any joint: two vertices
// in the same place move the same way. It grows with the square of height
// (a trunk barely moves, a crown sways) and with `flex`, which rises along
// a branch from the trunk out, so twigs shiver where limbs only lean.
export const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform vec3 uPtr;
uniform float uPtrAmp;
vec3 windOffset(vec3 p, float flex) {
	float h = max(p.y, 0.0);
	float t = uTime;
	float gust = 0.6 + 0.4 * sin(t * 0.23 + p.x * 0.04);
	float s1 = sin(t * 0.83 + p.x * 0.17 + p.z * 0.11);
	float s2 = sin(t * 1.71 + p.x * 0.31 - p.z * 0.23) * 0.35;
	vec3 off = vec3(0.86, 0.0, 0.5) * (s1 + s2) * gust * h * h * 0.0032 * uWind;
	float f = flex * flex;
	off += vec3(
		sin(t * 3.1 + p.y * 2.3 + p.x * 1.7),
		sin(t * 2.3 + p.z * 2.9) * 0.4,
		sin(t * 2.7 + p.x * 2.1 + p.z * 1.3)
	) * 0.03 * f * gust * uWind;
	vec2 dp = p.xz - uPtr.xz;
	float dd = dot(dp, dp);
	off.xz += dp * inversesqrt(dd + 0.05) * uPtrAmp * exp(-dd * 0.05) * h * 0.05;
	return off;
}
`;

/** The same field on the CPU, so a bird on a twig rides it exactly. */
export function windOffset(p: THREE.Vector3, flex: number, out: THREE.Vector3) {
	const h = Math.max(p.y, 0);
	const t = U.uTime.value,
		w = U.uWind.value;
	const gust = 0.6 + 0.4 * Math.sin(t * 0.23 + p.x * 0.04);
	const s1 = Math.sin(t * 0.83 + p.x * 0.17 + p.z * 0.11);
	const s2 = Math.sin(t * 1.71 + p.x * 0.31 - p.z * 0.23) * 0.35;
	const k = (s1 + s2) * gust * h * h * 0.0032 * w;
	out.set(0.86 * k, 0, 0.5 * k);
	const f = flex * flex * 0.03 * gust * w;
	out.x += Math.sin(t * 3.1 + p.y * 2.3 + p.x * 1.7) * f;
	out.y += Math.sin(t * 2.3 + p.z * 2.9) * 0.4 * f;
	out.z += Math.sin(t * 2.7 + p.x * 2.1 + p.z * 1.3) * f;
	const ptr = U.uPtr.value;
	const dx = p.x - ptr.x,
		dz = p.z - ptr.z;
	const dd = dx * dx + dz * dz;
	const push = (U.uPtrAmp.value * Math.exp(-dd * 0.05) * h * 0.05) / Math.sqrt(dd + 0.05);
	out.x += dx * push;
	out.z += dz * push;
	return out;
}

type Patch = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

/** Compose shader patches on a built-in material, keyed so programs are shared. */
export function patch<M extends THREE.Material>(m: M, key: string, ...patches: Patch[]): M {
	m.onBeforeCompile = (shader) => {
		for (const p of patches) p(shader);
	};
	m.customProgramCacheKey = () => key;
	return m;
}

/**
 * By night the colour goes out of everything but a little blue, as it does
 * under a moon: the flat grove drew its night as a pencil study, and a single
 * coloured thing in it read as a spot of paint. Applied after lighting and
 * before tone mapping, on every lit surface.
 */
export const nightPatch: Patch = (shader) => {
	shader.uniforms.uNight = U.uNight;
	shader.fragmentShader = shader.fragmentShader
		.replace('void main() {', 'uniform float uNight;\nvoid main() {')
		.replace(
			'#include <opaque_fragment>',
			`#include <opaque_fragment>
			{
				float l = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
				gl_FragColor.rgb = mix(gl_FragColor.rgb, l * vec3(0.86, 0.93, 1.08), uNight * 0.86);
			}`
		);
};
