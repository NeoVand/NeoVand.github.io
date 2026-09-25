import * as THREE from 'three';
import { patch, nightPatch, nightPatchWarm, U } from './shared';
import { vn3 } from './island';
import { rng, lerp, clamp, smoothstep } from './rng';
import { buildStand, prepareStand, type Stand, type PlantItem } from './flora/plants';
import { MAPLE, AZALEA, WHITE_SHRUB, wildflower } from './flora/species';
import { buildGramophone, type Gramophone } from './gramophone';
import { woodTexture } from './textures';
import type { Habitat } from './air';
import { Petals, type PetalSource } from './flora/petals';
import { waterMaterial, buildFall, Spray, stepWater, WATER_U, type FallShape } from './water';
import type { Glow } from './glow';

// ─── The islet ────────────────────────────────────────────────────────────
// Another rock in the same sky, come on while reading: smaller than the
// grove's and wilder, with no wall and no building. On it one old maple, red,
// its crown a parasol wider than the rock; under it a spring in a basin of
// stone, running off in a short channel to the lip and over it, falling away
// past the side of the rock until the fall breaks into spray and is gone into
// the air. A stone lantern by the water, lit at dusk, and fireflies over it;
// a gramophone on a flat stone at the edge of the maple's shade; azaleas and
// drifts of wildflowers in the grass; doves, on the tree and the stones and
// walking the grass. Now and then a leaf lets go and goes over the edge.

export interface IsletMaterials {
	/** the grove's own crag, read from three sides */
	rock: THREE.MeshStandardMaterial;
	/** and its texture, for where the ground goes over the edge onto it */
	rockMap: THREE.Texture;
	lawn: THREE.Texture;
	bark: { map: THREE.Texture; normalMap: THREE.Texture };
	glass: THREE.MeshStandardMaterial;
}

/** the rock's top: its mean radius, and how far down it goes */
const RT = 3.2;
const DEPTH = 3.4;
/** the spring's surface */
const WL = -0.02;
/** where the tree stands, and the basin, the lantern and the gramophone */
const TREE = new THREE.Vector2(-0.95, -0.55);
const LANTERN = new THREE.Vector2(-0.35, 1.55);
const GRAM = new THREE.Vector2(0.1, -1.0);
const POOL = { x: 0.95, z: 0.62, a: 1.0, b: 0.72, rot: 0.45 };
/** the lip, as an angle round from +x toward +z */
const LIP_A = 0.74;

/** the rock's edge, round the top: lobed, not a circle */
export function outline(th: number) {
	return (
		RT *
		(1 +
			0.09 * Math.sin(2 * th + 0.6) +
			0.06 * Math.sin(3 * th + 2.1) +
			0.035 * Math.sin(5 * th + 0.4))
	);
}

/** how far into the basin a point is: 1 at its edge */
function poolE(x: number, z: number) {
	const dx = x - POOL.x,
		dz = z - POOL.z;
	const c = Math.cos(POOL.rot),
		s = Math.sin(POOL.rot);
	return Math.hypot((dx * c + dz * s) / POOL.a, (-dx * s + dz * c) / POOL.b);
}

const LIP = new THREE.Vector3(
	Math.cos(LIP_A) * (outline(LIP_A) + 0.02),
	WL - 0.09,
	Math.sin(LIP_A) * (outline(LIP_A) + 0.02)
);
/** where the channel leaves the basin: its edge, on the way to the lip */
const OUTLET = (() => {
	const e = poolE(LIP.x, LIP.z);
	return new THREE.Vector3(POOL.x + (LIP.x - POOL.x) / e, WL, POOL.z + (LIP.z - POOL.z) / e);
})();

/** how far along the channel a point is (0..1), and how far from its line */
function channelAt(x: number, z: number) {
	const ax = LIP.x - OUTLET.x,
		az = LIP.z - OUTLET.z;
	const f = clamp(((x - OUTLET.x) * ax + (z - OUTLET.z) * az) / (ax * ax + az * az), 0, 1);
	return { f, d: Math.hypot(x - OUTLET.x - ax * f, z - OUTLET.z - az * f) };
}

/** the channel's water, falling a little to the lip */
const channelY = (f: number) => WL - 0.09 * f * f;

/** The ground's height: a low dome, a rise for the tree, the edge rounding
 *  over, the basin and the channel cut into it. */
function groundY(x: number, z: number) {
	const r = Math.hypot(x, z);
	const q = r / outline(Math.atan2(z, x));
	let y = 0.2 * (1 - q * q);
	y += 0.2 * Math.exp(-((x - TREE.x) ** 2 + (z - TREE.y) ** 2) / 1.4);
	y -= 0.12 * smoothstep(0.84, 1.0, q);
	y += (vn3(x * 1.3, 0, z * 1.3, 5) - 0.5) * 0.07;
	const e = poolE(x, z);
	if (e < 1) y = WL - 0.03 - 0.22 * (1 - e * e);
	else if (e < 1.45) y = lerp(WL - 0.03, y, smoothstep(1, 1.45, e));
	// the channel: a groove to the lip, its floor under the running water
	const c = channelAt(x, z);
	if (e >= 0.9) {
		const floor = channelY(c.f) - 0.07;
		y = Math.min(y, lerp(floor, y, smoothstep(0.1, 0.3, c.d)));
	}
	return y;
}

