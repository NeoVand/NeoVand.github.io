import * as THREE from 'three';
import { rng, lerp } from '../rng';
import { Turtle, newSkeleton, pipeRadii, type Skeleton } from './turtle';

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
	derive(seed: number): Skeleton;
	/** leaf blade: half-width and length as a fraction of its scale, cup, droop */
	blade: { w: number; cup: number; droop: number };
	palette: Palette;
	/** gnarl of the bark's silhouette, 0 smooth .. 1 old olive */
	gnarl: number;
	/** how thick the thinnest twig is, and the pipe exponent */
	tip: number;
	pipe: number;
	/** how much the whole plant gives in the wind */
	flex: number;
	/** rows in a blade, at most, and whether the leaves cast shadows */
	rows: number;
	castLeaves: boolean;
}

const up = new THREE.Vector3(0, 1, 0);

/**
 * The olive. A short, thick trunk that twists as it rises and parts low into
 * two or three leaders; limbs that spread and lift at their ends; and, at
 * the ends of everything, shoots of narrow leaves in opposite pairs, grey-
 * green above and silver beneath, with sprays of small cream flowers at some
 * of their tips. The crown is a broad, broken dome, with sky through it.
 */
export const OLIVE: Species = {
	name: 'olive',
	blade: { w: 0.2, cup: 0.12, droop: 0.12 },
	palette: {
		leafTop: new THREE.Color(0.19, 0.29, 0.13),
		leafUnder: new THREE.Color(0.5, 0.57, 0.44),
		leafVary: 0.22,
		blossom: new THREE.Color(0.98, 0.95, 0.86),
		barkTint: new THREE.Color(0.78, 0.74, 0.7)
	},
	gnarl: 1,
	tip: 0.0085,
	pipe: 2.6,
	flex: 0.8,
	rows: 5,
	castLeaves: true,
	derive(seed) {
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
		const flowering = R(0.12, 0.22);

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
				s.forward(R(0.06, 0.085), 1, 0.02, 7, r);
				s.roll(90 + R(-12, 12));
				leafPair(s, size);
			}
			if (r() < flowering) {
				const m = 4 + Math.floor(r() * 4);
				for (let k = 0; k < m; k++) {
					const b = s.clone();
					b.roll(k * 137.5).pitch(R(20, 60));
					b.p.addScaledVector(b.h, R(0.02, 0.07));
					b.leaf(b.h, up.clone().add(b.h), R(0.06, 0.085), 1);
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
				shoot(b, 3 + Math.floor(r() * 3), R(0.15, 0.18));
			}
			shoot(s, 4 + Math.floor(r() * 2), R(0.15, 0.18));
		};

		const limb = (s: Turtle, v: number, depth: number): void => {
			let len = 0.85 * Math.pow(v, 0.75);
			// no further than the dome allows
			const end = s.p.clone().addScaledVector(s.h, len);
			const over = inside(end);
			const pruned = over > 1;
			if (pruned) {
				// back along the heading to the envelope
				let lo = 0,
					hi = len;
				for (let i = 0; i < 8; i++) {
					const m = (lo + hi) / 2;
					if (inside(s.p.clone().addScaledVector(s.h, m)) > 1) hi = m;
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
					shoot(b, 2 + Math.floor(r() * 3), R(0.14, 0.17));
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
		pipeRadii(sk, this.tip, this.pipe);
		return sk;
	}
};

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
	tip: 0.006,
	pipe: 2.4,
	flex: 0.6,
	rows: 3,
	castLeaves: true,
	derive(seed) {
		const r = rng(seed);
		const R = (a: number, b: number) => lerp(a, b, r());
		const sk = newSkeleton();
		const t = new Turtle(sk, { n: 0 });
		const H = R(5.2, 6.6);
		const steps = 34;
		let phase = r() * 360;
		for (let i = 0; i < steps; i++) {
			const f = (i + 0.5) / steps;
			t.forward(H / steps, 1, 0.3, 1.2, r);
			if (f < 0.04) continue;
			// the spindle: fullest a third of the way up
			const reach =
				0.95 *
				Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.04)), 0.7) *
				(f < 0.33 ? 0.7 + f : 1.08 - f * 0.55);
			const n = 5;
			for (let k = 0; k < n; k++) {
				phase += 137.5;
				const b = t.branch();
				b.roll(phase).pitch(R(34, 48));
				const len = reach * R(0.75, 1.1);
				const segs = 3;
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
						b.leaf(dir, face, R(0.2, 0.27) * (1 - j * 0.12), 0);
					}
				}
			}
		}
		// the tip, a last tuft
		for (let k = 0; k < 5; k++) {
			const dir = up
				.clone()
				.add(new THREE.Vector3(R(-0.3, 0.3), 0, R(-0.3, 0.3)))
				.normalize();
			t.leaf(dir, new THREE.Vector3(R(-1, 1), 0, R(-1, 1)), R(0.18, 0.24), 0);
		}
		pipeRadii(sk, this.tip, this.pipe);
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
		tip: 0.004,
		pipe: 2.4,
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
			pipeRadii(sk, this.tip, this.pipe);
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
	tip: 0.004,
	pipe: 2.2,
	flex: 1,
	rows: 3,
	castLeaves: false,
	derive(seed) {
		const r = rng(seed);
		const R = (a: number, b: number) => lerp(a, b, r());
		const sk = newSkeleton();
		const axes = { n: 0 };
		// local +z is outward from the island
		const strand = (t: Turtle, len: number, depth: number): void => {
			const n = Math.floor(len / 0.08);
			for (let i = 0; i < n; i++) {
				// over the lip and then straight down, with a little wander
				t.forward(0.08, 1, i < 2 ? -0.5 : -0.25, 7, r);
				t.p.z = Math.max(t.p.z, 0.02 + (t.p.y < -0.05 ? 0.05 : 0));
				const out = new THREE.Vector3(0, 0, 1);
				for (let m = 0; m < 4; m++) {
					const dir = new THREE.Vector3(R(-1, 1), R(-0.6, 0.3), 0.4).normalize();
					const leafAt = t.clone();
					leafAt.p.x += R(-0.06, 0.06);
					leafAt.leaf(
						dir,
						out.clone().add(new THREE.Vector3(R(-0.3, 0.3), R(0, 0.4), 0)),
						R(0.08, 0.13),
						0
					);
				}
				if (r() < 0.05)
					t.leaf(new THREE.Vector3(0, 0.3, 1), new THREE.Vector3(0, 0, 1), R(0.05, 0.07), 1);
				if (depth < 2 && r() < 0.1) {
					const b = t.branch();
					b.roll(R(-60, 60));
					strand(b, len * R(0.3, 0.6), depth + 1);
				}
			}
		};
		// two or three strands from each root, of different lengths
		const k = 2 + Math.floor(r() * 2);
		for (let i = 0; i < k; i++) {
			const t = new Turtle(sk, axes).branch();
			t.p.x = R(-0.2, 0.2);
			t.pitch(-80).turn(R(-25, 25));
			strand(t, R(0.5, 2.8), 0);
		}
		pipeRadii(sk, this.tip, this.pipe);
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
