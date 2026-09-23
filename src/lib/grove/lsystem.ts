import * as THREE from 'three';
import { rng } from './rng';
import type { FoliageKind } from './textures';

// ─── Grammars, read in three dimensions ───────────────────────────────────
// The flat grove's grammars, kept: each still gives its own silhouette. What
// changes is the turtle. A 2D turtle turns left and right in the page; this
// one rolls on its own axis by the golden angle every time it opens a
// branch, so successive limbs spiral round the stem the way real ones do and
// a grammar that drew a fan now grows a crown. A little tropism pulls every
// shoot back toward the light, and each reading is jittered, so two trees of
// one species are two trees.

export interface Species {
	name: string;
	axiom: string;
	rules: Record<string, string>;
	angle: number;
	iters: number;
	/** how hard shoots turn back toward the sky */
	tropism: number;
	/** jitter on turns and lengths */
	vary: number;
	/** trunk radius at the base, metres, for a tree of height 7 */
	girth: number;
	/** height range, metres */
	height: [number, number];
	/** the crown's width, as a share of the tree's height */
	spread: number;
	leaf: Foliage;
}

export interface Foliage {
	/** what is painted on the cards */
	kind: FoliageKind;
	/** the size of one card of leaves, metres */
	card: number;
	/** cards at each twig end */
	cluster: number;
	/** the chance of a card at each node among the outer twigs */
	along: number;
	/** linear-sRGB base colour */
	color: [number, number, number];
}

export const SPECIES: Species[] = [
	{
		name: 'bushy',
		axiom: 'F',
		rules: { F: 'FF+[+F-F-F]-[-F+F+F]' },
		angle: 27,
		iters: 3,
		tropism: 0.03,
		vary: 0.22,
		girth: 0.2,
		height: [5.6, 6.8],
		spread: 0.85,
		leaf: { kind: 'leaf', card: 1.45, cluster: 3, along: 1, color: [0.13, 0.25, 0.08] }
	},
	{
		// an unbalanced rule: the trailing branch has no straight continuation,
		// so it grows open and lopsided rather than fractal-neat — and in
		// flower: the one pale thing in the stand, the flat grove's roses
		name: 'blossom',
		axiom: 'F',
		rules: { F: 'F[+F]F[-F][F]' },
		angle: 30,
		iters: 4,
		tropism: 0.01,
		vary: 0.3,
		girth: 0.2,
		height: [5.6, 6.8],
		spread: 1,
		leaf: { kind: 'blossom', card: 1.15, cluster: 3, along: 1, color: [0.9, 0.56, 0.62] }
	},
	{
		// the fourth grammar again, with the pull reversed: its limbs arch out
		// and hang, and the stand has one tree that weeps
		name: 'weeping',
		axiom: 'F',
		rules: { F: 'FF[+F][-F]F' },
		angle: 34,
		iters: 4,
		tropism: -0.045,
		vary: 0.3,
		girth: 0.24,
		height: [6.4, 7.6],
		spread: 0.9,
		leaf: { kind: 'narrow', card: 1.25, cluster: 3, along: 0.9, color: [0.2, 0.3, 0.1] }
	},
	{
		name: 'airy',
		axiom: 'F',
		rules: { F: 'F[+F]F[-F]F' },
		angle: 34,
		iters: 4,
		tropism: 0.015,
		vary: 0.4,
		girth: 0.21,
		height: [5.8, 7.2],
		spread: 0.72,
		leaf: { kind: 'leaf', card: 1.35, cluster: 3, along: 1, color: [0.11, 0.22, 0.12] }
	}
];

/** Undergrowth: the fourth grammar thrown wide, a low spreading clump. */
export const SHRUB: Species = {
	name: 'shrub',
	axiom: 'F',
	rules: { F: 'F[+F]F[-F]F' },
	angle: 40,
	iters: 3,
	tropism: 0.02,
	vary: 0.35,
	girth: 0.05,
	height: [0.9, 1.6],
	spread: 1.5,
	leaf: { kind: 'leaf', card: 0.8, cluster: 3, along: 1, color: [0.14, 0.26, 0.09] }
};

export interface Node {
	p: THREE.Vector3;
	parent: number;
	/** path length from the root: when growth reaches it */
	s: number;
	/** branching order: 0 trunk */
	order: number;
	/** tips in the subtree, for the pipe model */
	tips: number;
	r: number;
	/** direction of the segment that arrives here */
	dir: THREE.Vector3;
}

export interface Skeleton {
	nodes: Node[];
	/** each chain is a run of node indices; the first is where it attaches */
	chains: number[][];
	tips: number[];
	sMax: number;
	height: number;
	/** the crown's rough centre, for the canopy's shading */
	crown: THREE.Vector3;
}

const cache = new Map<string, string>();
function expand(sp: Species) {
	const key = sp.axiom + JSON.stringify(sp.rules) + sp.iters;
	let s = cache.get(key);
	if (s) return s;
	s = sp.axiom;
	for (let i = 0; i < sp.iters; i++) {
		let out = '';
		for (const ch of s) out += sp.rules[ch] ?? ch;
		s = out;
	}
	cache.set(key, s);
	return s;
}

const GOLDEN = (137.5 * Math.PI) / 180;

