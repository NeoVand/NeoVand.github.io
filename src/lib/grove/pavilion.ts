import * as THREE from 'three';
import { revolve, coursesAlong, planarBrickUV, merge, type ProfilePoint } from './masonry';
import { hash } from './rng';
import { patch, nightPatch } from './shared';

// ─── The pavilion ─────────────────────────────────────────────────────────
// The flat grove's gazebo was first drawn as an octagon in perspective and
// every fault it had came from the third dimension it did not have. Here it
// has one, and it is an octagon again: eight bays on a stepped plinth, the
// four on the axes open to the floor and the four between them windows with
// sills, a pilaster at every corner, and every arch turned in an odd number
// of voussoirs so there is a keystone on the centre line. Over them an
// entablature with a dentilled cornice, a round drum, and a brick dome laid
// course by course, each course dealt a whole number of bricks, with a
// copper finial. Everything in it is the island's brick and courses with it.

export const PAV = {
	floor: 0.34,
	Ro: 1.85,
	t: 0.3,
	wallH: 2.36,
	door: { half: 0.43, spring: 1.46 },
	window: { half: 0.34, sill: 0.78, spring: 1.46 }
};

export interface PavilionParts {
	group: THREE.Group;
	/** where the machine stands, and how wide the doorway is */
	floorY: number;
	/** the dome's outline from springing to crown, for birds to walk */
	roof: THREE.Vector3[];
	/** the four window sills, as runs */
	sills: [THREE.Vector3, THREE.Vector3][];
	/** the crown of the dome */
	crown: THREE.Vector3;
	/** the dome as an ellipsoid: radius, springing height, rise */
	dome: { r: number; y: number; h: number };
	height: number;
}

function flat(g: THREE.BufferGeometry) {
	const n = g.index ? g.toNonIndexed() : g;
	n.computeVertexNormals();
	return n;
}

/** An arched opening, as the outline of the wall around it. */
function bayShape(w: number, h: number, kind: 'door' | 'window') {
	const s = new THREE.Shape();
	const { half, spring } = kind === 'door' ? PAV.door : PAV.window;
	if (kind === 'door') {
		s.moveTo(-w / 2, 0);
		s.lineTo(-half, 0);
		s.lineTo(-half, spring);
		s.absarc(0, spring, half, Math.PI, 0, true);
		s.lineTo(half, 0);
		s.lineTo(w / 2, 0);
		s.lineTo(w / 2, h);
		s.lineTo(-w / 2, h);
		s.closePath();
	} else {
		s.moveTo(-w / 2, 0);
		s.lineTo(w / 2, 0);
		s.lineTo(w / 2, h);
		s.lineTo(-w / 2, h);
		s.closePath();
		const hole = new THREE.Path();
		hole.moveTo(-half, PAV.window.sill);
		hole.lineTo(half, PAV.window.sill);
		hole.lineTo(half, spring);
		hole.absarc(0, spring, half, 0, Math.PI, false);
		hole.lineTo(-half, PAV.window.sill);
		s.holes.push(hole);
	}
	return s;
}