/** where the ground is, for what falls on it, or null off the edge */
function groundAt(p: THREE.Vector3) {
	const r = Math.hypot(p.x, p.z);
	if (r > outline(Math.atan2(p.z, p.x)) * 0.97) return null;
	if (poolE(p.x, p.z) < 1.02) return WL;
	return groundY(p.x, p.z);
}

/** a geometry for the crag's material, which reads a shade per vertex */
function withAo(g: THREE.BufferGeometry, ao = 1) {
	const n = g.getAttribute('position').count;
	g.setAttribute('aAo', new THREE.Float32BufferAttribute(new Array(n).fill(ao), 1));
	return g;
}

/** The rock: the grove's, smaller, and cut back under the lip, so the fall
 *  hangs clear of it. */
function rockGeometry(seed: number) {
	const NT = 96,
		NY = 34;
	const pos: number[] = [],
		ao: number[] = [];
	const top = -0.1;
	for (let iy = 0; iy <= NY; iy++) {
		const t = iy / NY;
		const y = top - DEPTH * Math.pow(t, 1.1) - (t > 0.96 ? (t - 0.96) * 5 : 0);
		for (let ix = 0; ix < NT; ix++) {
			const th = (ix / NT) * Math.PI * 2;
			const R0 = outline(th);
			const bulge = 1 + 0.07 * Math.sin(Math.min(t, 0.3) * (Math.PI / 0.3));
			let rb = R0 * Math.pow(1 - t, 0.82) * bulge;
			rb *=
				1 +
				0.1 * Math.sin(3 * th + 0.8 + t * 2.6 + seed) * Math.min(1, t * 3) +
				0.07 * Math.sin(4 * th - 0.5 + t * 3.4 + seed * 2) * t;
			// recessed under the lip, down the face the water falls past
			const dA = Math.atan2(Math.sin(th - LIP_A), Math.cos(th - LIP_A));
			rb *= 1 - 0.2 * Math.exp(-(dA * dA) / 0.09) * smoothstep(0.0, 0.12, t);
			const cx = Math.cos(th) * RT,
				cz = Math.sin(th) * RT;
			let n =
				vn3(cx * 0.5, y * 0.6, cz * 0.5, 17) * 0.6 + vn3(cx * 1.1, y * 1.2, cz * 1.1, 19) * 0.4;
			const bed = Math.floor(n * 4) / 4;
			n += (bed - n) * 0.4;
			const craggy = Math.min(1, t * 4) * Math.min(1, rb * 0.6);
			const strata = Math.sin(y * 3.4 + vn3(cx * 0.3, y * 0.4, cz * 0.3, 23) * 4) * 0.04;
			let r = Math.max(0.02, rb + (n - 0.5) * 1.1 * craggy + strata * craggy);
			// flush with the ground's edge at the top, a little inside it
			const flush = R0 - 0.06;
			r = flush + (r - flush) * smoothstep(0.02, 0.14, t);
			const off = Math.pow(t, 3);
			pos.push(Math.cos(th) * r - off * 0.5, y, Math.sin(th) * r + off * 0.3);
			ao.push(0.55 + 0.45 * clamp(n * 1.4 - 0.1, 0, 1) - t * 0.15);
		}
	}
	const idx: number[] = [];
	for (let iy = 0; iy < NY; iy++)
		for (let ix = 0; ix < NT; ix++) {
			const a = iy * NT + ix,
				b = iy * NT + ((ix + 1) % NT),
				c = (iy + 1) * NT + ix,
				d = (iy + 1) * NT + ((ix + 1) % NT);
			// outward: round (+theta) crossed with down (-y) is out
			idx.push(a, b, c, b, d, c);
		}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('aAo', new THREE.Float32BufferAttribute(ao, 1));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

/** The ground: grass over the top, rolling down over the edge onto the rock,
 *  wet and mossy round the water, darker in the shade under the tree. */
function groundGeometry() {
	const NR = 30,
		NT = 144;
	const rows = NR + 3;
	const pos: number[] = [],
		col: number[] = [],
		uv: number[] = [],
		stoneK: number[] = [];
	const grass = new THREE.Color(1, 1, 1),
		wet = new THREE.Color(0.5, 0.56, 0.36),
		stone = new THREE.Color(0.62, 0.58, 0.5),
		silt = new THREE.Color(0.25, 0.22, 0.15),
		c = new THREE.Color();
	for (let k = 0; k <= rows; k++)
		for (let j = 0; j < NT; j++) {
			const th = (j / NT) * Math.PI * 2;
			const R0 = outline(th);
			let r: number, y: number;
			if (k <= NR) {
				r = (R0 * k) / NR;
				y = groundY(Math.cos(th) * r, Math.sin(th) * r);
			} else {
				// over the edge and under, onto the rock
				const edge = groundY(Math.cos(th) * R0, Math.sin(th) * R0);
				const skirt = [
					[0.035, -0.07],
					[0.03, -0.2],
					[-0.05, -0.34]
				][k - NR - 1];
				r = R0 + skirt[0];
				y = Math.min(edge, -0.02) + skirt[1];
			}
			const x = Math.cos(th) * r,
				z = Math.sin(th) * r;
			pos.push(x, y, z);
			uv.push(x / 13.4, z / 13.4);
			const e = poolE(x, z);
			const ch = channelAt(x, z);
			// lusher and thinner grass in drifts, so it is not a lawn
			c.copy(grass).multiplyScalar(0.84 + 0.3 * vn3(x * 0.9, 1, z * 0.9, 41));
			c.g *= 0.95 + 0.1 * vn3(x * 2.1, 2, z * 2.1, 43);
			// wet and mossy by the water
			const damp = Math.max(
				smoothstep(1.7, 1.05, e),
				smoothstep(0.45, 0.12, ch.d) * (e > 0.9 ? 1 : 0)
			);
			c.lerp(wet, damp * 0.8);
			if (e < 1) c.copy(silt);
			// stone where the grass gives out, raggedly, at the edge and over it
			const ragged = 0.88 + 0.08 * vn3(x * 2.2, 3, z * 2.2, 47);
			const st = k > NR ? 1 : smoothstep(ragged, ragged + 0.07, r / R0);
			stoneK.push(st);
			if (st > 0) c.lerp(stone, st * 0.2);
			// the shade under the crown
			const dt2 = (x - TREE.x) ** 2 + (z - TREE.y) ** 2;
			c.multiplyScalar(1 - 0.3 * Math.exp(-dt2 / 3.2));
			col.push(c.r, c.g, c.b);
		}
	const idx: number[] = [];
	for (let k = 0; k < rows; k++)
		for (let j = 0; j < NT; j++) {
			const a = k * NT + j,
				b = k * NT + ((j + 1) % NT),
				c2 = (k + 1) * NT + j,
				d = (k + 1) * NT + ((j + 1) % NT);
			idx.push(a, b, c2, b, d, c2);
		}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	g.setAttribute('aStone', new THREE.Float32BufferAttribute(stoneK, 1));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

/** the basin's water: an ellipse a little larger than the basin, its edge under the bank */
function poolGeometry() {
	const g = new THREE.CircleGeometry(1, 48);
	g.rotateX(-Math.PI / 2);
	const p = g.getAttribute('position') as THREE.BufferAttribute;
	const flow: number[] = [],
		wet: number[] = [];
	const c = Math.cos(POOL.rot),
		s = Math.sin(POOL.rot);
	for (let i = 0; i < p.count; i++) {
		const u = p.getX(i) * POOL.a * 1.12,
			v = p.getZ(i) * POOL.b * 1.12;
		const x = POOL.x + u * c - v * s,
			z = POOL.z + u * s + v * c;
		p.setXYZ(i, x, WL, z);
		// a slow drift toward the outlet
		const dx = OUTLET.x - x,
			dz = OUTLET.z - z;
		const l = Math.hypot(dx, dz) || 1;
		flow.push(dx / l, dz / l, 0.04);
		wet.push(0, smoothstep(0.75, 1.1, Math.hypot(p.getX(i), p.getZ(i)) * 1.12));
	}
	g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
	g.setAttribute('aWet', new THREE.Float32BufferAttribute(wet, 2));
	g.computeVertexNormals();
	return g;
}

/** the channel's water, from the basin's edge to the lip, whitening as it tips */
function channelGeometry() {
	const N = 20;
	const pos: number[] = [],
		flow: number[] = [],
		wet: number[] = [];
	const dir = new THREE.Vector3().subVectors(LIP, OUTLET).setY(0).normalize();
	const side = new THREE.Vector3(-dir.z, 0, dir.x);
	for (let i = 0; i <= N; i++) {
		const f = i / N;
		const c = OUTLET.clone().lerp(LIP, f);
		const y = channelY(f) - 0.004;
		for (const u of [-1, 1]) {
			const w = 0.18 + 0.03 * f;
			pos.push(c.x + side.x * u * w, y, c.z + side.z * u * w);
			flow.push(dir.x, dir.z, 0.35 + 0.9 * f);
			wet.push(smoothstep(0.55, 1.0, f) * 0.9, 0.35);
		}
	}
	const idx: number[] = [];
	for (let i = 0; i < N; i++) {
		const a = i * 2;
		idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
	g.setAttribute('aWet', new THREE.Float32BufferAttribute(wet, 2));
	g.setIndex(idx);
	g.computeVertexNormals();
	// face up, whichever way the strip was wound
	const n = g.getAttribute('normal') as THREE.BufferAttribute;
	for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
	return g;
}

/** a stone, broken, not round: a ball pushed about by the noise, its foot flattened */
function stoneGeometry(seed: number, flat = 0.55, detail = 2) {
	const g = new THREE.IcosahedronGeometry(1, detail);
	const p = g.getAttribute('position') as THREE.BufferAttribute;
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i),
			y = p.getY(i),
			z = p.getZ(i);
		const n = vn3(x * 1.6 + seed, y * 1.6, z * 1.6 - seed, 31);
		const bed = Math.floor(n * 3) / 3;
		const k = 0.75 + (n + (bed - n) * 0.5) * 0.5;
		p.setXYZ(i, x * k, Math.max(y * k, -flat), z * k);
	}
	g.computeVertexNormals();
	return withAo(g, 0.85);
}

/**
 * A stone lantern of the kind set by water in a garden: a foot, a post, a
 * table, a lamp box open on its sides, a roof with its eaves turned up, and a
 * jewel on the roof. Moss comes on its tops, as the crag's stone has it.
 */
function lantern(stone: THREE.Material, glass: THREE.Material) {
	const g = new THREE.Group();
	const hex = (r0: number, r1: number, h: number, y: number) => {
		const m = new THREE.Mesh(withAo(new THREE.CylinderGeometry(r0, r1, h, 6)), stone);
		m.position.y = y + h / 2;
		return m;
	};
	g.add(hex(0.22, 0.26, 0.09, 0));
	g.add(hex(0.13, 0.15, 0.06, 0.09));
	const post = new THREE.Mesh(withAo(new THREE.CylinderGeometry(0.065, 0.08, 0.5, 10)), stone);
	post.position.y = 0.15 + 0.25;
	g.add(post);
	g.add(hex(0.22, 0.17, 0.07, 0.65));
	// the lamp box: a lit pane of paper inside, six posts round it
	const box = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 6), glass);
	box.position.y = 0.72 + 0.1;
	g.add(box);
	for (let k = 0; k < 6; k++) {
		const a = (k / 6) * Math.PI * 2;
		const c = new THREE.Mesh(withAo(new THREE.BoxGeometry(0.035, 0.2, 0.035)), stone);
		c.position.set(Math.cos(a) * 0.14, 0.82, Math.sin(a) * 0.14);
		c.rotation.y = -a;
		g.add(c);
	}
	g.add(hex(0.2, 0.2, 0.03, 0.92));
	// the roof: its eaves turned up at the corners
	const roofG = new THREE.ConeGeometry(0.33, 0.2, 6, 2);
	const rp = roofG.getAttribute('position') as THREE.BufferAttribute;
	for (let i = 0; i < rp.count; i++) {
		const x = rp.getX(i),
			z = rp.getZ(i),
			y = rp.getY(i);
		const r = Math.hypot(x, z);
		rp.setY(i, y + Math.pow(r / 0.33, 3) * 0.06);
	}
	roofG.computeVertexNormals();
	const roof = new THREE.Mesh(withAo(roofG), stone);
	roof.position.y = 0.95 + 0.1;
	g.add(roof);
	const jewel = new THREE.Mesh(withAo(new THREE.SphereGeometry(0.05, 10, 8)), stone);
	jewel.position.y = 1.2;
	jewel.scale.y = 1.3;
	g.add(jewel);
	g.traverse((o) => {
		if ((o as THREE.Mesh).isMesh && o !== box) o.castShadow = o.receiveShadow = true;
	});
	return { group: g, light: new THREE.Vector3(0, 0.82, 0) };
}