export function grow(sp: Species, seed: number, heightScale = 1): Skeleton {
	const r = rng(seed);
	const str = expand(sp);
	const ang = (sp.angle * Math.PI) / 180;
	const nodes: Node[] = [
		{
			p: new THREE.Vector3(),
			parent: -1,
			s: 0,
			order: 0,
			tips: 0,
			r: 0,
			dir: new THREE.Vector3(0, 1, 0)
		}
	];
	const chains: number[][] = [[0]];
	const up = new THREE.Vector3(0, 1, 0);
	// a slight lean of the whole tree, so a stand is not a row of plumb lines
	const lean = new THREE.Vector3((r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12).normalize();
	let H = lean.clone();
	let L = new THREE.Vector3(1, 0, 0).applyAxisAngle(up, r() * Math.PI * 2);
	L.sub(H.clone().multiplyScalar(L.dot(H))).normalize();
	let Uv = new THREE.Vector3().crossVectors(H, L).normalize();
	let pos = new THREE.Vector3();
	let node = 0,
		chain = 0,
		order = 0;
	const stack: {
		pos: THREE.Vector3;
		H: THREE.Vector3;
		L: THREE.Vector3;
		U: THREE.Vector3;
		node: number;
		chain: number;
		order: number;
	}[] = [];
	const q = new THREE.Quaternion();
	const rot = (axis: THREE.Vector3, a: number) => {
		q.setFromAxisAngle(axis, a);
		H.applyQuaternion(q);
		L.applyQuaternion(q);
		Uv.applyQuaternion(q);
	};
	const v = sp.vary;

	for (const ch of str) {
		switch (ch) {
			case 'F': {
				const len = 1 + (r() - 0.5) * v;
				// a little wander, and the pull back toward the sky — which the
				// trunk always feels, whatever its limbs do
				rot(L, (r() - 0.5) * v * 0.25);
				H.addScaledVector(up, order === 0 ? Math.abs(sp.tropism) + 0.04 : sp.tropism).normalize();
				L.sub(H.clone().multiplyScalar(L.dot(H))).normalize();
				Uv.crossVectors(H, L).normalize();
				pos = pos.clone().addScaledVector(H, len);
				const n: Node = {
					p: pos.clone(),
					parent: node,
					s: nodes[node].s + len,
					order,
					tips: 0,
					r: 0,
					dir: H.clone()
				};
				nodes.push(n);
				node = nodes.length - 1;
				chains[chain].push(node);
				break;
			}
			case '+':
				rot(Uv, ang * (1 + (r() - 0.5) * v));
				break;
			case '-':
				rot(Uv, -ang * (1 + (r() - 0.5) * v));
				break;
			case '[':
				rot(H, GOLDEN + (r() - 0.5) * v);
				stack.push({ pos, H: H.clone(), L: L.clone(), U: Uv.clone(), node, chain, order });
				chains.push([node]);
				chain = chains.length - 1;
				order++;
				break;
			case ']': {
				const s = stack.pop()!;
				pos = s.pos;
				H = s.H;
				L = s.L;
				Uv = s.U;
				node = s.node;
				chain = s.chain;
				order = s.order;
				break;
			}
		}
	}

	const live = chains.filter((c) => c.length > 1);
	// tips: nodes nothing grows from
	const kids = new Int32Array(nodes.length);
	for (let i = 1; i < nodes.length; i++) kids[nodes[i].parent]++;
	const tips: number[] = [];
	for (let i = nodes.length - 1; i > 0; i--) {
		if (kids[i] === 0) {
			nodes[i].tips += 1;
			tips.push(i);
		}
		nodes[nodes[i].parent].tips += nodes[i].tips;
	}

	// Size it: to a height, and then to the width the species wants. These
	// grammars grow tall and narrow by nature — the axis compounds faster than
	// its limbs — so a crown is drawn out sideways toward its width as well as
	// held in, which is what the flat grove's fitTrees did with its sx and sy.
	// Path lengths are rescaled with the limbs, so growth still reads true.
	const box = new THREE.Box3();
	for (const n of nodes) box.expandByPoint(n.p);
	const h = box.max.y - box.min.y || 1;
	const target = (sp.height[0] + r() * (sp.height[1] - sp.height[0])) * heightScale;
	const k = target / h;
	const wide = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1e-3) * k;
	const sx = Math.min(1.9, Math.max(0.6, (target * sp.spread) / wide));
	for (const n of nodes) n.p.set(n.p.x * k * sx, n.p.y * k, n.p.z * k * sx);
	for (let i = 1; i < nodes.length; i++) {
		const n = nodes[i];
		n.s = nodes[n.parent].s + n.p.distanceTo(nodes[n.parent].p);
	}
	// the pipe model: a limb carries the cross-section of everything it feeds
	const rootTips = nodes[0].tips || 1;
	const girth = sp.girth * (target / 7);
	const rTip = Math.max(0.012, girth * Math.pow(1 / rootTips, 0.5));
	for (const n of nodes) {
		n.r = Math.max(rTip, girth * Math.pow(Math.max(n.tips, 1) / rootTips, 0.5));
	}
	// the flare where a trunk meets the ground
	for (const n of nodes) {
		if (n.order === 0 && n.p.y < target * 0.12) n.r *= 1 + 0.5 * (1 - n.p.y / (target * 0.12));
	}
	nodes[0].r = nodes[1]?.r ?? girth;

	let sMax = 0;
	const crown = new THREE.Vector3();
	for (const t of tips) {
		sMax = Math.max(sMax, nodes[t].s);
		crown.add(nodes[t].p);
	}
	crown.divideScalar(Math.max(tips.length, 1));
	return { nodes, chains: live, tips, sMax, height: target, crown };
}
