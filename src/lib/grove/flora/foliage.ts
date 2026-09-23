import * as THREE from 'three';
import { U, patch } from '../shared';
import { FLORA_WIND, windUniforms } from './wind';

// ─── Leaves, flowers, and the wood's skin ─────────────────────────────────
// A leaf is a real blade — narrow, cupped along its midrib, drooping to its
// tip — with its outline in the geometry, so there is no cut-out edge to
// fringe or sparkle. Thousands are drawn at once from one blade, each with
// its own place, turn, size, and the moment it opens.
//
// In the light: the top of an olive leaf is grey-green and its underside
// silver, so a crown in wind flickers as the leaves turn over; a leaf with
// the sun behind it glows; and a leaf deep in the crown sees little sky.

export interface Blade {
	w: number;
	cup: number;
	droop: number;
}

/** a lanceolate blade along +y, face +z; rows along it as the budget allows */
export function bladeTemplate(b: Blade, rows: number) {
	const pos: number[] = [],
		nrm: number[] = [],
		uv: number[] = [],
		idx: number[] = [];
	for (let j = 0; j < rows; j++) {
		const v = j / (rows - 1);
		const w =
			b.w * Math.pow(Math.sin(Math.PI * Math.min(0.999, 0.06 + v * 0.94)), 0.75) * (1 - 0.25 * v);
		for (let i = 0; i < 3; i++) {
			const u = i / 2;
			const x = (u * 2 - 1) * w;
			const y = v - b.droop * v * v;
			const z = b.cup * (1 - Math.abs(u * 2 - 1)) * w * 2;
			pos.push(x, y, z);
			const n = new THREE.Vector3(
				((u * 2 - 1) * b.cup * 2) / Math.max(b.w, 1e-3),
				b.droop * 2 * v,
				1
			).normalize();
			nrm.push(n.x, n.y, n.z);
			uv.push(u, v);
		}
	}
	for (let j = 0; j < rows - 1; j++)
		for (let i = 0; i < 2; i++) {
			const a = j * 3 + i,
				c = a + 3;
			idx.push(a, a + 1, c, a + 1, c + 1, c);
		}
	return { pos, nrm, uv, idx };
}

/** five petals round +y, opening upward, face +y */
export function rosetteTemplate() {
	const pos: number[] = [],
		nrm: number[] = [],
		uv: number[] = [],
		idx: number[] = [];
	const up = new THREE.Vector3(0, 1, 0);
	for (let k = 0; k < 5; k++) {
		const a = (k / 5) * Math.PI * 2;
		const out = new THREE.Vector3(Math.sin(a), 0.45, Math.cos(a)).normalize();
		const side = new THREE.Vector3().crossVectors(up, out).normalize();
		const nOut = new THREE.Vector3().crossVectors(out, side).normalize();
		const base = pos.length / 3;
		const pts = [
			[0, 0, 0],
			[0.22, 0.38, 0.26],
			[0, 1, 0],
			[-0.22, 0.38, 0.26]
		];
		for (const [sx, t, lift] of pts) {
			const p = out
				.clone()
				.multiplyScalar(t * 0.5)
				.addScaledVector(side, sx * 0.5)
				.addScaledVector(nOut, lift * 0.04);
			pos.push(p.x, p.y + 0.02, p.z);
			nrm.push(nOut.x, nOut.y, nOut.z);
			uv.push(0.5 + sx, t);
		}
		idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
	}
	return { pos, nrm, uv, idx };
}

export interface LeafInstances {
	pos: number[];
	quat: number[];
	data: number[]; // scale, birth, seed, sky
	base: number[]; // foot xyz, height
}
export function newLeaves(): LeafInstances {
	return { pos: [], quat: [], data: [], base: [] };
}