const FLIES = 14;

export class Islet {
	group = new THREE.Group();
	tree!: Stand;
	stands: Stand[] = [];
	/** the gramophone, and its brass (which by night is given a room to shine in) */
	gram: Gramophone;
	brass: THREE.MeshStandardMaterial;
	/** where a bird may stand: the stones' tops, the lantern's roof */
	private stoneTops: THREE.Vector3[] = [];
	private lanternTop = new THREE.Vector3();
	/** what the planting and the walking keep clear of: x, z and a reach */
	private keepOut: [number, number, number][] = [];
	pool: THREE.Mesh;
	/** what a tap can land on: the rock, the ground, the water, the stones, the lantern */
	solid: THREE.Object3D[] = [];
	leaves: Petals;
	private leafSrc: PetalSource = { at: [], colors: [] };
	private r: () => number;
	private bark: IsletMaterials['bark'];
	private phone: boolean;
	private spray: Spray;
	private lamp: THREE.Vector3;
	private glass: THREE.MeshStandardMaterial;
	private flies: THREE.Points;
	private fly: { home: THREE.Vector3; ph: number; flash: number; wait: number; len: number }[] = [];
	private flyPos = new Float32Array(FLIES * 3);
	private flyGlow = new Float32Array(FLIES);
	/** the fall's shape, for anything that wants to know where it is */
	fall: FallShape;

