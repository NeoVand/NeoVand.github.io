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
		leafTop: new THREE.Color(0.2, 0.27, 0.15),
		leafUnder: new THREE.Color(0.52, 0.57, 0.47),
		leafVary: 0.22,
		blossom: new THREE.Color(0.98, 0.95, 0.86),
		barkTint: new THREE.Color(0.78, 0.74, 0.7)
	},
	gnarl: 1,
	tip: 0.0085,
	pipe: 2.6,
	flex: 0.8,
	derive(seed) {
		const r = rng(seed);
		const R = (a: number, b: number) => lerp(a, b, r());
		const sk = newSkeleton();
		const axes = { n: 0 };
		const t = new Turtle(sk, axes);
		// the crown's middle, to turn leaves toward the outside and the light
		const heart = new THREE.Vector3(0, 3.4, 0);
		const flowering = R(0.1, 0.2);

		const shoot = (s: Turtle, v: number) => {
			// a leafy shoot: a few short internodes, a pair of leaves at each,
			// each pair turned a quarter from the last
			const n = 4 + Math.floor(r() * 3);
			s.pitch(R(-12, 12));
			for (let i = 0; i < n; i++) {
				s.forward(R(0.07, 0.1), 1, -0.08, 6, r);
				s.roll(90 + R(-12, 12));
				const out = s.p.clone().sub(heart).normalize();
				for (const side of [-1, 1]) {
					const dir = s.h
						.clone()
						.multiplyScalar(0.55)
						.addScaledVector(s.l, side * 0.85)
						.addScaledVector(up, 0.1)
						.normalize();
					const face = up
						.clone()
						.multiplyScalar(0.7)
						.addScaledVector(out, 0.55)
						.add(new THREE.Vector3(R(-0.3, 0.3), R(-0.2, 0.2), R(-0.3, 0.3)));
					s.leaf(dir, face, R(0.1, 0.14) * (0.85 + v), 0);
				}
			}
			// the tip: a last pair along the shoot, or a spray of flowers
			if (r() < flowering) {
				const m = 3 + Math.floor(r() * 4);
				for (let k = 0; k < m; k++) {
					const b = s.clone();
					b.roll(k * 137.5).pitch(R(20, 55));
					b.p.addScaledVector(b.h, R(0.02, 0.06));
					b.leaf(b.h, up.clone().add(b.h), R(0.055, 0.08), 1);
				}
			} else {
				const out = s.p.clone().sub(heart).normalize();
				s.leaf(s.h, up.clone().addScaledVector(out, 0.5), R(0.11, 0.14), 0);
			}
		};

		const limb = (s: Turtle, v: number, depth: number): void => {
			const len = 0.9 * Math.pow(v, 0.75);
			// strong wood reaches up; the young wood spreads and lets itself down
			s.forward(len, Math.max(1, Math.round(len / 0.18)), 0.07 * v - 0.012, 3 + 9 * v, r);
			if (v < 0.16 || depth > 8) {
				shoot(s, v);
				return;
			}
			// the younger wood carries spurs of leaf along it, not only at its end
			if (v < 0.36) {
				const spurs = r() < 0.6 ? 1 : 2;
				for (let k = 0; k < spurs; k++) {
					const b = s.branch();
					b.roll(R(0, 360)).pitch(R(35, 60));
					shoot(b, 0.1);
				}
			}
			const kids = v > 0.45 ? 3 : 2;
			const phase = r() * 360;
			for (let k = 0; k < kids; k++) {
				const b = s.branch();
				b.roll(phase + k * (360 / kids) + R(-25, 25)).pitch(R(30, 52));
				limb(b, v * R(0.55, 0.7), depth + 1);
			}
			// and the limb goes on, a little less strong, a little bent
			s.roll(R(-40, 40)).pitch(R(-12, 12));
			limb(s, v * R(0.68, 0.78), depth + 1);
		};

		// the trunk: a lean, a twist as it rises, and a parting into leaders
		t.roll(R(0, 360)).pitch(R(4, 11));
		const trunk = R(0.9, 1.35);
		t.forward(trunk, 6, 0.05, 7, r);
		const leaders = r() < 0.55 ? 2 : 3;
		const phase = r() * 360;
		for (let k = 0; k < leaders; k++) {
			const b = t.branch();
			b.roll(phase + k * (360 / leaders) + R(-20, 20)).pitch(R(24, 40));
			limb(b, R(0.85, 1.0), 1);
		}
		pipeRadii(sk, this.tip, this.pipe);
		return sk;
	}
};

export const SPECIES = { olive: OLIVE };
