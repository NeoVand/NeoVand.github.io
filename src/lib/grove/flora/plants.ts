import * as THREE from 'three';
import { rng } from '../rng';
import type { Species } from './species';
import type { Skeleton } from './turtle';
import { addBark, barkGeometry, newBark, type Placement } from './bark';
import {
	bladeTemplate,
	rosetteTemplate,
	leafGeometry,
	newLeaves,
	leafMaterial,
	leafDepth,
	barkMaterial,
	barkDepth,
	type Growth,
	type LeafInstances
} from './foliage';
import { Canopy } from './canopy';

// ─── A stand of plants ────────────────────────────────────────────────────
// Everything of one kind that stands on the island, in three draws: its wood,
// its leaves, its flowers. The grammar is run for each plant, the skeleton
// set where the plant stands, and the whole stand lit from inside by the
// canopy's light before anything is uploaded.

export interface PlantItem {
	species: Species;
	seed: number;
	pos: THREE.Vector3;
	rotY: number;
	scale: number;
}

export interface Perch {
	p: THREE.Vector3;
	flex: number;
	/** when along the growth the twig is there */
	s: number;
	/** the plant's foot and height, for the wind */
	base: THREE.Vector3;
	height: number;
}

export interface Stand {
	group: THREE.Group;
	bark: THREE.Mesh;
	leaves: THREE.Mesh;
	flowers: THREE.Mesh | null;
	items: PlantItem[];
	skeletons: Skeleton[];
	/** the tallest plant's height, and the crown's middle and reach */
	height: number;
	crown: THREE.Vector3;
	crownR: number;
	/** growth runs 0 .. sMax along each plant's wood */
	sMax: number;
	u: Growth;
	perches: Perch[];
	/** leaves and flowers, in world space, for what falls from them */
	blossoms: THREE.Vector3[];
	dispose(): void;
}

export interface StandOptions {
	barkMap: THREE.Texture;
	barkNormal: THREE.Texture;
	/** blade rows: fewer on a phone */
	rows: number;
	/** keep this fraction of the leaves */
	density: number;
	/** the thinnest wood worth drawing */
	minRadius: number;
	canopy?: Canopy;
}

/** the layer drawn only into the shadow map */
export const SHADOW_LAYER = 1;

const _m = new THREE.Matrix4(),
	_q = new THREE.Quaternion(),
	_v = new THREE.Vector3(),
	_s = new THREE.Vector3();

export function deriveAll(items: PlantItem[]) {
	return items.map((it) => it.species.derive(it.seed));
}

/**
 * Lay the stand's leaves into a canopy (the island's, if one is given, so
 * that stands shade each other), and return where each plant's leaves went.
 */
export function placeLeaves(items: PlantItem[], skels: Skeleton[], density: number) {
	const leaves = newLeaves(),
		flowers = newLeaves();
	const worldPos: THREE.Vector3[] = [];
	const areas: number[] = [];
	const flowerPos: THREE.Vector3[] = [];
	items.forEach((it, n) => {
		const sk = skels[n];
		const r = rng(it.seed ^ 0x5bd1e995);
		_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rotY);
		_m.compose(it.pos, _q, _s.set(it.scale, it.scale, it.scale));
		const h = sk.height * it.scale * (it.species.cling ? -1 : 1);
		for (const l of sk.leaves) {
			if (l.kind === 0 && r() > density) continue;
			const set = l.kind === 1 ? flowers : leaves;
			_v.copy(l.pos).applyMatrix4(_m);
			set.pos.push(_v.x, _v.y, _v.z);
			const q = _q.clone().multiply(l.quat);
			set.quat.push(q.x, q.y, q.z, q.w);
			// thinned leaves grow a little to cover for their neighbours
			const sc = l.scale * it.scale * (l.kind === 0 ? 1 / Math.sqrt(Math.max(density, 0.3)) : 1);
			set.data.push(sc, Math.min(1, l.arc / sk.maxArc + 0.02), r(), 1);
			set.base.push(it.pos.x, it.pos.y, it.pos.z, h);
			if (l.kind === 0) {
				worldPos.push(_v.clone());
				areas.push(sc * sc * it.species.blade.w * 1.3);
			} else flowerPos.push(_v.clone());
		}
	});
	return { leaves, flowers, worldPos, areas, flowerPos };
}