	constructor(m: IsletMaterials, seed: number, opt: { phone: boolean }) {
		const r = (this.r = rng(seed));
		this.bark = m.bark;
		this.phone = opt.phone;
		const g = this.group;

		const rock = new THREE.Mesh(rockGeometry(r() * 10), m.rock);
		rock.castShadow = rock.receiveShadow = true;
		g.add(rock);

		const lawn = m.lawn;
		const groundMat = patch(
			new THREE.MeshStandardMaterial({
				map: lawn,
				vertexColors: true,
				roughness: 0.96,
				metalness: 0
			}),
			'islet-ground',
			(s) => {
				// at the edge the grass gives way to the rock's own stone
				s.uniforms.uRock = { value: m.rockMap };
				s.vertexShader = s.vertexShader
					.replace(
						'void main() {',
						'attribute float aStone;\nvarying float vStone;\nvarying vec3 vGW;\nvoid main() {'
					)
					.replace(
						'#include <begin_vertex>',
						'#include <begin_vertex>\nvStone = aStone;\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;'
					);
				s.fragmentShader = s.fragmentShader
					.replace(
						'void main() {',
						'uniform sampler2D uRock;\nvarying float vStone;\nvarying vec3 vGW;\nvoid main() {'
					)
					.replace(
						'#include <map_fragment>',
						`#include <map_fragment>
						{
							vec3 st = texture2D(uRock, vGW.xz * 0.21).rgb * 0.55 + texture2D(uRock, vGW.xy * 0.21 + 0.4).rgb * 0.45;
							diffuseColor.rgb = mix(diffuseColor.rgb, st, vStone);
						}`
					);
			},
			nightPatch
		);
		const ground = new THREE.Mesh(groundGeometry(), groundMat);
		ground.receiveShadow = true;
		g.add(ground);
		this.solid.push(rock, ground);

		const water = waterMaterial();
		this.pool = new THREE.Mesh(poolGeometry(), water);
		this.pool.receiveShadow = true;
		g.add(this.pool);
		const channel = new THREE.Mesh(channelGeometry(), water);
		channel.receiveShadow = true;
		g.add(channel);
		this.solid.push(this.pool, channel);

		const out = new THREE.Vector3().subVectors(LIP, OUTLET).setY(0).normalize();
		this.fall = { lip: LIP.clone(), out, v0: 1.1, T: 1.5, w0: 0.48 };
		g.add(buildFall(this.fall));
		this.spray = new Spray(this.fall);
		g.add(this.spray.points);

		// stones round the water, and at the edge, sunk into the ground
		const stones: [number, number, number, number, number][] = [
			// x, z, size, squash, turn
			[POOL.x - 0.95, POOL.z + 0.45, 0.32, 0.7, 0.3],
			[POOL.x + 0.2, POOL.z - 0.85, 0.26, 0.6, 1.2],
			[POOL.x + 1.02, POOL.z - 0.25, 0.22, 0.7, 2.1],
			[LIP.x - 0.35, LIP.z + 0.28, 0.2, 0.8, 0.8],
			[LIP.x + 0.2, LIP.z - 0.4, 0.24, 0.75, 2.6],
			[-2.4, -1.5, 0.36, 0.65, 1.7],
			[1.3, -2.2, 0.28, 0.6, 0.2]
		];
		for (const [x, z, s, sq, rot] of stones) {
			const st = new THREE.Mesh(stoneGeometry(x * 3 + z), m.rock);
			st.scale.set(s * 1.3, s * sq, s);
			st.rotation.y = rot;
			st.position.set(x, groundAt(new THREE.Vector3(x, 0, z)) ?? 0, z);
			st.position.y -= s * 0.12;
			st.castShadow = st.receiveShadow = true;
			g.add(st);
			this.solid.push(st);
			this.stoneTops.push(st.position.clone().setY(st.position.y + s * sq * 0.92));
			this.keepOut.push([x, z, s * 1.3 + 0.12]);
		}
		// stepping stones from the front edge to the lantern and the water
		const steps: [number, number][] = [
			[-0.05, 2.55],
			[0.2, 2.0],
			[0.1, 1.45],
			[0.45, 0.95]
		];
		steps.forEach(([x, z], i) => {
			const st = new THREE.Mesh(stoneGeometry(7 + i, 0.3, 1), m.rock);
			st.scale.set(0.3, 0.07, 0.25);
			st.rotation.y = i * 1.3;
			st.position.set(x, groundY(x, z) - 0.01, z);
			st.receiveShadow = true;
			g.add(st);
			this.keepOut.push([x, z, 0.24]);
		});

		// the lantern, by the water, on the near side
		const lx = LANTERN.x,
			lz = LANTERN.y;
		this.glass = m.glass.clone();
		const lan = lantern(m.rock, this.glass);
		lan.group.position.set(lx, groundY(lx, lz) - 0.03, lz);
		lan.group.rotation.y = 0.35;
		lan.group.scale.setScalar(0.8);
		g.add(lan.group);
		this.solid.push(lan.group);
		this.lamp = lan.light.clone().multiplyScalar(0.8).add(lan.group.position);
		this.lanternTop = lan.group.position.clone().setY(lan.group.position.y + 1.02);
		this.keepOut.push([lx, lz, 0.45], [TREE.x, TREE.y, 0.6]);

		// the gramophone, on a flat stone at the edge of the maple's shade, its
		// horn turned to the water and to whoever is looking
		this.brass = patch(
			new THREE.MeshStandardMaterial({
				color: 0xd8a650,
				metalness: 1,
				roughness: 0.26,
				side: THREE.DoubleSide
			}),
			'brass',
			nightPatchWarm
		);
		const gram = buildGramophone(this.brass, woodTexture(8));
		const slab = new THREE.Mesh(stoneGeometry(91, 0.3, 1), m.rock);
		slab.scale.set(0.44, 0.08, 0.4);
		slab.rotation.y = 0.4;
		slab.position.set(GRAM.x, groundY(GRAM.x, GRAM.y) - 0.01, GRAM.y);
		slab.castShadow = slab.receiveShadow = true;
		gram.group.position.set(GRAM.x, slab.position.y + 0.055, GRAM.y);
		gram.group.scale.setScalar(0.87);
		gram.group.rotation.y = 0.45;
		gram.group.updateMatrix();
		g.add(slab, gram.group);
		this.solid.push(slab);
		this.gram = gram;
		this.keepOut.push([GRAM.x, GRAM.y, 0.45]);

		this.leaves = new Petals({ ground: groundAt, size: [0.13, 0.19], life: [8, 12], sink: 0.5 });
		g.add(this.leaves.mesh);

		// fireflies over the water and under the crown
		const fg = new THREE.BufferGeometry();
		fg.setAttribute(
			'position',
			new THREE.BufferAttribute(this.flyPos, 3).setUsage(THREE.DynamicDrawUsage)
		);
		fg.setAttribute(
			'aGlow',
			new THREE.BufferAttribute(this.flyGlow, 1).setUsage(THREE.DynamicDrawUsage)
		);
		this.flies = new THREE.Points(
			fg,
			new THREE.ShaderMaterial({
				uniforms: { uScale: { value: 500 }, uDpr: { value: 1 } },
				vertexShader: /* glsl */ `
					attribute float aGlow;
					uniform float uScale;
					uniform float uDpr;
					varying float vGlow;
					void main() {
						vGlow = aGlow;
						vec4 mv = modelViewMatrix * vec4(position, 1.0);
						gl_PointSize = clamp(uScale * 0.03 / -mv.z, 9.0 * uDpr, 22.0 * uDpr);
						gl_Position = projectionMatrix * mv;
					}`,
				fragmentShader: /* glsl */ `
					varying float vGlow;
					void main() {
						float d = length(gl_PointCoord - 0.5) * 2.0;
						float core = exp(-d * d * 70.0);
						float halo = exp(-d * d * 7.0) * max(1.0 - d, 0.0);
						if ((core + halo) * vGlow < 0.004) discard;
						gl_FragColor = vec4(vec3(0.8, 1.0, 0.4) * (core * 7.0 + halo * 0.7) * vGlow, 1.0);
						#include <tonemapping_fragment>
						#include <colorspace_fragment>
						// light only, added: nothing to cover what is behind, even
						// where nothing is, so none of its square shows on the glass
						gl_FragColor.a = 0.0;
					}`,
				transparent: true,
				depthWrite: false,
				// (taken as already multiplied by its alpha, so it adds in full)
				premultipliedAlpha: true,
				blending: THREE.AdditiveBlending
			})
		);
		this.flies.frustumCulled = false;
		g.add(this.flies);
		for (let i = 0; i < FLIES; i++) {
			const byWater = i < 8;
			const a = r() * Math.PI * 2,
				d = r();
			this.fly.push({
				home: byWater
					? new THREE.Vector3(
							POOL.x + Math.cos(a) * d * 1.3,
							0.35 + r() * 0.7,
							POOL.z + Math.sin(a) * d * 1.1
						)
					: new THREE.Vector3(
							TREE.x + Math.cos(a) * d * 2.2,
							0.8 + r() * 1.6,
							TREE.y + Math.sin(a) * d * 2.2
						),
				ph: r() * 100,
				flash: 0,
				wait: r() * 4,
				len: 1
			});
		}
	}

