import * as THREE from 'three';
import type { Skeleton } from './turtle';

// ─── The wood ─────────────────────────────────────────────────────────────
// Every axis of the skeleton is one tube: rings at its nodes, framed by
// parallel transport so the bark never twists on itself, and begun at the
// node it springs from so that a limb grows out of its parent rather than
// standing beside it. A ring has as many sides as its thickness is worth.
//
// An old olive is not round: its trunk is fluted and knuckled, and flares
// at the foot into roots. That is a coherent wobble in the radius, smooth
// round the ring and along the wood, strongest low on the thick stems.
//
// Each vertex knows the centre of its ring and the centre of the ring
// before, and when each was reached by the growing tree, which is all the
// vertex shader needs to grow it; and the plant's foot and height, for the
// wind.

export interface Placement {
	pos: THREE.Vector3;
	rotY: number;
	scale: number;
}

export interface BarkBuffers {
	position: number[];
	normal: number[];
	uv: number[];
	center: number[];
	parent: number[];
	birth: number[]; // (from, to) along the growth
	base: number[]; // foot xyz, height
	sky: number[];
	index: number[];
}

export function newBark(): BarkBuffers {
	return {
		position: [],
		normal: [],
		uv: [],
		center: [],
		parent: [],
		birth: [],
		base: [],
		sky: [],
		index: []
	};
}

function sidesFor(r: number) {
	return r > 0.12 ? 18 : r > 0.06 ? 12 : r > 0.03 ? 8 : r > 0.015 ? 6 : 4;
}

/** a smooth, repeatable wobble round and along a stem */
function wobble(seed: number, a: number, s: number) {
	return (
		Math.sin(a * 3 + s * 1.7 + seed) * 0.5 +
		Math.sin(a * 5 - s * 2.9 + seed * 1.3) * 0.3 +
		Math.sin(a * 2 + s * 4.3 + seed * 2.1) * 0.2
	);
}

export function addBark(
	out: BarkBuffers,
	sk: Skeleton,
	at: Placement,
	opts: { gnarl: number; minRadius: number; seed: number; cling?: boolean }
) {
	const m = new THREE.Matrix4().compose(
		at.pos,
		new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), at.rotY),
		new THREE.Vector3(at.scale, at.scale, at.scale)
	);
	const nm = new THREE.Matrix3().getNormalMatrix(m);
	const height = sk.height * at.scale * (opts.cling ? -1 : 1);
	// axes: every node, grouped by the axis it lies on, in order
	const axes = new Map<number, number[]>();
	for (let i = 1; i < sk.pos.length; i++) {
		const a = sk.axis[i];
		let l = axes.get(a);
		if (!l) axes.set(a, (l = []));
		l.push(i);
	}
	const T = new THREE.Vector3(),
		N = new THREE.Vector3(),
		B = new THREE.Vector3(),
		prevT = new THREE.Vector3(),
		q = new THREE.Quaternion(),
		v = new THREE.Vector3(),
		c = new THREE.Vector3(),
		pc = new THREE.Vector3(),
		n = new THREE.Vector3();
	const maxArc = sk.maxArc;
	for (const nodes of axes.values()) {
		const chain = [sk.parent[nodes[0]], ...nodes];
		const r0 = sk.radius[nodes[0]];
		if (r0 * at.scale < opts.minRadius) continue;
		const sides = sidesFor(r0 * at.scale);
		const base = out.position.length / 3;
		// the first frame: any normal square to the first tangent
		T.subVectors(sk.pos[chain[1]], sk.pos[chain[0]]).normalize();
		N.set(0, 1, 0).cross(T);
		if (N.lengthSq() < 1e-6) N.set(1, 0, 0).cross(T);
		N.normalize();
		prevT.copy(T);
		const around = Math.max(1, Math.round((2 * Math.PI * r0 * at.scale) / 0.32));
		for (let k = 0; k < chain.length; k++) {
			const id = chain[k];
			const a = chain[Math.max(0, k - 1)],
				b = chain[Math.min(chain.length - 1, k + 1)];
			T.subVectors(sk.pos[b], sk.pos[a]).normalize();
			// carry the frame along: rotate it by the turn of the tangent
			q.setFromUnitVectors(prevT, T);
			N.applyQuaternion(q).normalize();
			prevT.copy(T);
			B.crossVectors(T, N).normalize();
			// the ring at the branch point takes the child's radius, not the
			// parent's, and sits a little back inside the parent
			let r = sk.radius[k === 0 ? nodes[0] : id];
			const p = sk.pos[id];
			const s = sk.arc[id];
			// the thick stems are fluted and a little knuckled (the flare at the
			// foot is in the radius already)
			const g = opts.gnarl * Math.min(1, r / 0.1) * 0.1;
			c.copy(p).applyMatrix4(m);
			const par = sk.parent[id] >= 0 ? sk.parent[id] : id;
			pc.copy(sk.pos[k === 0 ? id : par]).applyMatrix4(m);
			const b0 = k === 0 ? sk.arc[id] : sk.arc[par];
			for (let j = 0; j <= sides; j++) {
				const ang = (j / sides) * Math.PI * 2;
				const ca = Math.cos(ang),
					sa = Math.sin(ang);
				// five lobes on the old wood, and the buttresses of the roots
				// where the foot flares
				const foot = Math.exp(-Math.max(p.y, 0) / 0.25) * Math.min(1, r / 0.08);
				const lobe = Math.sin(ang * 5 + opts.seed) * (0.05 * Math.min(1, r / 0.08) + 0.12 * foot);
				const rr = r * (1 + g * wobble(opts.seed + id * 0.01, ang, s * 2.2) + lobe);
				n.copy(N).multiplyScalar(ca).addScaledVector(B, sa);
				v.copy(p).addScaledVector(n, rr).applyMatrix4(m);
				out.position.push(v.x, v.y, v.z);
				n.applyMatrix3(nm).normalize();
				out.normal.push(n.x, n.y, n.z);
				out.uv.push((j / sides) * around, (s * at.scale) / 0.32);
				out.center.push(c.x, c.y, c.z);
				out.parent.push(pc.x, pc.y, pc.z);
				out.birth.push(b0 / maxArc, s / maxArc);
				out.base.push(at.pos.x, at.pos.y, at.pos.z, height);
				out.sky.push(1);
			}
			if (k > 0) {
				const r1 = base + k * (sides + 1),
					r0i = base + (k - 1) * (sides + 1);
				for (let j = 0; j < sides; j++) {
					const a0 = r0i + j,
						a1 = r0i + j + 1,
						b0i = r1 + j,
						b1 = r1 + j + 1;
					// counter-clockwise seen from outside: T x B = -N would face in
					out.index.push(a0, a1, b0i, a1, b1, b0i);
				}
			}
		}
	}
}

export function barkGeometry(b: BarkBuffers) {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(b.position, 3));
	g.setAttribute('normal', new THREE.Float32BufferAttribute(b.normal, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
	g.setAttribute('aCenter', new THREE.Float32BufferAttribute(b.center, 3));
	g.setAttribute('aParent', new THREE.Float32BufferAttribute(b.parent, 3));
	g.setAttribute('aBirth', new THREE.Float32BufferAttribute(b.birth, 2));
	g.setAttribute('aBase', new THREE.Float32BufferAttribute(b.base, 4));
	g.setAttribute('aSky', new THREE.Float32BufferAttribute(b.sky, 1));
	g.setIndex(b.index);
	g.computeBoundingSphere();
	return g;
}
