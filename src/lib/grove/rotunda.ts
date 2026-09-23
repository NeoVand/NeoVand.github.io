import * as THREE from 'three';
import { planarBrickUV, merge } from './masonry';
import { hash } from './rng';
import { patch, nightPatch } from './shared';

// ─── The rotunda ──────────────────────────────────────────────────────────
// Six bays, all open: a brick arch in each, springing from brick piers, with
// a column of pale stone at every corner standing proud of the brick; over
// them an entablature of the same stone, and a dome of lead dressed in
// standing seams, greened where the rain runs off them, with a bronze finial
// the doves sit on. It stands on two round steps, and the bay on the path
// is the one the camera looks through — to the gramophone on its cabinet
// and, by night, the lantern hung over it.

export const ROT = {
	floor: 0.36,
	/** apothem of the hexagon of walls, their thickness, the springing and the arch */
	ap: 1.92,
	t: 0.34,
	spring: 1.66,
	half: 0.74,
	wallH: 2.52
};

export interface RotundaParts {
	group: THREE.Group;
	floorY: number;
	/** the dome's outline from springing to crown, for birds to walk */
	roof: THREE.Vector3[];
	/** ledges a bird may stand on: the cornice's corners */
	sills: [THREE.Vector3, THREE.Vector3][];
	crown: THREE.Vector3;
	dome: { r: number; y: number; h: number };
	height: number;
	/** where the lantern hangs */
	lantern: THREE.Vector3;
	lanternGlass: THREE.Mesh;
}

function flat(g: THREE.BufferGeometry) {
	const n = g.index ? g.toNonIndexed() : g;
	n.computeVertexNormals();
	return n;
}

/** planar uv for stone: plan on flat faces, elevation on the rest */
function stoneUV(g: THREE.BufferGeometry, tw: number, th: number) {
	const p = g.getAttribute('position'),
		n = g.getAttribute('normal');
	const uv = new Float32Array(p.count * 2);
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i),
			y = p.getY(i),
			z = p.getZ(i);
		const nx = n.getX(i),
			ny = n.getY(i),
			nz = n.getZ(i);
		if (Math.abs(ny) > 0.7) {
			uv[i * 2] = x / tw;
			uv[i * 2 + 1] = z / th;
		} else {
			const h = Math.hypot(nx, nz) || 1;
			uv[i * 2] = (x * (-nz / h) + z * (nx / h)) / tw;
			uv[i * 2 + 1] = y / th;
		}
	}
	g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	return g;
}

/** a wall panel across one side of the hexagon, with an arch cut in it */
function bayShape(w: number) {
	const { half, spring, wallH } = ROT;
	const s = new THREE.Shape();
	s.moveTo(-w / 2, 0);
	s.lineTo(-half, 0);
	s.lineTo(-half, spring);
	s.absarc(0, spring, half, Math.PI, 0, true);
	s.lineTo(half, 0);
	s.lineTo(w / 2, 0);
	s.lineTo(w / 2, wallH);
	s.lineTo(-w / 2, wallH);
	s.closePath();
	return s;
}