	/** The planting: the maple on its rise, azaleas by the water and the
	 *  edge, and the leaves that will let go. Apart from the rest, as the
	 *  dearest part to make, so it can be made at a moment of its own. */
	grow() {
		// the tree, on its rise, and azaleas by the water and the edge
		const barkOpt = {
			barkMap: this.bark.map,
			barkNormal: this.bark.normalMap,
			rows: 3,
			density: this.phone ? 0.6 : 0.9,
			minRadius: 0.003
		};
		const treeItem: PlantItem = {
			species: MAPLE,
			seed: Math.floor(this.r() * 1e6),
			pos: new THREE.Vector3(TREE.x, groundY(TREE.x, TREE.y) - 0.03, TREE.y),
			rotY: this.r() * Math.PI * 2,
			scale: 1.12
		};
		this.prep = { item: treeItem, opt: barkOpt, prep: prepareStand([treeItem], barkOpt.density) };
	}

	private prep: {
		item: PlantItem;
		opt: Parameters<typeof buildStand>[1];
		prep: ReturnType<typeof prepareStand>;
	} | null = null;

	/** and then made, with the azaleas and the wildflowers: in three parts,
	 *  each small enough for an idle moment of its own (or all at once) */
	plant() {
		this.plantTree();
		this.plantShrubs();
		this.plantFlowers();
	}

