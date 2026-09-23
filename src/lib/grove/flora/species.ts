import * as THREE from 'three';
import { rng, lerp } from '../rng';
import { Turtle, newSkeleton, taperRadii, type Skeleton } from './turtle';

// ─── What grows here ──────────────────────────────────────────────────────
// Each species is a grammar and a palette. The grammar is productions: what
// a limb of a given vigour becomes — wood, then limbs of less vigour set off
// round it at the golden angle, then the limb going on — until the vigour
// runs down to a leafy shoot. Leaves come only there, at the ends, where
// they are on a tree, and never on the structural wood.

export interface Palette {
	/** the top of a leaf, and its underside, which on an olive is silver */
	leafTop: THREE.Color;
	leafUnder: THREE.Color;
	/** how much leaf to leaf colour wanders */
	leafVary: number;
	blossom: THREE.Color;
	barkTint: THREE.Color;
}

export interface Species {
	name: string;
	/**
	 * Grow one plant. `avoid`, in the plant's own frame, is where its wood
	 * and leaves may not go: a building beside it, say.
	 */
	derive(seed: number, avoid?: (p: THREE.Vector3) => boolean): Skeleton;
	/** leaf blade: half-width and length as a fraction of its scale, cup, droop */
	blade: { w: number; cup: number; droop: number };
	palette: Palette;
	/** gnarl of the bark's silhouette, 0 smooth .. 1 old olive */
	gnarl: number;
	/** how thick the foot of the trunk is, the thinnest twig, the pipe
	 *  exponent, and the flare at the foot */
	base: number;
	tip: number;
	pipe: number;
	flare: number;
	/** how much the whole plant gives in the wind */
	flex: number;
	/** rows in a blade, at most, and whether the leaves cast shadows */
	rows: number;
	castLeaves: boolean;
	/** held against a wall, so the wind barely moves it */
	cling?: boolean;
}

const up = new THREE.Vector3(0, 1, 0);

/** the wall the ivy grows over: set by the island */
export const VINE_WALL = { R: 7.0, lawn: 6.7, wallTop: 0.42 };

/**
 * The olive. A short, thick trunk that twists as it rises and parts low into
 * two or three leaders; limbs that spread and lift at their ends; and, at
 * the ends of everything, shoots of narrow leaves in opposite pairs, grey-
 * green above and silver beneath, with sprays of small cream flowers at some
 * of their tips. The crown is a broad, broken dome, with sky through it.
 */
interface DomeTree {
	name: string;
	blade: Species['blade'];
	palette: Palette;
	gnarl: number;
	/** how many of the shoots end in flowers, and how big and many they are */
	flowering: [number, number];
	flower: [number, number];
	cluster: [number, number];
	/** how big the leaves are */
	leaf: [number, number];
}

