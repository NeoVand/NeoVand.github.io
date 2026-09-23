import * as THREE from 'three';
import { ASHLAR, FLAGS } from './textures';
import { patch, nightPatch } from './shared';
import { hash, smoothstep } from './rng';

// ─── The island ───────────────────────────────────────────────────────────
// A garden on a rock in the air. Round its edge a wall of dressed limestone,
// knee-high on the garden side and a man's height on the outside, with a
// half-round coping the flowers can spill over; inside it lawn, a paved
// round about the rotunda, and a path of flags from the lip to its steps.
// Under the wall the rock the garden was broken from: pale limestone in
// plates and ledges, lobed, narrowing to a point far below, the ledges
// holding moss. It is broken at random but it is not noise: the radius is
// terraced in steps, as limestone breaks along its beds, and its faces are
// flat, as broken stone is.

export const ISLAND = { R: 7.0, lawn: 6.7, top: 0, wallTop: 0.42, rockTop: -1.0, depth: 8.6 };
/** how far down the outside of the wall comes, over the top of the rock */
const WALL_FOOT = ISLAND.rockTop - 0.25;

export interface IslandParts {
	group: THREE.Group;
	lawn: THREE.Mesh;
	lawnU: { uBlobs: { value: THREE.Vector4[] } };
	/** points along the coping where a bird may stand */
	rim: THREE.Vector3[];
}

export interface IslandMaterials {
	ashlar: { map: THREE.Texture; normalMap: THREE.Texture };
	rock: { map: THREE.Texture; normalMap: THREE.Texture };
	flags: { map: THREE.Texture; normalMap: THREE.Texture };
	lawn: THREE.Texture;
}

/** a lathe whose u runs a whole number of tiles round and v by the metre */
function lathe(pts: [number, number][], seg: number, tileW: number, tileH: number) {
	const g = new THREE.LatheGeometry(
		pts.map(([r, y]) => new THREE.Vector2(r, y)),
		seg
	);
	const uv = g.getAttribute('uv') as THREE.BufferAttribute;
	const pos = g.getAttribute('position') as THREE.BufferAttribute;
	const rMax = Math.max(...pts.map((p) => p[0]));
	const rep = Math.max(1, Math.round((2 * Math.PI * rMax) / tileW));
	// arc length down the profile, for v
	const s: number[] = [0];
	for (let i = 1; i < pts.length; i++)
		s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
	for (let k = 0; k < uv.count; k++) {
		const i = k % pts.length;
		const u = uv.getX(k);
		uv.setXY(k, u * rep, (pts[0][1] + s[i]) / tileH);
	}
	pos.needsUpdate = true;
	return g;
}

// 3D value noise, for the rock
function vn3(x: number, y: number, z: number, salt: number) {
	const xi = Math.floor(x),
		yi = Math.floor(y),
		zi = Math.floor(z);
	const fx = x - xi,
		fy = y - yi,
		fz = z - zi;
	const s = (t: number) => t * t * (3 - 2 * t);
	const ux = s(fx),
		uy = s(fy),
		uz = s(fz);
	const h = (i: number, j: number, k: number) => hash(i * 73856 + j * 19349 + k * 83492, salt);
	const L = (a: number, b: number, t: number) => a + (b - a) * t;
	return L(
		L(L(h(xi, yi, zi), h(xi + 1, yi, zi), ux), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), ux), uy),
		L(
			L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), ux),
			L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), ux),
			uy
		),
		uz
	);
}