export function buildPavilion(brick: THREE.Material, copper: THREE.Material) {
	const group = new THREE.Group();
	const { Ro, t, wallH, floor } = PAV;
	// the building's own module for its mouldings and steps; the brick itself
	// is the island's, and courses with it
	const c = 0.16;
	const n8 = Math.PI / 8;
	const ap = Ro * Math.cos(n8);
	const side = 2 * ap * Math.tan(n8);
	const parts: THREE.BufferGeometry[] = [];

	// ── the plinth: two steps and the floor ──
	const step = (rad: number, y0: number, h: number) => {
		const g = flat(new THREE.CylinderGeometry(rad, rad, h, 8, 1, false, n8));
		g.translate(0, y0 + h / 2, 0);
		return planarBrickUV(g);
	};
	parts.push(step(Ro + 0.62, 0, c), step(Ro + 0.34, c, floor - c));

	// ── the eight bays ──
	const sills: [THREE.Vector3, THREE.Vector3][] = [];
	for (let i = 0; i < 8; i++) {
		const phi = i * (Math.PI / 4);
		const kind = i % 2 === 0 ? 'door' : 'window';
		const g = new THREE.ExtrudeGeometry(bayShape(side, wallH, kind), {
			depth: t,
			bevelEnabled: false,
			curveSegments: 14
		});
		// local x across the bay, y up, z into the building; taper x with
		// depth so neighbouring bays meet in a mitre at the corners
		const p = g.getAttribute('position') as THREE.BufferAttribute;
		const radial = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
		// (tang, up, -radial) is a proper rotation, so the winding survives
		const tang = new THREE.Vector3(-Math.cos(phi), 0, Math.sin(phi));
		for (let k = 0; k < p.count; k++) {
			const x = p.getX(k),
				y = p.getY(k),
				z = p.getZ(k);
			const d = ap - z;
			const xs = x * (d / ap);
			p.setXYZ(k, radial.x * d + tang.x * xs, floor + y, radial.z * d + tang.z * xs);
		}
		const fg = planarBrickUV(flat(g));
		parts.push(fg);
		if (kind === 'window') {
			const h = PAV.window.half * 0.9;
			const mid = radial
				.clone()
				.multiplyScalar(ap + 0.02)
				.setY(floor + PAV.window.sill + 0.03);
			sills.push([mid.clone().addScaledVector(tang, -h), mid.clone().addScaledVector(tang, h)]);
		}
	}

	// ── pilasters at the corners, with a base and a cap ──
	for (let i = 0; i < 8; i++) {
		const phi = n8 + i * (Math.PI / 4);
		const mk = (w: number, h: number, dpt: number, y0: number) => {
			const g = new THREE.BoxGeometry(w, h, dpt);
			g.translate(0, y0 + h / 2, 0);
			g.rotateY(phi);
			g.translate(Math.sin(phi) * (Ro - 0.06), 0, Math.cos(phi) * (Ro - 0.06));
			return planarBrickUV(flat(g));
		};
		parts.push(mk(0.36, wallH, 0.4, floor));
		parts.push(mk(0.44, c, 0.48, floor));
		parts.push(mk(0.44, c * 0.75, 0.48, floor + PAV.door.spring - c * 0.75));
	}

	// ── entablature and cornice ──
	const ringShape = (rOut: number, rIn: number) => {
		const s = new THREE.Shape();
		const hole = new THREE.Path();
		for (let k = 0; k < 8; k++) {
			const a = n8 + (k * Math.PI) / 4;
			const f = k === 0 ? 'moveTo' : 'lineTo';
			s[f](Math.sin(a) * rOut, Math.cos(a) * rOut);
			hole[f](Math.sin(a) * rIn, Math.cos(a) * rIn);
		}
		s.closePath();
		hole.closePath();
		s.holes.push(hole);
		return s;
	};
	const slab = (rOut: number, rIn: number, y0: number, h: number) => {
		const g = new THREE.ExtrudeGeometry(ringShape(rOut, rIn), { depth: h, bevelEnabled: false });
		// the octagon is its own mirror, so turning the shape flat needs no flip
		g.rotateX(-Math.PI / 2);
		g.translate(0, y0, 0);
		return planarBrickUV(flat(g));
	};
	const entY = floor + wallH;
	parts.push(slab(Ro + 0.08, Ro - t - 0.1, entY, c * 2));
	parts.push(slab(Ro + 0.26, Ro - t - 0.1, entY + c * 2 + 0.05, c));
	const topY = entY + c * 3 + 0.05;
	// a ceiling over the room, so the sky does not show up through the drum
	{
		const g = new THREE.CircleGeometry(Ro - t, 8, n8);
		g.rotateX(Math.PI / 2);
		g.translate(0, entY - 0.001, 0);
		parts.push(planarBrickUV(flat(g)));
	}

	// ── drum and dome ──
	const drumR = 1.52,
		drumH = c * 3;
	const domeR = drumR + 0.04,
		domeH = 1.58;
	const domeY = topY + drumH + c * 0.6;
	const drum = revolve(
		[
			{ r: domeR, y: domeY },
			{ r: drumR + 0.1, y: domeY },
			{ r: drumR + 0.1, y: topY + drumH },
			{ r: drumR, y: topY + drumH },
			{ r: drumR, y: topY }
		],
		{ v: 'world', segments: 96 }
	);
	parts.push(drum);
	const domeProf: ProfilePoint[] = coursesAlong((tt) => {
		const th = (1 - tt) * Math.PI * 0.5; // crown to springing
		const nx = Math.cos(th) / domeR,
			ny = Math.sin(th) / domeH;
		const l = Math.hypot(nx, ny);
		return { r: domeR * Math.cos(th), y: domeY + domeH * Math.sin(th), nr: nx / l, ny: ny / l };
	});
	parts.push(revolve(domeProf, { v: 'course', segments: 96 }));

	const masonry = new THREE.Mesh(merge(parts), brick);
	masonry.castShadow = true;
	masonry.receiveShadow = true;
	group.add(masonry);

	// ── voussoirs: each arch turned in an odd number, keystone on the axis ──
	const vGeo = new THREE.BoxGeometry(1, 1, 1);
	const count = 8 * 2 * 13 + 8 * 26;
	const vMat = patch(
		new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 }),
		'vous',
		nightPatch
	);
	const vous = new THREE.InstancedMesh(vGeo, vMat, count);
	vous.castShadow = true;
	vous.receiveShadow = true;
	const m = new THREE.Matrix4(),
		q = new THREE.Quaternion(),
		sc = new THREE.Vector3(),
		pos = new THREE.Vector3();
	const col = new THREE.Color();
	let vi = 0;
	const clayCol = (k: number) => {
		const a = hash(k, 17),
			s = hash(k, 53),
			pick = hash(k, 91);
		if (pick < 0.13) col.setHSL((26 + a * 14) / 360, (21 + s * 12) / 100, (47 + a * 7) / 100);
		else if (pick > 0.87) col.setHSL((6 + a * 11) / 360, (27 + s * 14) / 100, (33 + a * 7) / 100);
		else col.setHSL((10 + a * 16) / 360, (33 + s * 18) / 100, (41 + s * 11) / 100);
		return col.convertSRGBToLinear();
	};
	for (let i = 0; i < 8; i++) {
		const phi = i * (Math.PI / 4);
		const kind = i % 2 === 0 ? 'door' : 'window';
		const { half, spring } = kind === 'door' ? PAV.door : PAV.window;
		const radial = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
		const tang = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi));
		const nV = kind === 'door' ? 13 : 11;
		const ring = kind === 'door' ? 0.22 : 0.18;
		for (const face of [0, 1]) {
			const d = face === 0 ? ap + 0.025 : ap - t - 0.025;
			for (let k = 0; k < nV; k++) {
				const a = Math.PI - ((k + 0.5) / nV) * Math.PI;
				const key = k === (nV - 1) / 2;
				const rr = half + ring / 2 + (key ? 0.02 : 0);
				const lx = Math.cos(a) * rr * (d / ap),
					ly = spring + Math.sin(a) * rr;
				pos
					.copy(radial)
					.multiplyScalar(d)
					.addScaledVector(tang, lx)
					.setY(floor + ly);
				// long axis radial to the arch, in the plane of the wall
				const e = new THREE.Euler(0, phi, a - Math.PI / 2, 'YXZ');
				q.setFromEuler(e);
				const w = ((Math.PI * (half + ring / 2)) / nV) * 0.9;
				sc.set(w, ring + (key ? 0.06 : 0), 0.1);
				m.compose(pos, q, sc);
				vous.setMatrixAt(vi, m);
				vous.setColorAt(vi, clayCol(i * 100 + k + face * 50));
				vi++;
			}
		}
		// dentils under the cornice, along this side
		const dn = 13;
		for (let k = 0; k < dn; k++) {
			const lx = ((k + 0.5) / dn - 0.5) * side * 1.12;
			pos
				.copy(radial)
				.multiplyScalar(ap + 0.13)
				.addScaledVector(tang, lx)
				.setY(entY + c * 2 + 0.025);
			q.setFromEuler(new THREE.Euler(0, phi, 0));
			sc.set(0.07, 0.05, 0.11);
			m.compose(pos, q, sc);
			vous.setMatrixAt(vi, m);
			vous.setColorAt(vi, clayCol(9000 + i * 40 + k).multiplyScalar(0.9));
			vi++;
		}
		// the sill: a course of bricks on edge, proud of the wall
		if (kind === 'window') {
			for (let k = 0; k < 13; k++) {
				const lx = ((k + 0.5) / 13 - 0.5) * PAV.window.half * 2.3;
				pos
					.copy(radial)
					.multiplyScalar(ap + 0.02)
					.addScaledVector(tang, lx)
					.setY(floor + PAV.window.sill - 0.04);
				q.setFromEuler(new THREE.Euler(-0.12, phi, 0, 'YXZ'));
				sc.set(0.055, 0.08, 0.36);
				m.compose(pos, q, sc);
				vous.setMatrixAt(vi, m);
				vous.setColorAt(vi, clayCol(7000 + i * 40 + k));
				vi++;
			}
		}
	}
	vous.count = vi;
	vous.instanceMatrix.needsUpdate = true;
	if (vous.instanceColor) vous.instanceColor.needsUpdate = true;
	group.add(vous);

	// ── the finial ──
	const crownY = domeY + domeH;
	const fin: [number, number][] = [
		[0.0, 0.0],
		[0.2, 0.0],
		[0.2, 0.05],
		[0.1, 0.1],
		[0.07, 0.2],
		[0.13, 0.3],
		[0.13, 0.38],
		[0.06, 0.46],
		[0.03, 0.62],
		[0.012, 0.9],
		[0.0, 0.96]
	];
	const finial = new THREE.Mesh(
		new THREE.LatheGeometry(
			fin.map(([r, y]) => new THREE.Vector2(r, crownY - 0.02 + y)),
			32
		),
		copper
	);
	finial.castShadow = true;
	group.add(finial);

	// the roof line, from one springing over the crown to the other, facing +z
	const roof: THREE.Vector3[] = [];
	for (let k = 0; k <= 24; k++) {
		const th = (k / 24) * Math.PI;
		roof.push(new THREE.Vector3(Math.cos(th) * domeR * 0.98, domeY + Math.sin(th) * domeH, 0));
	}

	return {
		group,
		floorY: floor,
		roof,
		sills,
		crown: new THREE.Vector3(0, crownY + 0.9, 0),
		dome: { r: domeR, y: domeY, h: domeH },
		height: crownY + 0.96
	} satisfies PavilionParts;
}
