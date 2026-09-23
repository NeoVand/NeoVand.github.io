import * as THREE from 'three';

// ─── The turtle ───────────────────────────────────────────────────────────
// A tree is written as a grammar: a species is a set of productions, each a
// function that takes the turtle where it stands and says what grows there —
// wood forward, a turn, a branch set off to one side, a leaf, a flower — and
// which productions apply to what grows next. Written as functions rather
// than as strings to be rewritten, the grammar is read depth first, which is
// the same tree, and cheap enough to derive on every visit.
//
// What the turtle leaves behind is a skeleton: nodes, each knowing its
// parent, how far along the wood it is from the root, and which axis it is
// on; and the sites of leaves and flowers, each knowing its node. Radii are
// not drawn by the grammar at all: they are worked out afterwards, from the
// tips down, by the rule Leonardo gave — a limb is as thick as the limbs it
// becomes put together.

export interface LeafSite {
	pos: THREE.Vector3;
	quat: THREE.Quaternion;
	scale: number;
	/** 0 a leaf, 1 a flower */
	kind: number;
	/** how far along the wood from the root */
	arc: number;
	node: number;
}

export interface Skeleton {
	pos: THREE.Vector3[];
	parent: number[];
	/** which axis each node lies on: a branch set off with '[' starts one */
	axis: number[];
	arc: number[];
	radius: number[];
	order: number[];
	leaves: LeafSite[];
	/** the nodes nothing grows on from */
	tips: number[];
	height: number;
	maxArc: number;
}

export class Turtle {
	p = new THREE.Vector3();
	/** heading, left, up: a right-handed frame the turns act on */
	h = new THREE.Vector3(0, 1, 0);
	l = new THREE.Vector3(-1, 0, 0);
	u = new THREE.Vector3(0, 0, 1);
	node = 0;
	axis = 0;
	arc = 0;
	order = 0;
	constructor(
		private sk: Skeleton,
		private axes: { n: number }
	) {}

	clone() {
		const t = new Turtle(this.sk, this.axes);
		t.p.copy(this.p);
		t.h.copy(this.h);
		t.l.copy(this.l);
		t.u.copy(this.u);
		t.node = this.node;
		t.axis = this.axis;
		t.arc = this.arc;
		t.order = this.order;
		return t;
	}

	/** a branch: the same place and frame, a new axis, one order further out */
	branch() {
		const t = this.clone();
		t.axis = ++this.axes.n;
		t.order = this.order + 1;
		return t;
	}

	private rot(axis: THREE.Vector3, deg: number) {
		const q = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg));
		this.h.applyQuaternion(q).normalize();
		this.l.applyQuaternion(q).normalize();
		this.u.applyQuaternion(q).normalize();
		return this;
	}
	/** turn about up, pitch about left, roll about heading */
	turn(deg: number) {
		return this.rot(this.u.clone(), deg);
	}
	pitch(deg: number) {
		return this.rot(this.l.clone(), deg);
	}
	roll(deg: number) {
		return this.rot(this.h.clone(), deg);
	}
	/** roll until left is level, so that a pitch after it is a pitch toward
	 *  or away from the sky, whatever rolling came before */
	level() {
		const up = new THREE.Vector3(0, 1, 0);
		const l = new THREE.Vector3().crossVectors(up, this.h);
		if (l.lengthSq() < 1e-6) return this;
		this.l.copy(l.normalize());
		this.u.crossVectors(this.h, this.l).normalize();
		return this;
	}

	/** head straight for a point and grow to it */
	toward(target: THREE.Vector3, steps = 1) {
		const d = target.clone().sub(this.p);
		const len = d.length();
		if (len < 1e-5) return this;
		this.h.copy(d.divideScalar(len));
		this.level();
		if (Math.abs(this.h.y) > 0.999) {
			this.l.set(-1, 0, 0);
			this.u.crossVectors(this.h, this.l).normalize();
		}
		return this.forward(len, steps);
	}

	/**
	 * Wood forward, in `steps` pieces. Between pieces the heading bends
	 * toward the sky by `tropism` (away from it if negative) and wanders by
	 * `gnarl` degrees, which is how an old limb comes to be crooked.
	 */
	forward(len: number, steps: number, tropism = 0, gnarl = 0, r: () => number = Math.random) {
		const sk = this.sk;
		const g = new THREE.Vector3(0, 1, 0);
		const seg = len / steps;
		for (let i = 0; i < steps; i++) {
			if (tropism) {
				// bend the heading toward the vertical, keeping the frame whole
				const axis = new THREE.Vector3().crossVectors(this.h, g);
				const s = axis.length();
				if (s > 1e-4) this.rot(axis.divideScalar(s), THREE.MathUtils.radToDeg(tropism * s));
			}
			if (gnarl) {
				this.turn((r() - 0.5) * 2 * gnarl);
				this.pitch((r() - 0.5) * 2 * gnarl);
			}
			this.p.addScaledVector(this.h, seg);
			this.arc += seg;
			sk.pos.push(this.p.clone());
			sk.parent.push(this.node);
			sk.axis.push(this.axis);
			sk.arc.push(this.arc);
			sk.radius.push(0);
			sk.order.push(this.order);
			this.node = sk.pos.length - 1;
		}
		return this;
	}

	/**
	 * A leaf or a flower here, pointing `dir` and facing `face` (turned toward
	 * the light and away from the crown's middle by the caller).
	 */
	leaf(dir: THREE.Vector3, face: THREE.Vector3, scale: number, kind = 0) {
		const y = dir.clone().normalize();
		const z = face.clone().addScaledVector(y, -face.dot(y));
		if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z);
		z.normalize();
		const x = new THREE.Vector3().crossVectors(y, z);
		const m = new THREE.Matrix4().makeBasis(x, y, z);
		this.sk.leaves.push({
			pos: this.p.clone(),
			quat: new THREE.Quaternion().setFromRotationMatrix(m),
			scale,
			kind,
			arc: this.arc,
			node: this.node
		});
		return this;
	}
}

