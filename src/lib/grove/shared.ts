import * as THREE from 'three';
import { GLOW_GLSL } from './glow';

// ─── What every material in the grove shares ──────────────────────────────
// One clock, one wind, one lamp. These objects are handed to every patched
// material by reference, so setting a value here reaches all of them.
export const U = {
	uTime: { value: 0 },
	/** 0 by day, 1 by night */
	uNight: { value: 0 },
	/** the fireflies' and lanterns' light, laid over the island from above */
	uGlowMap: { value: null as THREE.Texture | null },
	uGlowOn: { value: 1 },
	uWind: { value: 1 },
	/** where the pointer's ray meets the lawn, and how hard it is pushing */
	uPtr: { value: new THREE.Vector3(0, -100, 0) },
	uPtrAmp: { value: 0 },
	/** the light's direction in view space, for leaves lit from behind */
	uSunView: { value: new THREE.Vector3(0, 1, 0) },
	uSunColor: { value: new THREE.Color(1, 0.8, 0.6) }
};

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
 * Every lit surface: by night the colour thins toward blue, as it does in
 * moonlight when the eye starts to see with its rods — a little, not a pencil
 * study; and at any hour it takes its share of the fireflies' and lanterns'
 * light from the glow map. Applied after lighting and before tone mapping.
 */
export const nightPatch: Patch = (shader) => nightPatchOf(shader, 0.3);

/** the same, with no blue by night: for polished metal under a lamp, which keeps its colour */
export const nightPatchWarm: Patch = (shader) => nightPatchOf(shader, 0);

function nightPatchOf(shader: THREE.WebGLProgramParametersWithUniforms, shift: number) {
	shader.uniforms.uNight = U.uNight;
	shader.uniforms.uGlowMap = U.uGlowMap;
	shader.uniforms.uGlowOn = U.uGlowOn;
	shader.vertexShader = shader.vertexShader
		.replace('void main() {', 'varying vec3 vGlowW;\nvoid main() {')
		.replace(
			'#include <project_vertex>',
			`#include <project_vertex>
			#ifdef USE_INSTANCING
				vGlowW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
			#else
				vGlowW = (modelMatrix * vec4(transformed, 1.0)).xyz;
			#endif`
		);
	shader.fragmentShader = shader.fragmentShader
		.replace(
			'void main() {',
			`uniform float uNight;\nvarying vec3 vGlowW;\n${GLOW_GLSL}\nvoid main() {`
		)
		.replace(
			'#include <lights_fragment_end>',
			`#include <lights_fragment_end>
			reflectedLight.directDiffuse += diffuseColor.rgb * glowAt(vGlowW);`
		)
		.replace(
			'#include <opaque_fragment>',
			`#include <opaque_fragment>
			{
				float l = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
				gl_FragColor.rgb = mix(gl_FragColor.rgb, l * vec3(0.82, 0.92, 1.12), uNight * ${shift.toFixed(2)});
			}`
		);
}