function domeTree(o: DomeTree): Species {
	return {
		name: o.name,
		blade: o.blade,
		palette: o.palette,
		gnarl: o.gnarl,
		base: 0.13,
		tip: 0.008,
		pipe: 2.4,
		flare: 0.7,
		flex: 0.8,
		rows: 5,
		castLeaves: true,
		derive(seed, avoid) {
			const r = rng(seed);
			const R = (a: number, b: number) => lerp(a, b, r());
			const sk = newSkeleton();
			const axes = { n: 0 };
			const t = new Turtle(sk, axes);
			// A garden olive is kept: pruned to a dome, open at the heart for the
			// light, and thick with leaf at its skin. The dome is an envelope the
			// wood may not pass; what reaches it stops and breaks into leafy
			// shoots, which is what the pruning knife makes of it.
			const heart = new THREE.Vector3(R(-0.15, 0.15), R(2.75, 3.0), R(-0.15, 0.15));
			const rx = R(2.15, 2.45),
				ry = R(1.45, 1.65);
			const inside = (p: THREE.Vector3) =>
				Math.hypot((p.x - heart.x) / rx, (p.y - heart.y) / ry, (p.z - heart.z) / rx);
			// past the dome, or where the gardener keeps it off the building
			const beyond = (p: THREE.Vector3) => inside(p) > 1 || (avoid ? avoid(p) : false);
			const _n = new THREE.Vector3();
			const flowering = R(o.flowering[0], o.flowering[1]);

			const leafPair = (s: Turtle, size: number) => {
				const out = s.p.clone().sub(heart).normalize();
				for (const side of [-1, 1]) {
					const dir = s.h
						.clone()
						.multiplyScalar(0.5)
						.addScaledVector(s.l, side * 0.85)
						.addScaledVector(up, 0.15)
						.normalize();
					const face = up
						.clone()
						.multiplyScalar(0.75)
						.addScaledVector(out, 0.6)
						.add(new THREE.Vector3(R(-0.3, 0.3), R(-0.2, 0.2), R(-0.3, 0.3)));
					s.leaf(dir, face, size * R(0.85, 1.15), 0);
				}
			};

			// a leafy shoot: short internodes, a pair of leaves at each, each pair
			// turned a quarter from the last, and flowers at some of the tips
			const shoot = (s: Turtle, n: number, size: number) => {
				for (let i = 0; i < n; i++) {
					// a shoot stops short of the wall it would grow into
					if (avoid && avoid(_n.copy(s.p).addScaledVector(s.h, 0.1))) break;
					s.forward(R(0.06, 0.085), 1, 0.02, 7, r);
					s.roll(90 + R(-12, 12));
					leafPair(s, size);
				}
				if (r() < flowering) {
					const m = o.cluster[0] + Math.floor(r() * (o.cluster[1] - o.cluster[0] + 1));
					for (let k = 0; k < m; k++) {
						const b = s.clone();
						b.roll(k * 137.5).pitch(R(20, 60));
						b.p.addScaledVector(b.h, R(0.02, 0.07));
						b.leaf(b.h, up.clone().add(b.h), R(o.flower[0], o.flower[1]), 1);
					}
				} else leafPair(s, size * 0.9);
			};

			// where the wood meets the dome: a spray of three or four shoots
			const pad = (s: Turtle) => {
				const k = 2 + Math.floor(r() * 2);
				const phase = r() * 360;
				for (let i = 0; i < k; i++) {
					const b = s.branch();
					b.roll(phase + i * (360 / k) + R(-20, 20)).pitch(R(20, 50));
					shoot(b, 3 + Math.floor(r() * 3), R(o.leaf[0], o.leaf[1]));
				}
				shoot(s, 4 + Math.floor(r() * 2), R(o.leaf[0], o.leaf[1]));
			};

			const limb = (s: Turtle, v: number, depth: number): void => {
				let len = 0.85 * Math.pow(v, 0.75);
				// no further than the dome allows
				const end = s.p.clone().addScaledVector(s.h, len);
				const pruned = beyond(end);
				if (pruned) {
					// back along the heading to the envelope
					let lo = 0,
						hi = len;
					for (let i = 0; i < 8; i++) {
						const m = (lo + hi) / 2;
						if (beyond(s.p.clone().addScaledVector(s.h, m))) hi = m;
						else lo = m;
					}
					len = Math.max(0.05, lo);
				}
				// strong wood reaches up; young wood lifts its tips to the light
				s.forward(len, Math.max(1, Math.round(len / 0.16)), 0.05 * v + 0.012, 3 + 9 * v, r);
				if (pruned || v < 0.15 || depth > 8) {
					pad(s);
					return;
				}
				// the outer wood carries leafy spurs along it, and the inner does
				// not, so the crown has a skin of leaf and a heart of wood
				const depthIn = inside(s.p);
				if (v < 0.5 && depthIn > 0.55) {
					const spurs = 1 + Math.floor(r() * 2);
					for (let k = 0; k < spurs; k++) {
						const b = s.branch();
						b.roll(R(0, 360)).pitch(R(35, 65));
						shoot(b, 2 + Math.floor(r() * 3), R(o.leaf[0] * 0.93, o.leaf[1] * 0.93));
					}
				}
				const kids = v > 0.45 ? 3 : 2;
				const phase = r() * 360;
				for (let k = 0; k < kids; k++) {
					const b = s.branch();
					b.roll(phase + k * (360 / kids) + R(-25, 25)).pitch(R(28, 50));
					limb(b, v * R(0.56, 0.7), depth + 1);
				}
				// and the limb goes on, a little less strong, a little bent
				s.roll(R(-40, 40)).pitch(R(-10, 10));
				limb(s, v * R(0.68, 0.78), depth + 1);
			};

			// the trunk: a lean, a twist as it rises, and a parting into leaders
			t.roll(R(0, 360)).pitch(R(4, 10));
			const trunk = R(0.95, 1.3);
			t.forward(trunk, 6, 0.05, 7, r);
			const leaders = r() < 0.5 ? 2 : 3;
			const phase = r() * 360;
			for (let k = 0; k < leaders; k++) {
				const b = t.branch();
				b.roll(phase + k * (360 / leaders) + R(-20, 20)).pitch(R(26, 40));
				limb(b, R(0.85, 1.0), 1);
			}
			taperRadii(sk, { base: this.base, tip: this.tip, p: this.pipe, flare: this.flare });
			return sk;
		}
	};
}