	plantTree() {
		if (!this.prep) this.grow();
		const { item: treeItem, opt: barkOpt } = this.prep!;
		this.tree = buildStand([treeItem], barkOpt, this.prep!.prep);
		this.stands = [this.tree];
		this.group.add(this.tree.group);
	}

	plantShrubs() {
		const barkOpt = this.prep!.opt;
		const bush =
			(species: typeof AZALEA) =>
			([x, z, s]: number[]) => {
				this.keepOut.push([x, z, s * 0.55]);
				return {
					species,
					seed: Math.floor(this.r() * 1e6),
					pos: new THREE.Vector3(x, groundY(x, z) - 0.02, z),
					rotY: this.r() * 6.28,
					scale: s
				};
			};
		const azaleas: PlantItem[] = [
			[1.95, -1.35, 0.9],
			[-1.95, 0.95, 0.8],
			[POOL.x - 0.2, POOL.z + 1.05, 0.62],
			[-2.2, -1.2, 0.75],
			[1.0, -2.2, 0.7],
			[2.4, 0.1, 0.62]
		].map(bush(AZALEA));
		const whites: PlantItem[] = [
			[-1.35, 1.95, 0.7],
			[-2.6, 0.15, 0.66]
		].map(bush(WHITE_SHRUB));
		const opt = { ...barkOpt, density: 0.9 };
		for (const st of [buildStand(azaleas, opt), buildStand(whites, opt)]) {
			this.stands.push(st);
			this.group.add(st.group);
		}
	}