/** a stand grown but not yet lit or built: its skeletons and leaf sites */
export interface Prepared {
	items: PlantItem[];
	skels: Skeleton[];
	placed: ReturnType<typeof placeLeaves>;
}

export function prepareStand(items: PlantItem[], density: number): Prepared {
	const skels = deriveAll(items);
	return { items, skels, placed: placeLeaves(items, skels, density) };
}

/** one canopy over everything prepared, so every stand shades the others */
export function sharedCanopy(preps: Prepared[]) {
	const lo = new THREE.Vector3(Infinity, Infinity, Infinity),
		hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
	for (const pr of preps)
		for (const p of pr.placed.worldPos) {
			lo.min(p);
			hi.max(p);
		}
	lo.y = Math.min(lo.y, 0);
	const canopy = new Canopy(lo.subScalar(0.6), hi.addScalar(0.6), 0.3);
	for (const pr of preps) pr.placed.worldPos.forEach((p, i) => canopy.add(p, pr.placed.areas[i]));
	canopy.finish();
	return canopy;
}

export function buildStand(items: PlantItem[], opt: StandOptions, prep?: Prepared): Stand {
	const pr = prep ?? prepareStand(items, opt.density);
	const skels = pr.skels;
	const { leaves, flowers, worldPos, areas, flowerPos } = pr.placed;

	// the light inside: the island's canopy if there is one, else this stand's
	let canopy = opt.canopy;
	if (!canopy) {
		const lo = new THREE.Vector3(Infinity, Infinity, Infinity),
			hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
		for (const p of worldPos) {
			lo.min(p);
			hi.max(p);
		}
		lo.y = Math.min(lo.y, 0);
		canopy = new Canopy(lo.subScalar(0.6), hi.addScalar(0.6), 0.3);
		worldPos.forEach((p, i) => canopy!.add(p, areas[i]));
		canopy.finish();
	}
	for (let i = 0; i < leaves.pos.length / 3; i++) {
		_v.set(leaves.pos[i * 3], leaves.pos[i * 3 + 1], leaves.pos[i * 3 + 2]);
		leaves.data[i * 4 + 3] = canopy.sky(_v);
	}
	for (let i = 0; i < flowers.pos.length / 3; i++) {
		_v.set(flowers.pos[i * 3], flowers.pos[i * 3 + 1], flowers.pos[i * 3 + 2]);
		flowers.data[i * 4 + 3] = Math.min(1, canopy.sky(_v) * 1.2);
	}

	// the wood
	const bark = newBark();
	items.forEach((it, n) =>
		addBark(bark, skels[n], { pos: it.pos, rotY: it.rotY, scale: it.scale } as Placement, {
			gnarl: it.species.gnarl,
			cling: it.species.cling,
			minRadius: opt.minRadius,
			seed: (it.seed % 1000) * 0.37
		})
	);
	for (let i = 0; i < bark.sky.length; i++) {
		_v.set(bark.position[i * 3], bark.position[i * 3 + 1], bark.position[i * 3 + 2]);
		bark.sky[i] = canopy.sky(_v);
	}

	const u: Growth = {
		uGrow: { value: 2 },
		uGrowAll: { value: 1 },
		uSpring: { value: new THREE.Vector2() }
	};
	const sp = items[0].species;
	const group = new THREE.Group();
	const barkMesh = new THREE.Mesh(
		barkGeometry(bark),
		barkMaterial(u, opt.barkMap, opt.barkNormal, sp.palette.barkTint)
	);
	barkMesh.customDepthMaterial = barkDepth(u);
	barkMesh.castShadow = barkMesh.receiveShadow = true;
	group.add(barkMesh);

	const bounds = new THREE.Sphere();
	const box = new THREE.Box3().setFromArray(leaves.pos.length ? leaves.pos : [0, 0, 0]);
	box.expandByScalar(0.8);
	box.getBoundingSphere(bounds);

	const leafGeo = leafGeometry(
		bladeTemplate(sp.blade, Math.min(opt.rows, sp.rows)),
		leaves as LeafInstances
	);
	leafGeo.boundingSphere = bounds;
	const leafMesh = new THREE.Mesh(
		leafGeo,
		leafMaterial(u, sp.palette.leafTop, sp.palette.leafUnder, sp.palette.leafVary, 0.52)
	);
	leafMesh.castShadow = false;
	leafMesh.receiveShadow = true;
	group.add(leafMesh);
	// The shadow the crown casts is drawn from a third of its leaves, each
	// grown to cover for the two left out: a dappled shadow of a crown is
	// the same whichever third of its leaves casts it, and the shadow pass
	// is the second time every leaf is drawn. It lives on a layer only the
	// light's camera sees.
	if (sp.castLeaves) {
		const sub = newLeaves();
		const nL = leaves.pos.length / 3;
		for (let i = 0; i < nL; i += 3) {
			sub.pos.push(leaves.pos[i * 3], leaves.pos[i * 3 + 1], leaves.pos[i * 3 + 2]);
			sub.quat.push(
				leaves.quat[i * 4],
				leaves.quat[i * 4 + 1],
				leaves.quat[i * 4 + 2],
				leaves.quat[i * 4 + 3]
			);
			sub.data.push(leaves.data[i * 4] * 1.7, leaves.data[i * 4 + 1], leaves.data[i * 4 + 2], 1);
			sub.base.push(
				leaves.base[i * 4],
				leaves.base[i * 4 + 1],
				leaves.base[i * 4 + 2],
				leaves.base[i * 4 + 3]
			);
		}
		const sg = leafGeometry(bladeTemplate(sp.blade, 3), sub);
		sg.boundingSphere = bounds;
		const caster = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ colorWrite: false }));
		caster.customDepthMaterial = leafDepth(u);
		caster.castShadow = true;
		caster.layers.set(SHADOW_LAYER);
		group.add(caster);
	}

	let flowerMesh: THREE.Mesh | null = null;
	if (flowers.pos.length) {
		const fg = leafGeometry(rosetteTemplate(), flowers);
		fg.boundingSphere = bounds;
		const c = sp.palette.blossom;
		flowerMesh = new THREE.Mesh(fg, leafMaterial(u, c, c.clone().multiplyScalar(0.9), 0.08, 0.7));
		flowerMesh.customDepthMaterial = leafDepth(u);
		flowerMesh.castShadow = sp.castLeaves;
		flowerMesh.receiveShadow = true;
		group.add(flowerMesh);
	}

	// where a bird can sit: the ends of the upper wood
	const perches: Perch[] = [];
	let height = 0;
	const crown = new THREE.Vector3();
	let cn = 0;
	items.forEach((it, n) => {
		const sk = skels[n];
		_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rotY);
		_m.compose(it.pos, _q, _s.set(it.scale, it.scale, it.scale));
		const h = sk.height * it.scale;
		height = Math.max(height, h);
		for (const t of sk.tips) {
			const p = sk.pos[t].clone().applyMatrix4(_m);
			crown.add(p);
			cn++;
			if (sk.radius[t] * it.scale < 0.004) continue;
			perches.push({ p, flex: 1, s: sk.arc[t] / sk.maxArc, base: it.pos.clone(), height: h });
		}
	});
	crown.divideScalar(Math.max(cn, 1));
	let crownR = 0;
	for (const p of perches) crownR = Math.max(crownR, Math.hypot(p.p.x - crown.x, p.p.z - crown.z));

	return {
		group,
		bark: barkMesh,
		leaves: leafMesh,
		flowers: flowerMesh,
		items,
		skeletons: skels,
		height,
		crown,
		crownR,
		sMax: 1,
		u,
		perches,
		blossoms: flowerPos,
		dispose() {
			group.traverse((o) => {
				const m = o as THREE.Mesh;
				if (!m.isMesh) return;
				m.geometry.dispose();
				(m.material as THREE.Material).dispose();
				m.customDepthMaterial?.dispose();
			});
		}
	};
}