export const OLIVE = domeTree({
	name: 'olive',
	blade: { w: 0.2, cup: 0.12, droop: 0.12 },
	palette: {
		leafTop: new THREE.Color(0.11, 0.24, 0.07),
		leafUnder: new THREE.Color(0.3, 0.4, 0.22),
		leafVary: 0.24,
		blossom: new THREE.Color(0.98, 0.95, 0.86),
		barkTint: new THREE.Color(0.78, 0.74, 0.7)
	},
	gnarl: 1,
	flowering: [0.1, 0.18],
	flower: [0.06, 0.085],
	cluster: [4, 7],
	leaf: [0.15, 0.18]
});

/**
 * A tree in blossom, the other side of the door: the same pruned dome on
 * darker, smoother wood, fresh green leaves, and nearly every shoot ending
 * in a spray of pink-white flowers.
 */
export const BLOSSOM = domeTree({
	name: 'blossom',
	blade: { w: 0.32, cup: 0.14, droop: 0.14 },
	palette: {
		leafTop: new THREE.Color(0.13, 0.3, 0.06),
		leafUnder: new THREE.Color(0.28, 0.42, 0.16),
		leafVary: 0.22,
		blossom: new THREE.Color(0.98, 0.6, 0.72),
		barkTint: new THREE.Color(0.52, 0.4, 0.38)
	},
	gnarl: 0.55,
	flowering: [0.7, 0.85],
	flower: [0.085, 0.12],
	cluster: [6, 10],
	leaf: [0.13, 0.16]
});

/**
 * The Italian cypress: a single leader, dead straight, and all round it short
 * branchlets that lift and hug it, shortest at the foot and the tip and
 * longest a third of the way up, each furred with flat sprays of dark scale-
 * leaf. From any distance it is a dark flame; close to, it is soft.
 */
export const CYPRESS: Species = {
	name: 'cypress',
	blade: { w: 0.42, cup: 0.18, droop: 0.05 },
	palette: {
		leafTop: new THREE.Color(0.055, 0.1, 0.045),
		leafUnder: new THREE.Color(0.1, 0.15, 0.07),
		leafVary: 0.3,
		blossom: new THREE.Color(0.4, 0.3, 0.2),
		barkTint: new THREE.Color(0.55, 0.45, 0.38)
	},
	gnarl: 0.2,
	base: 0.09,
	tip: 0.006,
	pipe: 2.4,
	flare: 0.4,
	flex: 0.6,
	rows: 3,
	castLeaves: true,
	derive(seed) {
		const r = rng(seed);
		const R = (a: number, b: number) => lerp(a, b, r());
		const sk = newSkeleton();
		const t = new Turtle(sk, { n: 0 });
		const H = R(5.2, 6.6);
		const steps = 52;
		let phase = r() * 360;
		// the flame: fullest a third of the way up, drawn in to a point at the
		// top, the foliage closing over the leader all the way so no bare wood
		// shows between one whorl and the next
		const reachAt = (f: number) =>
			0.9 * Math.min(1, f / 0.1) * (f < 0.3 ? 0.75 + f * 0.8 : Math.pow((1 - f) / 0.7, 0.85));
		const tuft = (tt: Turtle, n: number, size: number, lift: number) => {
			for (let m = 0; m < n; m++) {
				const a = r() * Math.PI * 2;
				const dir = new THREE.Vector3(
					Math.cos(a) * (1 - lift),
					lift,
					Math.sin(a) * (1 - lift)
				).normalize();
				tt.leaf(dir, new THREE.Vector3(Math.cos(a), 0.4, Math.sin(a)), size * R(0.85, 1.15), 0);
			}
		};
		for (let i = 0; i < steps; i++) {
			const f = (i + 0.5) / steps;
			t.forward(H / steps, 1, 0.3, 1.2, r);
			if (f < 0.04) continue;
			const reach = reachAt(f);
			// sprays straight off the leader, which is what hides it
			tuft(t, f > 0.75 ? 5 : 3, Math.max(0.15, 0.24 * Math.min(1, reach / 0.4)), 0.55);
			if (reach < 0.1) continue;
			const n = 4;
			for (let k = 0; k < n; k++) {
				phase += 137.5;
				const b = t.branch();
				b.roll(phase).pitch(R(34, 48));
				const len = reach * R(0.8, 1.1);
				const segs = len > 0.4 ? 3 : 2;
				for (let j = 0; j < segs; j++) {
					b.forward(len / segs, 1, 0.12, 5, r);
					const out = b.p.clone().setY(0).normalize();
					for (let m = 0; m < 3; m++) {
						const dir = b.h
							.clone()
							.addScaledVector(b.l, R(-0.9, 0.9))
							.addScaledVector(up, 0.4)
							.normalize();
						const face = out.clone().multiplyScalar(0.8).addScaledVector(up, 0.3);
						const small = 0.55 + 0.45 * Math.min(1, reach / 0.5);
						b.leaf(dir, face, R(0.2, 0.26) * (1 - j * 0.1) * small, 0);
					}
				}
			}
		}
		// the point: the last of the leader, closed over by sprays turned up
		t.forward(0.12, 1, 0.3, 0, r);
		tuft(t, 6, 0.17, 0.85);
		t.forward(0.1, 1, 0.3, 0, r);
		tuft(t, 4, 0.13, 0.92);
		taperRadii(sk, { base: this.base, tip: this.tip, p: this.pipe, flare: this.flare });
		return sk;
	}
};