	plantFlowers() {
		const { opt: barkOpt, prep } = this.prep!;
		const opt = { ...barkOpt, density: 0.9 };
		// in the grass, drifts of wildflowers, each drift of one kind
		const kinds = [
			new THREE.Color(0.97, 0.96, 0.9),
			new THREE.Color(0.98, 0.8, 0.22),
			new THREE.Color(0.96, 0.5, 0.66),
			new THREE.Color(0.52, 0.6, 0.98)
		].map((c, i) => ({ species: wildflower('wildflower-' + i, c), items: [] as PlantItem[] }));
		const at = new THREE.Vector3();
		for (let d = 0; d < 16; d++) {
			const kind = kinds[d % kinds.length];
			if (!this.lawnSpot(this.r, at, 0.3)) continue;
			const n = 8 + Math.floor(this.r() * 6);
			for (let k = 0; k < n; k++) {
				const a = this.r() * Math.PI * 2,
					rr = Math.sqrt(this.r()) * 0.5;
				const x = at.x + Math.cos(a) * rr,
					z = at.z + Math.sin(a) * rr;
				if (!this.open(x, z, 0.06)) continue;
				kind.items.push({
					species: kind.species,
					seed: Math.floor(this.r() * 1e6),
					pos: new THREE.Vector3(x, groundY(x, z) - 0.01, z),
					rotY: this.r() * 6.28,
					scale: lerp(0.9, 1.35, this.r())
				});
			}
		}
		for (const k of kinds)
			if (k.items.length) {
				const st = buildStand(k.items, opt);
				this.stands.push(st);
				this.group.add(st.group);
			}

		// the leaves that let go: a sample of the crown's, in its colours
		const pal = MAPLE.palette;
		this.leafSrc = {
			at: prep.placed.worldPos.filter((_, i) => i % 5 === 0),
			colors: [
				pal.leafTop.clone().multiplyScalar(1.5),
				pal.leafUnder.clone().multiplyScalar(1.3),
				pal.leafAlt!.clone()
			]
		};
	}

	/** is (x, z) open grass, `m` clear of anything standing on it? */
	private open(x: number, z: number, m: number) {
		if (Math.hypot(x, z) > outline(Math.atan2(z, x)) * 0.86) return false;
		const e = poolE(x, z);
		if (e < 1.3) return false;
		if (e >= 0.9 && channelAt(x, z).d < 0.3) return false;
		for (const [kx, kz, kr] of this.keepOut) if (Math.hypot(x - kx, z - kz) < kr + m) return false;
		return true;
	}

	/** somewhere on open grass, into `out`; false if none was found */
	private lawnSpot(r: () => number, out: THREE.Vector3, m = 0.15) {
		for (let k = 0; k < 40; k++) {
			const a = r() * Math.PI * 2,
				d = Math.sqrt(r()) * 0.84;
			const R0 = outline(a);
			out.set(Math.cos(a) * R0 * d, 0, Math.sin(a) * R0 * d);
			if (this.open(out.x, out.z, m)) {
				out.y = groundY(out.x, out.z);
				return true;
			}
		}
		return false;
	}

	/**
	 * Where the doves live here: on the maple, mostly; on the grass, walking
	 * and pecking; on the stones, the lantern's roof, the rim of the horn and
	 * the gramophone's lid; along the edge of the rock. Nothing to fly round,
	 * and they come in from above, out of the top of the picture.
	 */
	habitat(view: { readonly camera: THREE.PerspectiveCamera; readonly reduced: boolean }): Habitat {
		const self = this;
		const gm = this.gram.group.matrix;
		const horn = this.gram.rim.clone().applyMatrix4(gm);
		const lidA = this.gram.lid[0].clone().applyMatrix4(gm),
			lidB = this.gram.lid[1].clone().applyMatrix4(gm);
		const run = new THREE.Vector3().subVectors(lidB, lidA);
		// on the stone lip, clear of the fall
		const rimAt = (a: number, out: THREE.Vector3) => {
			const dl = Math.atan2(Math.sin(a - LIP_A), Math.cos(a - LIP_A));
			if (Math.abs(dl) < 0.3) a = LIP_A + Math.sign(dl || 1) * 0.3;
			const R0 = outline(a) * 0.95;
			out.set(Math.cos(a) * R0, 0, Math.sin(a) * R0);
			return out.setY(groundY(out.x, out.z));
		};
		return {
			get camera() {
				return view.camera;
			},
			get reduced() {
				return view.reduced;
			},
			get trees() {
				return self.tree ? [self.tree] : [];
			},
			count: 7,
			spots: [
				{ name: 'ground', weight: 4 },
				{ name: 'stone', weight: 1.5 },
				{ name: 'rim', weight: 1.5 },
				{ name: 'lantern', weight: 1, single: true },
				{ name: 'horn', weight: 1, single: true },
				{ name: 'lid', weight: 1 }
			],
			spotChance: 0.5,
			walks: ['ground', 'rim', 'lid'],
			fallback: 'ground',
			refuge: ['ground', 'stone'],
			spot(name, r, out) {
				switch (name) {
					case 'stone':
						return out.copy(self.stoneTops[Math.floor(r() * self.stoneTops.length)]);
					case 'lantern':
						return out.copy(self.lanternTop);
					case 'horn':
						return out.copy(horn);
					case 'lid':
						return out.copy(lidA).lerp(lidB, lerp(0.15, 0.85, r()));
					case 'rim':
						return rimAt(r() * Math.PI * 2, out);
					default:
						if (!self.lawnSpot(r, out)) out.set(0.4, groundY(0.4, 2.2), 2.2);
						return out;
				}
			},
			walk(name, p, d, r, q) {
				if (name === 'lid') {
					const len2 = run.lengthSq();
					const u = q.subVectors(p, lidA).dot(run) / len2;
					return q.copy(lidA).lerp(lidB, clamp(u + d / Math.sqrt(len2), 0.1, 0.9));
				}
				if (name === 'rim') {
					const a = Math.atan2(p.z, p.x);
					return rimAt(a + d / outline(a), q);
				}
				if (name === 'ground') {
					const a = r() * Math.PI * 2;
					q.set(p.x + Math.cos(a) * d, 0, p.z + Math.sin(a) * d);
					if (!self.open(q.x, q.z, 0.1)) return null;
					return q.setY(groundY(q.x, q.z));
				}
				return null;
			},
			settle(name, p) {
				if (name === 'ground' || name === 'rim') p.y = groundY(p.x, p.z);
			},
			solid: () => false,
			around: null,
			// over the crown, and not so wide it leaves the picture
			ring: { r: [4.2, 4.9], h: [4.5, 5.1] },
			offstage(out, r) {
				const side = r() < 0.5 ? -1 : 1;
				return out.set(side * lerp(1.5, 5, r()), lerp(10, 13, r()), lerp(-3, 3, r()));
			},
			arrive: 1,
			pxH: 1000,
			dpr: 1
		};
	}