function rockMass(seed: number) {
	const { R, rockTop, depth } = ISLAND;
	// coarse on purpose: broken limestone is big flat faces, not a sponge
	const NT = 120,
		NY = 44;
	const pos: number[] = [],
		ao: number[] = [];
	const P = (ix: number, iy: number) => {
		const t = iy / NY;
		const th = (ix / NT) * Math.PI * 2;
		const y = rockTop - depth * Math.pow(t, 1.08) - (t > 0.97 ? (t - 0.97) * 6 : 0);
		// the mass: fullest just under the wall, then narrowing to a point
		const bulge = 1 + 0.06 * Math.sin(Math.min(t, 0.25) * Math.PI * 2);
		// flush with the wall where it meets it, fuller just below
		const lip = t < 0.1 ? t / 0.1 : 1;
		let rb = (R + 0.22 * lip * lip * (3 - 2 * lip)) * Math.pow(1 - t, 0.78) * bulge;
		// lobes, turning a little as they go down
		const lobes =
			1 +
			0.09 * Math.sin(3 * th + 1.3 + t * 2.2 + seed) * Math.min(1, t * 3) +
			0.06 * Math.sin(5 * th - 0.7 + t * 3.1 + seed * 2) * t +
			0.04 * Math.sin(2 * th + 4 + seed);
		rb *= lobes;
		// crags: noise in space, terraced into beds, stronger lower down
		const cx = Math.cos(th) * R,
			cz = Math.sin(th) * R;
		let n =
			vn3(cx * 0.3, y * 0.42, cz * 0.3, 7) * 0.6 + vn3(cx * 0.75, y * 0.9, cz * 0.75, 9) * 0.4;
		const bed = Math.floor(n * 4) / 4;
		n = n + (bed - n) * 0.4;
		// nothing under the wall juts in past it: the crag is fullest just below
		const craggy = Math.min(1, t * 5) * Math.min(1, rb * 0.45);
		const strata = Math.sin(y * 2.6 + vn3(cx * 0.2, y * 0.3, cz * 0.2, 11) * 4) * 0.05;
		let r = Math.max(0.02, rb + (n - 0.5) * 1.9 * craggy + strata * craggy);
		// Where it meets the wall it is the wall's own round, a little inside
		// it, and it comes out into its lobes and crags only over the first
		// metre or so below. Taken straight into them the first ring or two
		// stood out past the wall's foot here and there as a thin blade of
		// stone with nothing on top of it.
		const flush = R - 0.06;
		r = flush + (r - flush) * smoothstep(0.02, 0.15, t);
		if (y > WALL_FOOT - 0.04) r = Math.min(r, flush);
		// the tip wanders off the axis
		const off = Math.pow(t, 3);
		return {
			p: new THREE.Vector3(Math.cos(th) * r + off * 0.7, y, Math.sin(th) * r - off * 0.4),
			ao: 0.55 + 0.45 * Math.min(1, Math.max(0, n * 1.4 - 0.1)) - t * 0.15
		};
	};
	const grid: { p: THREE.Vector3; ao: number }[][] = [];
	for (let iy = 0; iy <= NY; iy++) {
		const row = [];
		for (let ix = 0; ix < NT; ix++) row.push(P(ix, iy));
		grid.push(row);
	}
	// shared corners, so the light goes smoothly over the crag: flat facets
	// facing the sky read as grey tiles stuck to it
	for (let iy = 0; iy <= NY; iy++)
		for (let ix = 0; ix < NT; ix++) {
			const v = grid[iy][ix];
			pos.push(v.p.x, v.p.y, v.p.z);
			ao.push(v.ao);
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

/** stone read from three sides, so the crag needs no unwrapping */
const triplanar = (s: THREE.WebGLProgramParametersWithUniforms) => {
	s.vertexShader = s.vertexShader
		.replace(
			'void main() {',
			'attribute float aAo;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nvarying float vAo;\nvoid main() {'
		)
		.replace(
			'#include <begin_vertex>',
			`#include <begin_vertex>
			vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
			vWNrm = normalize(mat3(modelMatrix) * objectNormal);
			vAo = aAo;`
		);
	s.fragmentShader = s.fragmentShader
		.replace(
			'void main() {',
			'uniform sampler2D uRock;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nvarying float vAo;\nvoid main() {'
		)
		.replace(
			'#include <map_fragment>',
			`{
				vec3 bw = pow(abs(vWNrm), vec3(4.0));
				bw /= bw.x + bw.y + bw.z;
				vec3 p = vWPos * 0.21;
				vec3 c = texture2D(uRock, p.zy).rgb * bw.x + texture2D(uRock, p.xz).rgb * bw.y
					+ texture2D(uRock, p.xy).rgb * bw.z;
				// moss on what faces up, in patches
				float up = smoothstep(0.25, 0.7, vWNrm.y);
				float patchN = texture2D(uRock, vWPos.xz * 0.05 + 0.3).g;
				float moss = up * smoothstep(0.42, 0.62, patchN);
				c = mix(c, vec3(0.1, 0.16, 0.06), moss * 0.85);
				diffuseColor.rgb *= c;
			}`
		)
		.replace(
			'#include <aomap_fragment>',
			`#include <aomap_fragment>
			// a ledge faces up at the underside of the island, not at the sky
			float shelf = smoothstep(0.15, 0.85, vWNrm.y) * step(vWPos.y, -1.0);
			reflectedLight.indirectDiffuse *= vAo * (1.0 - 0.7 * shelf);
			reflectedLight.indirectSpecular *= 1.0 - 0.8 * shelf;
			// what faces down is lit by the cloud below, which the sun has warmed
			float under = smoothstep(0.1, 0.8, -vWNrm.y);
			reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(1.12, 0.98, 0.84), under);
			reflectedLight.indirectSpecular *= 1.0 - 0.7 * under;
			reflectedLight.directDiffuse *= mix(0.7, 1.0, vAo);`
		);
};

export function buildIsland(mats: IslandMaterials, seed: number) {
	const group = new THREE.Group();
	const { R, lawn: RL, wallTop, rockTop } = ISLAND;

	// ── the wall and its coping ──
	const ashlar = patch(
		new THREE.MeshStandardMaterial({
			map: mats.ashlar.map,
			normalMap: mats.ashlar.normalMap,
			normalScale: new THREE.Vector2(1.2, 1.2),
			roughness: 0.9,
			metalness: 0
		}),
		'ashlar',
		nightPatch
	);
	const outer = lathe(
		[
			[R, WALL_FOOT],
			[R, wallTop]
		],
		160,
		ASHLAR.w,
		ASHLAR.h
	);
	const inner = lathe(
		[
			[RL, wallTop],
			[RL, -0.05]
		],
		160,
		ASHLAR.w,
		ASHLAR.h
	);
	const cr = (R + 0.06 - (RL - 0.04)) / 2;
	const cx = RL - 0.04 + cr;
	const cop: [number, number][] = [];
	for (let i = 0; i <= 10; i++) {
		const a = (i / 10) * Math.PI;
		cop.push([cx + Math.cos(a) * cr, wallTop + Math.sin(a) * cr * 0.55]);
	}
	const coping = lathe(cop, 160, 0.9, 0.9);
	for (const g of [outer, inner, coping]) {
		const m = new THREE.Mesh(g, ashlar);
		m.castShadow = true;
		m.receiveShadow = true;
		group.add(m);
	}

	// ── the rock ──
	const rockMat = patch(
		new THREE.MeshStandardMaterial({
			color: 0xffffff,
			roughness: 0.94,
			metalness: 0,
			envMapIntensity: 0.55
		}),
		'rock',
		(s) => {
			s.uniforms.uRock = { value: mats.rock.map };
			triplanar(s);
		},
		nightPatch
	);
	const rock = new THREE.Mesh(rockMass(seed), rockMat);
	rock.receiveShadow = true;
	rock.castShadow = true;
	group.add(rock);

	// ── the lawn ──
	const lawnU = {
		uBlobs: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 1, 0)) }
	};
	mats.lawn.repeat.set(RL, RL);
	const lawnMat = patch(
		new THREE.MeshStandardMaterial({ map: mats.lawn, roughness: 0.97, metalness: 0 }),
		'lawn',
		(s) => {
			s.uniforms.uBlobs = lawnU.uBlobs;
			s.vertexShader = s.vertexShader
				.replace('void main() {', 'varying vec2 vPlan;\nvoid main() {')
				.replace(
					'#include <begin_vertex>',
					'#include <begin_vertex>\nvPlan = (modelMatrix * vec4(transformed, 1.0)).xz;'
				);
			s.fragmentShader = s.fragmentShader
				.replace('void main() {', 'varying vec2 vPlan;\nuniform vec4 uBlobs[12];\nvoid main() {')
				.replace(
					'#include <map_fragment>',
					/* glsl */ `#include <map_fragment>
					{
						// broad patches of lusher and thinner grass, so the tiling never shows
						float n = sin(vPlan.x * 0.37 + sin(vPlan.y * 0.23) * 2.0) * sin(vPlan.y * 0.31 + sin(vPlan.x * 0.19) * 2.0);
						diffuseColor.rgb *= 0.9 + 0.16 * n;
						float ao = 1.0;
						for (int i = 0; i < 12; i++) {
							vec2 d = vPlan - uBlobs[i].xy;
							ao *= 1.0 - uBlobs[i].w * exp(-dot(d, d) / (uBlobs[i].z * uBlobs[i].z));
						}
						// darker at the foot of the wall
						ao *= 1.0 - 0.35 * smoothstep(${(RL - 0.45).toFixed(2)}, ${RL.toFixed(2)}, length(vPlan));
						diffuseColor.rgb *= ao;
					}`
				);
		},
		nightPatch
	);
	const lawnGeo = new THREE.CircleGeometry(RL + 0.01, 128);
	lawnGeo.rotateX(-Math.PI / 2);
	const lawn = new THREE.Mesh(lawnGeo, lawnMat);
	lawn.receiveShadow = true;
	group.add(lawn);

	// ── flags: a round about the rotunda, and a path to the lip ──
	const flagMat = patch(
		new THREE.MeshStandardMaterial({
			map: mats.flags.map,
			normalMap: mats.flags.normalMap,
			roughness: 0.9,
			metalness: 0,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2
		}),
		'flags',
		nightPatch
	);
	const shape = new THREE.Shape();
	shape.absarc(0, 0, 3.35, 0, Math.PI * 2, false);
	const pathW = 0.8;
	const plaza = new THREE.ShapeGeometry(shape, 64);
	const path = new THREE.PlaneGeometry(pathW * 2, RL - 3.2, 1, 1);
	path.rotateX(-Math.PI / 2);
	path.translate(0, 0, (RL + 3.2) / 2 - 0.1);
	plaza.rotateX(-Math.PI / 2);
	for (const g of [plaza, path]) {
		// planar uv from the plan, so the flags run on across both
		const p = g.getAttribute('position') as THREE.BufferAttribute;
		const uv = new Float32Array(p.count * 2);
		for (let k = 0; k < p.count; k++) {
			uv[k * 2] = p.getX(k) / FLAGS;
			uv[k * 2 + 1] = p.getZ(k) / FLAGS;
		}
		g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
		// face up
		const n = g.getAttribute('normal') as THREE.BufferAttribute;
		for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
		g.translate(0, 0.012, 0);
		const m = new THREE.Mesh(g, flagMat);
		m.receiveShadow = true;
		group.add(m);
	}

	const rim: THREE.Vector3[] = [];
	for (let i = 0; i < 48; i++) {
		const th = (i / 48) * Math.PI * 2;
		rim.push(new THREE.Vector3(cx * Math.cos(th), wallTop + cr * 0.55, -cx * Math.sin(th)));
	}
	return { group, lawn, lawnU, rim } satisfies IslandParts;
}