/** A flowering shrub: a mound of many stems, small leaves, flowers over it. */
function shrub(name: string, blossom: THREE.Color, flowering: number): Species {
	return {
		name,
		blade: { w: 0.3, cup: 0.15, droop: 0.15 },
		palette: {
			leafTop: new THREE.Color(0.1, 0.19, 0.07),
			leafUnder: new THREE.Color(0.2, 0.28, 0.14),
			leafVary: 0.28,
			blossom,
			barkTint: new THREE.Color(0.5, 0.42, 0.36)
		},
		gnarl: 0.3,
		base: 0.035,
		tip: 0.004,
		pipe: 2.4,
		flare: 0,
		flex: 1,
		rows: 3,
		castLeaves: false,
		derive(seed) {
			const r = rng(seed);
			const R = (a: number, b: number) => lerp(a, b, r());
			const sk = newSkeleton();
			const axes = { n: 0 };
			const root = new Turtle(sk, axes);
			const heart = new THREE.Vector3(0, 0.45, 0);
			const stems = 6 + Math.floor(r() * 4);
			for (let k = 0; k < stems; k++) {
				const s = root.branch();
				s.roll(k * 137.5 + R(-20, 20)).pitch(R(18, 55));
				const grow = (b: Turtle, v: number, d: number): void => {
					b.forward(0.22 * v + 0.06, 2, 0.05, 10, r);
					const out = b.p.clone().sub(heart).normalize();
					for (let m = 0; m < 5; m++) {
						const dir = b.h
							.clone()
							.addScaledVector(b.l, R(-1, 1))
							.addScaledVector(out, 0.5)
							.normalize();
						b.leaf(dir, up.clone().addScaledVector(out, 0.8), R(0.06, 0.085), 0);
					}
					if (d >= 3 || v < 0.3) {
						if (r() < flowering) {
							const m = 3 + Math.floor(r() * 4);
							for (let q = 0; q < m; q++) {
								const f = b.clone();
								f.roll(q * 137.5).pitch(R(10, 60));
								f.p.addScaledVector(f.h, R(0.01, 0.05)).addScaledVector(out, 0.02);
								f.leaf(f.h, up.clone().add(out), R(0.05, 0.075), 1);
							}
						}
						return;
					}
					for (let c = 0; c < 2; c++) {
						const n = b.branch();
						n.roll(c * 180 + R(-40, 40)).pitch(R(25, 45));
						grow(n, v * 0.72, d + 1);
					}
				};
				grow(s, R(0.8, 1), 0);
			}
			taperRadii(sk, { base: this.base, tip: this.tip, p: this.pipe, flare: this.flare });
			return sk;
		}
	};
}
export const WHITE_SHRUB = shrub('white shrub', new THREE.Color(0.97, 0.96, 0.92), 0.75);
export const ROSE_SHRUB = shrub('rose shrub', new THREE.Color(0.9, 0.44, 0.52), 0.6);

/**
 * Trailing ivy with a few pale flowers in it: rooted at the coping, it goes
 * out over the lip and falls down the wall and the rock, in strands that
 * branch now and then, heavy with small leaves.
 */
