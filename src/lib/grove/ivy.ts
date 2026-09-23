import * as THREE from 'three';
import { leafCards, type CardSet, type TreeHandles } from './trees';
import { foliageTexture } from './textures';
import { PAV } from './pavilion';
import { ISLAND } from './island';
import { rng } from './rng';

// ─── Ivy ──────────────────────────────────────────────────────────────────
// The flat grove's pavilion wore ivy over the whole of it, with a few pale
// roses in it, and it softened the brick the way nothing else could. Here it
// climbs some of the pilasters from the plinth, runs along under the cornice,
// and hangs a few strands off it; and over the island's lip, on the side
// that is seen, it trails down the wall into the air. It is the trees' own
// leaf cards held against a wall: it clings, so it barely stirs, and only the
// strands that hang free take the wind. It grows in along its own length.

export interface Ivy {
	group: THREE.Group;
	u: TreeHandles['u'];
	/** how far there is to grow */
	sMax: number;
	dispose(): void;
}

export function buildIvy(seed: number): Ivy {
	const r = rng(seed);
	const leaf: CardSet = { anchors: [], quats: [], scales: [], ss: [], flexes: [], tints: [], crowns: [] };
	const rose: CardSet = { anchors: [], quats: [], scales: [], ss: [], flexes: [], tints: [], crowns: [] };
	const q = new THREE.Quaternion();
	const z = new THREE.Vector3(0, 0, 1);
	const roll = new THREE.Quaternion();
	let sMax = 0;

	const put = (set: CardSet, p: THREE.Vector3, n: THREE.Vector3, size: number, s: number, flex: number) => {
		set.anchors.push(p.x, p.y, p.z);
		const c = p.clone().addScaledVector(n, -1);
		set.crowns.push(c.x, c.y, c.z);
		const aim = n.clone();
		aim.x += (r() - 0.5) * 0.9;
		aim.y += (r() - 0.5) * 0.9 + 0.2;
		aim.z += (r() - 0.5) * 0.9;
		q.setFromUnitVectors(z, aim.normalize());
		roll.setFromAxisAngle(z, r() * Math.PI * 2);
		q.multiply(roll);
		set.quats.push(q.x, q.y, q.z, q.w);
		set.scales.push(size * (0.75 + r() * 0.5));
		set.ss.push(s);
		set.flexes.push(flex);
		set.tints.push(r());
		sMax = Math.max(sMax, s);
	};

	// ── up the pilasters ──
	const n8 = Math.PI / 8;
	const { Ro, floor, wallH } = PAV;
	const climbers = [0, 7, 1, 6, 3, 4].filter(() => r() < 0.75).slice(0, 4);
	if (!climbers.length) climbers.push(0, 7);
	const p = new THREE.Vector3(),
		nrm = new THREE.Vector3(),
		tang = new THREE.Vector3();
	for (const i of climbers) {
		const phi = n8 + i * (Math.PI / 4);
		nrm.set(Math.sin(phi), 0, Math.cos(phi));
		tang.set(Math.cos(phi), 0, -Math.sin(phi));
		const face = Ro + 0.16;
		const top = floor + wallH * (0.75 + r() * 0.35);
		const ph = r() * 6;
		let s = 0;
		for (let y = 0.05; y < top; y += 0.1) {
			const wander = Math.sin(y * 2.7 + ph) * 0.12;
			p.copy(nrm).multiplyScalar(face + 0.04).addScaledVector(tang, wander).setY(y);
			s += 0.1;
			const k = 1 + Math.floor(r() * 2.2);
			for (let j = 0; j < k; j++) {
				const o = p.clone().addScaledVector(tang, (r() - 0.5) * 0.3).addScaledVector(nrm, r() * 0.06);
				o.y += (r() - 0.5) * 0.08;
				put(leaf, o, nrm, 0.42, s, 0.05);
			}
			if (r() < 0.06) put(rose, p.clone().addScaledVector(nrm, 0.08), nrm, 0.26, s + 0.3, 0.05);
		}
		// along under the cornice, both ways, and a strand or two hanging
		const eaveY = floor + wallH + 0.22;
		for (const dir of [-1, 1]) {
			let ss = s;
			const run = 0.5 + r() * 0.9;
			for (let a = 0; a < run; a += 0.1) {
				const ang = phi + (dir * a) / Ro;
				const n2 = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
				p.copy(n2).multiplyScalar(Ro + 0.2).setY(eaveY + Math.sin(a * 5 + ph) * 0.06);
				ss += 0.1;
				put(leaf, p, n2, 0.4, ss, 0.08);
				if (r() < 0.35) {
					// a strand off the eave
					let hs = ss;
					const len = 0.3 + r() * 0.9;
					for (let d = 0; d < len; d += 0.09) {
						hs += 0.09;
						const hp = p.clone().addScaledVector(n2, 0.05).setY(eaveY - 0.12 - d);
						put(leaf, hp, n2, 0.32, hs, 0.1 + (d / len) * 0.5);
					}
				}
				if (r() < 0.05) put(rose, p.clone().addScaledVector(n2, 0.08), n2, 0.24, ss + 0.3, 0.1);
			}
		}
	}

	// ── over the island's lip ──
	const { R, lawn } = ISLAND;
	const strands = 16;
	for (let k = 0; k < strands; k++) {
		// the near half, where it is seen, and not across the path
		const a = (r() - 0.5) * Math.PI * 1.35;
		if (Math.abs(a) < 0.16) continue;
		const n2 = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
		// a tuft on the coping, and the fall down the wall
		let s = 0;
		for (let j = 0; j < 4; j++) {
			p.copy(n2).multiplyScalar((lawn + R) / 2 + (r() - 0.5) * 0.2).setY(0.2 + r() * 0.05);
			put(leaf, p, new THREE.Vector3(0, 1, 0).lerp(n2, 0.5).normalize(), 0.4, s, 0.15);
		}
		const len = 0.4 + r() * 1.3;
		const sway = (r() - 0.5) * 0.3;
		for (let d = 0; d < len; d += 0.08) {
			s += 0.08;
			const ang = a + (sway * d) / R;
			const n3 = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
			p.copy(n3).multiplyScalar(R + 0.1 + d * 0.03).setY(0.05 - d);
			put(leaf, p, n3, 0.36, s, 0.1 + (d / len) * 0.4);
		}
	}

	const u = { uGrow: { value: sMax + 2 }, uGrowAll: { value: 1 } };
	const bounds = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), R + 1.5);
	const ivyTex = foliageTexture('leaf', [0.06, 0.14, 0.045], 11);
	const roseTex = foliageTexture('blossom', [0.97, 0.84, 0.8], 5);
	const leaves = leafCards(leaf, ivyTex, u, bounds);
	const roses = leafCards(rose, roseTex, u, bounds.clone(), false);
	const group = new THREE.Group();
	group.add(leaves, roses);
	return {
		group,
		u,
		sMax,
		dispose() {
			for (const m of [leaves, roses]) {
				m.geometry.dispose();
				(m.material as THREE.Material).dispose();
				m.customDepthMaterial?.dispose();
			}
			ivyTex.dispose();
			roseTex.dispose();
		}
	};
}