export function buildRotunda(brick: THREE.Material, stone: THREE.Material, bronze: THREE.Material) {
	const group = new THREE.Group();
	const { ap, t, floor, spring, half, wallH } = ROT;
	const n6 = Math.PI / 6;
	const side = 2 * ap * Math.tan(n6);
	const corner = ap / Math.cos(n6);
	const brickParts: THREE.BufferGeometry[] = [];
	const stoneParts: THREE.BufferGeometry[] = [];

	// ── two round steps ──
	const step = (r: number, y0: number, h: number) => {
		const g = new THREE.CylinderGeometry(r, r, h, 72, 1, false);
		g.translate(0, y0 + h / 2, 0);
		return stoneUV(flat(g), 0.9, 0.9);
	};
	stoneParts.push(step(corner + 0.72, 0, floor / 2), step(corner + 0.42, floor / 2, floor / 2));

	// ── the six bays ──
	for (let i = 0; i < 6; i++) {
		const phi = i * (Math.PI / 3);
		const g = new THREE.ExtrudeGeometry(bayShape(side), {
			depth: t,
			bevelEnabled: false,
			curveSegments: 16
		});
		const p = g.getAttribute('position') as THREE.BufferAttribute;
		const radial = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
		const tang = new THREE.Vector3(-Math.cos(phi), 0, Math.sin(phi));
		for (let k = 0; k < p.count; k++) {
			const x = p.getX(k),
				y = p.getY(k),
				z = p.getZ(k);
			const d = ap - z;
			const xs = x * (d / ap);
			p.setXYZ(k, radial.x * d + tang.x * xs, floor + y, radial.z * d + tang.z * xs);
		}
		brickParts.push(planarBrickUV(flat(g)));
	}

	// ── columns at the corners: base, shaft, capital ──
	const colR = 0.12;
	const colTop = floor + wallH - 0.02;
	const colProfile: [number, number][] = [
		[0.0, 0.0],
		[colR * 1.75, 0.0],
		[colR * 1.75, 0.07],
		[colR * 1.45, 0.1],
		[colR * 1.35, 0.15],
		[colR * 1.08, 0.2],
		[colR * 1.02, 0.35],
		[colR * 0.92, wallH - 0.34],
		[colR * 1.05, wallH - 0.3],
		[colR * 1.05, wallH - 0.25],
		[colR * 1.2, wallH - 0.2],
		[colR * 1.55, wallH - 0.12],
		[colR * 1.75, wallH - 0.1],
		[colR * 1.75, wallH - 0.02],
		[0.0, wallH - 0.02]
	];
	for (let i = 0; i < 6; i++) {
		const phi = n6 + i * (Math.PI / 3);
		const g = new THREE.LatheGeometry(
			colProfile.map(([r, y]) => new THREE.Vector2(r, y)),
			20
		);
		g.translate(Math.sin(phi) * (corner + 0.02), floor, Math.cos(phi) * (corner + 0.02));
		stoneParts.push(stoneUV(g, 0.9, 0.9));
	}

	// ── entablature: architrave, frieze, cornice ──
	const ring = (rOut: number, rIn: number, y0: number, h: number) => {
		const s = new THREE.Shape();
		const hole = new THREE.Path();
		for (let k = 0; k < 6; k++) {
			const a = n6 + (k * Math.PI) / 3;
			const f = k === 0 ? 'moveTo' : 'lineTo';
			s[f](Math.sin(a) * rOut, Math.cos(a) * rOut);
			hole[f](Math.sin(a) * rIn, Math.cos(a) * rIn);
		}
		s.closePath();
		hole.closePath();
		s.holes.push(hole);
		const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
		g.rotateX(-Math.PI / 2);
		g.translate(0, y0, 0);
		return stoneUV(flat(g), 0.9, 0.9);
	};
	const entY = floor + wallH;
	const inR = (ap - t - 0.05) / Math.cos(n6);
	stoneParts.push(ring(corner + 0.2, inR, entY, 0.2));
	brickParts.push(planarBrickUV(ring(corner + 0.12, inR, entY + 0.2, 0.26)));
	stoneParts.push(ring(corner + 0.34, inR, entY + 0.46, 0.08));
	stoneParts.push(ring(corner + 0.26, inR, entY + 0.54, 0.07));
	const topY = entY + 0.61;
	// the ceiling, so the sky does not show up through the dome
	{
		const g = new THREE.CircleGeometry(inR, 6, n6);
		g.rotateX(Math.PI / 2);
		g.translate(0, entY - 0.002, 0);
		stoneParts.push(stoneUV(flat(g), 0.9, 0.9));
	}
	// the floor
	{
		const g = new THREE.CircleGeometry(corner + 0.42, 72);
		g.rotateX(-Math.PI / 2);
		g.translate(0, floor + 0.002, 0);
		stoneParts.push(stoneUV(flat(g), 0.9, 0.9));
	}

	const masonry = new THREE.Mesh(merge(brickParts), brick);
	masonry.castShadow = masonry.receiveShadow = true;
	group.add(masonry);
	const dressed = new THREE.Mesh(merge(stoneParts), stone);
	dressed.castShadow = dressed.receiveShadow = true;
	group.add(dressed);

	// ── voussoirs: an odd number to every arch, a stone keystone on its axis ──
	const vMat = patch(
		new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 }),
		'vous',
		nightPatch
	);
	const vous = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), vMat, 6 * 2 * 15);
	vous.castShadow = vous.receiveShadow = true;
	const m = new THREE.Matrix4(),
		q = new THREE.Quaternion(),
		sc = new THREE.Vector3(),
		pos = new THREE.Vector3(),
		col = new THREE.Color();
	let vi = 0;
	const clay = (k: number) => {
		const a = hash(k, 17),
			s = hash(k, 53);
		return col
			.setHSL((12 + a * 14) / 360, (36 + s * 16) / 100, (40 + s * 10) / 100)
			.convertSRGBToLinear();
	};
	for (let i = 0; i < 6; i++) {
		const phi = i * (Math.PI / 3);
		const radial = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
		const tang = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi));
		const nV = 15,
			ring = 0.24;
		for (const face of [0, 1]) {
			const d = face === 0 ? ap + 0.03 : ap - t - 0.03;
			for (let k = 0; k < nV; k++) {
				const a = Math.PI - ((k + 0.5) / nV) * Math.PI;
				const key = k === (nV - 1) / 2;
				const rr = half + ring / 2 + (key ? 0.025 : 0);
				pos
					.copy(radial)
					.multiplyScalar(d)
					.addScaledVector(tang, Math.cos(a) * rr * (d / ap))
					.setY(floor + spring + Math.sin(a) * rr);
				q.setFromEuler(new THREE.Euler(0, phi, a - Math.PI / 2, 'YXZ'));
				sc.set(((Math.PI * (half + ring / 2)) / nV) * 0.9, ring + (key ? 0.08 : 0), 0.1);
				m.compose(pos, q, sc);
				vous.setMatrixAt(vi, m);
				vous.setColorAt(vi, key ? col.setRGB(0.62, 0.58, 0.52) : clay(i * 100 + k + face * 50));
				vi++;
			}
		}
	}
	vous.count = vi;
	vous.instanceMatrix.needsUpdate = true;
	if (vous.instanceColor) vous.instanceColor.needsUpdate = true;
	group.add(vous);

	// ── the dome: lead in standing seams, greened below them ──
	const domeR = corner + 0.06,
		domeH = 1.72,
		domeY = topY;
	const seams = 12;
	const NS = 144,
		NR = 30;
	const dPos: number[] = [],
		dIdx: number[] = [];
	for (let j = 0; j <= NR; j++) {
		const th = (j / NR) * Math.PI * 0.5; // springing to crown
		for (let i = 0; i <= NS; i++) {
			const a = (i / NS) * Math.PI * 2;
			// a seam is a raised roll, narrow, running from the springing to the top
			const sp = Math.pow(Math.max(0, Math.cos(a * seams)), 40) * 0.035 * Math.cos(th);
			const r = domeR * Math.cos(th) + sp;
			dPos.push(Math.sin(a) * r, domeY + domeH * Math.sin(th), Math.cos(a) * r);
		}
	}
	for (let j = 0; j < NR; j++)
		for (let i = 0; i < NS; i++) {
			const a = j * (NS + 1) + i,
				b = a + NS + 1;
			// round crossed with up faces out
			dIdx.push(a, a + 1, b, a + 1, b + 1, b);
		}
	const domeGeo = new THREE.BufferGeometry();
	domeGeo.setAttribute('position', new THREE.Float32BufferAttribute(dPos, 3));
	domeGeo.setIndex(dIdx);
	domeGeo.computeVertexNormals();
	const lead = patch(
		new THREE.MeshStandardMaterial({ color: 0x4f5a57, roughness: 0.66, metalness: 0.3 }),
		'lead',
		(s) => {
			s.vertexShader = s.vertexShader
				.replace('void main() {', 'varying vec3 vDome;\nvoid main() {')
				.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDome = position;');
			s.fragmentShader = s.fragmentShader
				.replace('void main() {', 'varying vec3 vDome;\nvoid main() {')
				.replace(
					'#include <color_fragment>',
					`#include <color_fragment>
					{
						float a = atan(vDome.x, vDome.z);
						float seam = pow(max(0.0, cos(a * ${seams.toFixed(1)})), 6.0);
						float h = clamp((vDome.y - ${domeY.toFixed(3)}) / ${domeH.toFixed(3)}, 0.0, 1.0);
						// verdigris runs down from each seam and pools low on the dome
						float run = sin(a * 97.0) * 0.5 + 0.5;
						float green = clamp(seam * 0.8 + (1.0 - h) * 0.35 * run, 0.0, 1.0);
						diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.55, 0.47), green * 0.75);
						diffuseColor.rgb *= 0.85 + 0.3 * seam;
					}`
				)
				.replace(
					'#include <roughnessmap_fragment>',
					'#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.8, 0.5);'
				);
		},
		nightPatch
	);
	const dome = new THREE.Mesh(domeGeo, lead);
	dome.castShadow = dome.receiveShadow = true;
	group.add(dome);

	// ── the finial ──
	const crownY = domeY + domeH;
	const fin: [number, number][] = [
		[0.0, 0.0],
		[0.22, 0.0],
		[0.2, 0.06],
		[0.08, 0.12],
		[0.06, 0.22],
		[0.12, 0.3],
		[0.12, 0.4],
		[0.05, 0.48],
		[0.025, 0.66],
		[0.01, 0.9],
		[0.0, 0.94]
	];
	const finial = new THREE.Mesh(
		new THREE.LatheGeometry(
			fin.map(([r, y]) => new THREE.Vector2(r, crownY - 0.03 + y)),
			28
		),
		bronze
	);
	finial.castShadow = true;
	group.add(finial);

	// ── the lantern, hung in the middle of the room on a chain ──
	const lanternY = floor + 2.12;
	const lanternPos = new THREE.Vector3(0, lanternY, 0.72);
	const chainGeo = new THREE.CylinderGeometry(0.008, 0.008, entY - lanternY - 0.2, 5);
	chainGeo.translate(lanternPos.x, (entY + lanternY + 0.2) / 2, lanternPos.z);
	const cap = new THREE.ConeGeometry(0.13, 0.12, 6);
	cap.translate(lanternPos.x, lanternY + 0.19, lanternPos.z);
	const base = new THREE.CylinderGeometry(0.1, 0.07, 0.05, 6);
	base.translate(lanternPos.x, lanternY - 0.14, lanternPos.z);
	const frame = new THREE.Mesh(merge([chainGeo, flat(cap), flat(base)]), bronze);
	frame.castShadow = true;
	group.add(frame);
	const glass = new THREE.Mesh(
		new THREE.CylinderGeometry(0.1, 0.085, 0.26, 6),
		new THREE.MeshStandardMaterial({
			color: 0x2a2014,
			emissive: new THREE.Color(1.0, 0.62, 0.28),
			emissiveIntensity: 0,
			roughness: 0.3
		})
	);
	glass.position.copy(lanternPos);
	group.add(glass);

	// the roof line, from one springing over the crown to the other, facing +z
	const roof: THREE.Vector3[] = [];
	for (let k = 0; k <= 24; k++) {
		const th = (k / 24) * Math.PI;
		roof.push(new THREE.Vector3(Math.cos(th) * domeR * 0.98, domeY + Math.sin(th) * domeH, 0));
	}
	// the cornice's corners, as short runs a bird can stand along
	const sills: [THREE.Vector3, THREE.Vector3][] = [];
	for (let k = 0; k < 6; k++) {
		const a = n6 + (k * Math.PI) / 3;
		const c = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(corner + 0.28);
		const tg = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(0.25);
		c.y = entY + 0.61;
		sills.push([c.clone().sub(tg), c.clone().add(tg)]);
	}

	return {
		group,
		floorY: floor,
		roof,
		sills,
		crown: new THREE.Vector3(0, crownY + 0.9, 0),
		dome: { r: domeR, y: domeY, h: domeH },
		height: crownY + 0.94,
		lantern: lanternPos,
		lanternGlass: glass
	} satisfies RotundaParts;
}

/**
 * How far a point is from the rotunda, roughly: the drum out to the cornice
 * as a cylinder, and the dome as the half-ellipsoid it is. Negative inside.
 * The garden keeps its trees off the building by it.
 */
export function rotundaClearance(p: THREE.Vector3) {
	const { floor, ap, wallH } = ROT;
	const corner = ap / Math.cos(Math.PI / 6);
	const rh = Math.hypot(p.x, p.z);
	const topY = floor + wallH + 0.61;
	if (p.y < topY) return rh - (corner + 0.34);
	const a = corner + 0.06,
		b = 1.72;
	const dy = p.y - topY;
	const k = Math.hypot(rh / a, dy / b);
	// the usual estimate of the distance to an ellipse, good near its skin
	return ((k - 1) * k) / Math.max(1e-4, Math.hypot(rh / (a * a), dy / (b * b)));
}