export function leafGeometry(t: ReturnType<typeof bladeTemplate>, inst: LeafInstances) {
	const g = new THREE.InstancedBufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3));
	g.setAttribute('normal', new THREE.Float32BufferAttribute(t.nrm, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(t.uv, 2));
	g.setIndex(t.idx);
	g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(inst.pos), 3));
	g.setAttribute('iQuat', new THREE.InstancedBufferAttribute(new Float32Array(inst.quat), 4));
	g.setAttribute('iData', new THREE.InstancedBufferAttribute(new Float32Array(inst.data), 4));
	g.setAttribute('iBase', new THREE.InstancedBufferAttribute(new Float32Array(inst.base), 4));
	g.instanceCount = inst.pos.length / 3;
	return g;
}

export interface Growth {
	uGrow: { value: number };
	uGrowAll: { value: number };
}

const LEAF_VERT_HEAD = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iQuat;
attribute vec4 iData;
attribute vec4 iBase;
uniform float uGrow;
varying float vSky;
varying float vSeed;
varying vec2 vLeafUv;
${FLORA_WIND}
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;

// the leaf's whole motion, shared by its colour pass and its shadow pass
const LEAF_MOVE = /* glsl */ `
	float lg = smoothstep(iData.y, iData.y + 0.06, uGrow);
	float seed = iData.z;
	float ft = uTime * (2.0 + seed * 1.7) + seed * 40.0;
	float rs = rustleAt(iPos);
	float flut = (sin(ft) * 0.6 + sin(ft * 1.9 + 1.1) * 0.4) * (0.16 * uWind + abs(rs) * 0.8)
		+ rs * 0.6;
	vec3 fa = normalize(vec3(sin(seed * 17.0), 0.55, cos(seed * 11.0)));
	vec3 lp = rotAxis(qrot(iQuat, position * iData.x * lg), fa, flut);
	vec3 transformed = bendTree(iPos + lp, iBase, 1.0) + partAt(iPos) * lg;
`;

function leafPatch(u: Growth) {
	return (s: THREE.WebGLProgramParametersWithUniforms) => {
		Object.assign(s.uniforms, windUniforms(), { uGrow: u.uGrow });
		s.vertexShader =
			LEAF_VERT_HEAD +
			s.vertexShader
				.replace(
					'#include <beginnormal_vertex>',
					`#include <beginnormal_vertex>
				{
					float seed0 = iData.z;
					float ft0 = uTime * (2.0 + seed0 * 1.7) + seed0 * 40.0;
					float rs0 = rustleAt(iPos);
					float fl0 = (sin(ft0) * 0.6 + sin(ft0 * 1.9 + 1.1) * 0.4) * (0.16 * uWind + abs(rs0) * 0.8) + rs0 * 0.6;
					vec3 fa0 = normalize(vec3(sin(seed0 * 17.0), 0.55, cos(seed0 * 11.0)));
					objectNormal = rotAxis(qrot(iQuat, objectNormal), fa0, fl0);
				}`
				)
				.replace(
					'#include <begin_vertex>',
					LEAF_MOVE +
						`
				vSky = iData.w;
				vSeed = seed;
				vLeafUv = uv;`
				);
	};
}

/**
 * The leaves' material: top and underside, a wander of colour leaf to leaf,
 * the midrib a shade lighter, the glow of a leaf lit from behind, and the
 * sky each can see.
 */