export function newSkeleton(): Skeleton {
	return {
		pos: [new THREE.Vector3()],
		parent: [-1],
		axis: [0],
		arc: [0],
		radius: [0],
		order: [0],
		leaves: [],
		tips: [],
		height: 0,
		maxArc: 0
	};
}

/**
 * Radii. The pipe model says a limb is as thick as the limbs it becomes put
 * together, and that is right in proportion; but counted from the tips it
 * makes a trunk as thick as its thousand twigs, and it steps the radius down
 * at every fork, so the wood looks jointed. So the proportions are the pipe
 * model's, measured in the wood each node carries rather than its tips, and
 * scaled so the foot is `base`; then each stem is smoothed along its length
 * and never allowed to thicken, and a branch starts no thicker than most of
 * the stem it leaves, buried in it. At the foot, Weber and Penn's flare.
 */
export function taperRadii(
	sk: Skeleton,
	opt: { base: number; tip: number; p: number; flare?: number; lobes?: number }
) {
	const n = sk.pos.length;
	// the wood each node carries: its own segment and everything beyond it
	const mass = new Float64Array(n);
	const kids = new Int32Array(n);
	for (let i = 1; i < n; i++) kids[sk.parent[i]]++;
	sk.tips = [];
	for (let i = 0; i < n; i++) if (kids[i] === 0) sk.tips.push(i);
	for (let i = n - 1; i >= 1; i--) {
		mass[i] += Math.max(1e-4, sk.arc[i] - sk.arc[sk.parent[i]]);
		mass[sk.parent[i]] += mass[i];
	}
	mass[0] = Math.max(mass[0], 1e-4);
	// A stem never simply stops where it forks. Read as the grammar writes
	// it, a fork ends its stem and starts every limb as a stem of its own, so
	// the wood would end in an open ring with thinner tubes begun inside it.
	// Instead the strongest limb out of every fork carries the stem on, on
	// the same axis, so the wood runs through the fork in one piece and only
	// the lesser limbs spring from its side.
	const children: number[][] = Array.from({ length: n }, () => []);
	for (let i = 1; i < n; i++) children[sk.parent[i]].push(i);
	for (let i = 0; i < n; i++) {
		const ch = children[i];
		if (!ch.length || ch.some((c) => sk.axis[c] === sk.axis[i])) continue;
		let best = ch[0];
		for (const c of ch) if (mass[c] > mass[best]) best = c;
		const from = sk.axis[best],
			to = sk.axis[i];
		for (let j = best; j < n; j++)
			if (sk.axis[j] === from) {
				sk.axis[j] = to;
				sk.order[j] = sk.order[i];
			}
	}
	const pipe = (i: number) => Math.max(opt.tip, opt.base * Math.pow(mass[i] / mass[0], 1 / opt.p));
	// every stem, in order along it
	const axes = new Map<number, number[]>();
	for (let i = 0; i < n; i++) {
		let l = axes.get(sk.axis[i]);
		if (!l) axes.set(sk.axis[i], (l = []));
		l.push(i);
	}
	let h = 0,
		a = 0;
	for (let i = 0; i < n; i++) {
		h = Math.max(h, Math.abs(sk.pos[i].y));
		a = Math.max(a, sk.arc[i]);
	}
	sk.height = h;
	sk.maxArc = a;
	// stems are made in order, parents first
	const ids = [...axes.keys()].sort((x, y) => x - y);
	for (const id of ids) {
		const nodes = axes.get(id)!;
		const raw = nodes.map(pipe);
		// smoothed along the stem, three nodes either way
		const sm = raw.map((_, k) => {
			let s = 0,
				w = 0;
			for (let j = -3; j <= 3; j++) {
				const q = raw[Math.min(raw.length - 1, Math.max(0, k + j))];
				const wt = 4 - Math.abs(j);
				s += q * wt;
				w += wt;
			}
			return s / w;
		});
		// no thicker than where it springs from
		const at = sk.parent[nodes[0]];
		let cap = id === 0 || at < 0 ? Infinity : sk.radius[at] * 0.85;
		for (let k = 0; k < nodes.length; k++) {
			const r = Math.max(opt.tip, Math.min(sm[k], cap));
			sk.radius[nodes[k]] = r;
			cap = r;
		}
	}
	// the flare, in the lowest eighth of the trunk
	const flare = opt.flare ?? 0;
	if (flare > 0)
		for (const i of axes.get(0) ?? []) {
			const z = sk.pos[i].y / Math.max(h, 1e-3);
			const y = Math.max(0, 1 - 8 * z);
			sk.radius[i] *= (flare * (Math.pow(100, y) - 1)) / 100 + 1;
		}
}

/** @deprecated the old count from the tips; see taperRadii */
export function pipeRadii(sk: Skeleton, tip: number, p: number) {
	taperRadii(sk, { base: tip * 12, tip, p });
}