/**
 * Lanterns on the wall: a short stone post on the coping and a bronze lantern
 * on it, glazed. Two stand either side of where the path meets the wall, the
 * rest round the side that is seen. Their light is laid into the glow map.
 */
export function buildLanterns(
	stone: THREE.Material,
	bronze: THREE.Material,
	glass: THREE.Material
) {
	const { R, lawn: RL, wallTop } = ISLAND;
	const group = new THREE.Group();
	const lights: THREE.Vector3[] = [];
	const at = [0.19, -0.19, 1.05, -1.05, 1.95, -1.95];
	const rMid = (R + RL) / 2;
	const postGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.42, 8);
	const capGeo = new THREE.ConeGeometry(0.15, 0.13, 6);
	const baseGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.05, 6);
	const glassGeo = new THREE.CylinderGeometry(0.105, 0.09, 0.24, 6);
	for (const a of at) {
		const x = Math.sin(a) * rMid,
			z = Math.cos(a) * rMid;
		const y0 = wallTop + 0.12;
		const post = new THREE.Mesh(postGeo, stone);
		post.position.set(x, y0 + 0.21, z);
		const base = new THREE.Mesh(baseGeo, bronze);
		base.position.set(x, y0 + 0.445, z);
		const g = new THREE.Mesh(glassGeo, glass);
		g.position.set(x, y0 + 0.59, z);
		const cap = new THREE.Mesh(capGeo, bronze);
		cap.position.set(x, y0 + 0.775, z);
		for (const m of [post, base, cap]) {
			m.castShadow = true;
			m.receiveShadow = true;
		}
		group.add(post, base, g, cap);
		lights.push(new THREE.Vector3(x, y0 + 0.59, z));
	}
	return { group, lights };
}