export function leafMaterial(
	u: Growth,
	top: THREE.Color,
	under: THREE.Color,
	vary: number,
	sheen = 0.5
) {
	const m = new THREE.MeshStandardMaterial({
		color: 0xffffff,
		roughness: sheen,
		metalness: 0,
		side: THREE.DoubleSide
	});
	patch(m, 'leaf-' + top.getHexString() + under.getHexString(), leafPatch(u), (s) => {
		s.uniforms.uTop = { value: top };
		s.uniforms.uUnder = { value: under };
		s.uniforms.uVary = { value: vary };
		s.uniforms.uSunView = U.uSunView;
		s.uniforms.uSunColor = U.uSunColor;
		s.fragmentShader = s.fragmentShader
			.replace(
				'void main() {',
				`uniform vec3 uTop;
				uniform vec3 uUnder;
				uniform float uVary;
				uniform vec3 uSunView;
				uniform vec3 uSunColor;
				varying float vSky;
				varying float vSeed;
				varying vec2 vLeafUv;
				void main() {`
			)
			.replace(
				'#include <color_fragment>',
				`#include <color_fragment>
				vec3 leafC = gl_FrontFacing ? uTop : uUnder;
				float wv = fract(vSeed * 7.13) - 0.5;
				leafC *= 1.0 + wv * uVary;
				leafC.r *= 1.0 + (fract(vSeed * 3.71) - 0.5) * uVary * 0.8;
				float rib = smoothstep(0.1, 0.0, abs(vLeafUv.x - 0.5)) * 0.25;
				diffuseColor.rgb = leafC * (1.0 + rib);`
			)
			.replace(
				'#include <lights_fragment_end>',
				`#include <lights_fragment_end>
				{
					// the crown's own shade: sky light goes first, sunlight less so
					float sky = vSky;
					reflectedLight.indirectDiffuse *= mix(0.16, 1.0, sky);
					reflectedLight.indirectSpecular *= sky;
					reflectedLight.directDiffuse *= mix(0.5, 1.0, sky);
					reflectedLight.directSpecular *= sky;
					// the glow of a leaf with the sun behind it
					vec3 toEye = normalize(vViewPosition);
					float into = pow(clamp(dot(-toEye, uSunView), 0.0, 1.0), 4.0);
					float thru = clamp(-dot(normal, uSunView), 0.0, 1.0);
					totalEmissiveRadiance += diffuseColor.rgb * uSunColor * (into * 1.1 + thru * 0.35) * sky * sky;
				}`
			);
	});
	return m;
}

/** the shadow a leaf casts moves with it */
export function leafDepth(u: Growth) {
	const m = new THREE.MeshDepthMaterial({
		depthPacking: THREE.RGBADepthPacking,
		side: THREE.DoubleSide
	});
	patch(m, 'leaf-depth', leafPatch(u));
	return m;
}

// ── the wood's skin ──
const BARK_HEAD = /* glsl */ `
attribute vec3 aCenter;
attribute vec3 aParent;
attribute vec2 aBirth;
attribute vec4 aBase;
attribute float aSky;
uniform float uGrow;
uniform float uGrowAll;
varying float vSky;
${FLORA_WIND}
`;
const BARK_MOVE = /* glsl */ `
	float span = max(aBirth.y - aBirth.x, 1e-4);
	float be = clamp((uGrow - aBirth.x) / span, 0.0, 1.0);
	vec3 bc = mix(aParent, aCenter, be);
	vec3 transformed = bc + (position - aCenter) * be * mix(0.3, 1.0, uGrowAll);
	transformed = bendTree(transformed, aBase, 1.0);
`;

function barkPatch(u: Growth) {
	return (s: THREE.WebGLProgramParametersWithUniforms) => {
		Object.assign(s.uniforms, windUniforms(), { uGrow: u.uGrow, uGrowAll: u.uGrowAll });
		s.vertexShader =
			BARK_HEAD +
			s.vertexShader.replace(
				'#include <begin_vertex>',
				BARK_MOVE +
					`
			vSky = aSky;`
			);
	};
}

export function barkMaterial(
	u: Growth,
	map: THREE.Texture,
	normalMap: THREE.Texture,
	tint: THREE.Color
) {
	const m = new THREE.MeshStandardMaterial({
		map,
		normalMap,
		normalScale: new THREE.Vector2(1.4, 1.4),
		color: tint,
		roughness: 0.93,
		metalness: 0
	});
	patch(m, 'bark', barkPatch(u), (s) => {
		s.fragmentShader = s.fragmentShader
			.replace('void main() {', 'varying float vSky;\nvoid main() {')
			.replace(
				'#include <lights_fragment_end>',
				`#include <lights_fragment_end>
				reflectedLight.indirectDiffuse *= mix(0.22, 1.0, vSky);
				reflectedLight.directDiffuse *= mix(0.6, 1.0, vSky);`
			);
	});
	return m;
}

export function barkDepth(u: Growth) {
	const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
	patch(m, 'bark-depth', barkPatch(u));
	return m;
}
