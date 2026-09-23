import * as THREE from 'three';
import { patch, nightPatch, U } from '../shared';
import { WIND_U } from './wind';
import type { Stand } from './plants';

// ─── Petals ───────────────────────────────────────────────────────────────
// Shake a flowering tree and some of its flowers let go. A petal does not
// fall so much as sink, at a walking pace at most, rocking from side to side
// and turning as it goes, carried off down the wind; it settles or leaves the
// island and is gone. Now and then one lets go by itself.

const MAX = 90;

interface Petal {
	p: THREE.Vector3;
	v: THREE.Vector3;
	rot: THREE.Euler;
	spin: THREE.Vector3;
	age: number;
	life: number;
	size: number;
	phase: number;
}

function petalGeometry() {
	// a small cupped oval, two triangles each side of a crease
	const g = new THREE.BufferGeometry();
	const p = [0, 0, 0, 0.5, 0.45, 0.08, 0, 1, 0, -0.5, 0.45, 0.08];
	g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
	g.setIndex([0, 1, 2, 0, 2, 3]);
	g.computeVertexNormals();
	g.translate(0, -0.5, 0);
	return g;
}

export class Petals {
	mesh: THREE.InstancedMesh;
	private ps: Petal[] = [];
	private next = 0;
	private m = new THREE.Matrix4();
	private q = new THREE.Quaternion();
	private s = new THREE.Vector3();
	private idle = 3;

	constructor() {
		const mat = patch(
			new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }),
			'petal',
			nightPatch
		);
		this.mesh = new THREE.InstancedMesh(petalGeometry(), mat, MAX);
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		const zero = new THREE.Matrix4().makeScale(0, 0, 0);
		for (let i = 0; i < MAX; i++) {
			this.mesh.setMatrixAt(i, zero);
			this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
			this.ps.push({
				p: new THREE.Vector3(),
				v: new THREE.Vector3(),
				rot: new THREE.Euler(),
				spin: new THREE.Vector3(),
				age: 0,
				life: 0,
				size: 0,
				phase: 0
			});
		}
	}

	/** let go of `n` flowers from the stand, those nearest `near` first */
	shed(st: Stand, near: THREE.Vector3 | null, n: number) {
		const src = st.blossoms;
		if (!src.length) return;
		const col = st.items[0].species.palette.blossom;
		const pick: THREE.Vector3[] = [];
		if (near) {
			const sorted = src
				.map((p) => [p.distanceToSquared(near), p] as const)
				.sort((a, b) => a[0] - b[0])
				.slice(0, n * 3);
			for (let k = 0; k < n; k++) pick.push(sorted[Math.floor(Math.random() * sorted.length)][1]);
		} else for (let k = 0; k < n; k++) pick.push(src[Math.floor(Math.random() * src.length)]);
		for (const at of pick) {
			const i = this.next++ % MAX;
			const pt = this.ps[i];
			pt.p.copy(at);
			pt.v.set((Math.random() - 0.5) * 0.3, Math.random() * 0.25, (Math.random() - 0.5) * 0.3);
			pt.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
			pt.spin.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5);
			pt.age = 0;
			pt.life = 5 + Math.random() * 4;
			// larger than life, or at this distance they are a pixel
			pt.size = 0.11 + Math.random() * 0.05;
			pt.phase = Math.random() * 6.28;
			this.mesh.setColorAt(
				i,
				new THREE.Color().copy(col).multiplyScalar(0.92 + Math.random() * 0.1)
			);
		}
		if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
	}

	update(dt: number, stands: Stand[], reduced: boolean) {
		// now and then, one by itself
		this.idle -= dt;
		if (this.idle < 0 && !reduced) {
			this.idle = 1.5 + Math.random() * 3;
			const st = stands[Math.floor(Math.random() * stands.length)];
			if (st) this.shed(st, null, 1);
		}
		const wd = WIND_U.uWindDir.value;
		const wind = U.uWind.value;
		const t = U.uTime.value;
		for (let i = 0; i < MAX; i++) {
			const pt = this.ps[i];
			if (pt.life <= 0) continue;
			pt.age += dt;
			if (pt.age > pt.life || pt.p.y < -9) {
				pt.life = 0;
				this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
				continue;
			}
			// sink toward a slow terminal speed, rock, and go down the wind
			const rock = Math.sin(t * 2.2 + pt.phase);
			pt.v.y += (-0.45 - pt.v.y) * Math.min(1, dt * 2.5);
			pt.v.x += (wd.x * 0.55 * wind + rock * 0.35 - pt.v.x) * Math.min(1, dt * 1.5);
			pt.v.z +=
				(wd.y * 0.55 * wind + Math.cos(t * 1.7 + pt.phase) * 0.3 - pt.v.z) * Math.min(1, dt * 1.5);
			pt.p.addScaledVector(pt.v, dt);
			// on the lawn, it rests until it fades
			if (pt.p.y < 0.02 && Math.hypot(pt.p.x, pt.p.z) < 6.6) {
				pt.p.y = 0.02;
				pt.v.set(0, 0, 0);
				pt.spin.multiplyScalar(0.8);
				pt.rot.x = Math.PI / 2;
			}
			pt.rot.x += pt.spin.x * dt;
			pt.rot.y += pt.spin.y * dt;
			pt.rot.z += pt.spin.z * dt;
			const fade = Math.min(1, pt.age * 4) * Math.min(1, (pt.life - pt.age) * 1.5);
			this.q.setFromEuler(pt.rot);
			this.s.setScalar(pt.size * fade);
			this.mesh.setMatrixAt(i, this.m.compose(pt.p, this.q, this.s));
		}
		this.mesh.instanceMatrix.needsUpdate = true;
	}
}