export const VINE: Species = {
	name: 'vine',
	blade: { w: 0.5, cup: 0.12, droop: 0.2 },
	palette: {
		leafTop: new THREE.Color(0.07, 0.15, 0.05),
		leafUnder: new THREE.Color(0.15, 0.24, 0.1),
		leafVary: 0.3,
		blossom: new THREE.Color(0.96, 0.95, 0.9),
		barkTint: new THREE.Color(0.4, 0.34, 0.28)
	},
	gnarl: 0,
	base: 0.012,
	tip: 0.004,
	pipe: 2.2,
	flare: 0,
	flex: 1,
	rows: 3,
	castLeaves: false,
	cling: true,
	derive(seed) {
		const r = rng(seed);
		const R = (a: number, b: number) => lerp(a, b, r());
		const sk = newSkeleton();
		const axes = { n: 0 };
		// The plant stands at the foot of the wall's outer face: local +z is
		// out from the island, y is height above the lawn. It is rooted in the
		// border inside the wall, climbs the inner face, goes over the coping
		// hugging it, and falls down the outer face, close against the stone.
		const { R: RI, lawn: RL, wallTop } = VINE_WALL;
		const inner = RL - RI; // the inner face, in local z
		const cz = (RL - 0.04 + RI + 0.06) / 2 - RI,
			cr = (RI + 0.06 - (RL - 0.04)) / 2;
		const out = new THREE.Vector3(0, 0, 1);
		const t = new Turtle(sk, axes);
		const x0 = R(-0.12, 0.12);
		t.p.set(x0, 0, inner - R(0.15, 0.35));
		const path: THREE.Vector3[] = [
			new THREE.Vector3(x0, 0.03, inner - 0.04),
			new THREE.Vector3(x0, wallTop - 0.02, inner - 0.035)
		];
		for (let k = 1; k < 8; k++) {
			const th = Math.PI - (k / 8) * Math.PI;
			path.push(
				new THREE.Vector3(
					x0,
					wallTop + Math.sin(th) * (cr * 0.55 + 0.03),
					cz + Math.cos(th) * (cr + 0.03)
				)
			);
		}
		path.push(new THREE.Vector3(x0, wallTop - 0.05, 0.09));
		const leafy = (tt: Turtle, face: THREE.Vector3, k: number, size: number) => {
			for (let m = 0; m < k; m++) {
				const dir = new THREE.Vector3(R(-1, 1), R(-0.8, 0.4), 0)
					.addScaledVector(face, 0.3)
					.normalize();
				const at = tt.clone();
				at.p.addScaledVector(new THREE.Vector3(1, 0, 0), R(-0.07, 0.07));
				at.leaf(
					dir,
					face.clone().add(new THREE.Vector3(R(-0.35, 0.35), R(-0.1, 0.35), R(-0.2, 0.2))),
					size * R(0.8, 1.2),
					0
				);
			}
		};
		for (const q of path) {
			t.toward(q);
			// on the lawn side and over the top, the leaves face up and out
			const f = q.z < 0 ? new THREE.Vector3(0, 1, 0.3).normalize() : out;
			leafy(t, f, 3, 0.1);
		}
		// down the outer face, a strand or two, close to the stone
		const fall = (tt: Turtle, len: number, depth: number, x: number): void => {
			let y = tt.p.y;
			const bottom = Math.max(-1.15, y - len);
			let z = 0.035;
			while (y > bottom) {
				y -= 0.08;
				x += R(-0.025, 0.025);
				z = 0.03 + Math.abs(Math.sin(y * 7 + seed)) * 0.02;
				tt.toward(new THREE.Vector3(x, y, z));
				leafy(tt, out, 3, 0.11);
				if (r() < 0.035) tt.leaf(new THREE.Vector3(0, 0.3, 1), out, R(0.05, 0.07), 1);
				if (depth < 1 && r() < 0.07) {
					const b = tt.branch();
					fall(b, (y - bottom) * R(0.4, 0.8), depth + 1, x + R(-0.15, 0.15));
				}
			}
		};
		fall(t, R(0.5, 1.5), 0, x0);
		if (r() < 0.6) {
			const b = t.branch();
			b.p.set(x0, wallTop - 0.05, 0.09);
			fall(b, R(0.4, 1.2), 1, x0 + R(-0.25, 0.25));
		}
		taperRadii(sk, { base: this.base, tip: this.tip, p: this.pipe, flare: this.flare });
		return sk;
	}
};

export const SPECIES = {
	olive: OLIVE,
	cypress: CYPRESS,
	whiteShrub: WHITE_SHRUB,
	roseShrub: ROSE_SHRUB,
	vine: VINE
};