	/** pixels a metre, a metre off, and the drawing scale, for what is sized on screen */
	setScale(pxPerUnit: number, dpr: number) {
		this.spray.setScale(pxPerUnit);
		const u = (this.flies.material as THREE.ShaderMaterial).uniforms;
		u.uScale.value = pxPerUnit;
		u.uDpr.value = dpr;
	}

	/** a hand in the water: rings out from where it went in */
	splash(p: THREE.Vector3) {
		WATER_U.uSplash.value.set(p.x, p.z, U.uTime.value, 1);
	}

	/** a hand in the crown: leaves let go, those nearest first */
	shake(near: THREE.Vector3 | null, n: number) {
		this.leaves.drop(this.leafSrc, near, n);
	}

	update(dt: number, night: number, reduced: boolean, playing = false) {
		const t = U.uTime.value;
		if (playing) {
			this.gram.record.rotation.y -= dt * 3.5;
			this.gram.crank.rotation.x += dt * 5.2;
		}
		stepWater(t);
		this.spray.update(dt, reduced);
		this.leaves.update(dt, [this.leafSrc], reduced);
		// the lantern: lit as the light goes, and alive once it is
		const flick = reduced ? 1 : 0.92 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1.2);
		this.glass.emissiveIntensity = lerp(0.25, 1.35, night) * flick;
		// the fireflies: out as it gets dark, each wandering its patch of air
		// and flashing on its own clock
		const on = smoothstep(0.2, 0.9, night);
		for (let i = 0; i < FLIES; i++) {
			const f = this.fly[i];
			const k = i * 3;
			const tt = reduced ? f.ph : t + f.ph;
			this.flyPos[k] = f.home.x + Math.sin(tt * 0.31) * 0.45 + Math.sin(tt * 0.73 + 1.3) * 0.18;
			this.flyPos[k + 1] = f.home.y + Math.sin(tt * 0.47 + 0.4) * 0.2 + Math.sin(tt * 1.1) * 0.06;
			this.flyPos[k + 2] = f.home.z + Math.cos(tt * 0.37 + 2.1) * 0.45 + Math.sin(tt * 0.61) * 0.18;
			f.wait -= dt;
			if (f.wait < 0) {
				f.flash = 0;
				f.len = 0.8 + Math.random() * 1.2;
				f.wait = f.len + 1.5 + Math.random() * 3.5;
			}
			if (f.flash < f.len) f.flash += dt;
			const b = f.flash < f.len ? Math.sin((f.flash / f.len) * Math.PI) : 0;
			this.flyGlow[i] = (reduced ? 0.45 : 0.18 + 0.82 * b) * on;
		}
		const fg = this.flies.geometry;
		fg.attributes.position.needsUpdate = true;
		fg.attributes.aGlow.needsUpdate = true;
		this.flies.visible = on > 0.01;
	}

	/** its little lights, into the glow map */
	lightUp(glow: Glow, night: number, lampCol: THREE.Color, flyCol: THREE.Color) {
		glow.begin();
		// (short: the map is laid from above and knows nothing of the rim, and
		// a wide one lights the rock's face under the edge as well)
		glow.add(this.lamp, lampCol, lerp(0.25, 1.4, night), 1.45);
		if (night > 0.02) {
			const v = new THREE.Vector3();
			for (let i = 0; i < FLIES; i++) {
				if (this.flyGlow[i] < 0.02) continue;
				v.set(this.flyPos[i * 3], this.flyPos[i * 3 + 1], this.flyPos[i * 3 + 2]);
				glow.add(v, flyCol, this.flyGlow[i] * 0.08, 0.45);
			}
		}
		glow.end();
	}
}

/** how big the islet is, for framing: its span, and its top and foot */
export const ISLET_FRAME = { w: 8.6, top: 5.2, foot: -3.9 };
