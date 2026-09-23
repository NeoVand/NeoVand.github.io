import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRICK, TILE } from './textures';

// ─── Laying brick in three dimensions ─────────────────────────────────────
// Two ways of putting the one brick on a surface, and between them they
// cover everything in the grove.
//
// A surface of revolution is laid course by course: each band between two
// points of its profile is dealt a whole number of bricks, worked out from
// its own circumference, so a ring never ends in a sliver and a dome's
// courses thin out toward the crown by losing bricks rather than by
// squeezing them. A vertical wall takes its courses from world height, so
// every bed joint on every wall in the picture lies on the same lines —
// piers, panels and the island's rim alike — without anything checking.
//
// A flat face is mapped in world units along its own horizontal, which is
// what an elevation of brick is.

export interface ProfilePoint {
	r: number;
	y: number;
	/** optional smooth normal in the profile plane (outward) */
	nr?: number;
	ny?: number;
}

type VMode = 'world' | 'course';

/**
 * Revolve a profile, top to bottom on the outer face, into brick bands.
 * `v: 'world'` courses by height (walls); `v: 'course'` gives each band one
 * course of its own (domes, soffits).
 */
export function revolve(
	profile: ProfilePoint[],
	opts: { segments?: number; v?: VMode; header?: boolean; phase?: number } = {}
) {
	const seg = opts.segments ?? 96;
	const P: number[] = [],
		N: number[] = [],
		UV: number[] = [],
		I: number[] = [];
	const across = opts.header ? BRICK.length * 0.42 : BRICK.length;
	for (let k = 0; k < profile.length - 1; k++) {
		const a = profile[k],
			b = profile[k + 1];
		const dr = b.r - a.r,
			dy = b.y - a.y;
		const len = Math.hypot(dr, dy) || 1;
		const fn = [-dy / len, dr / len];
		const rMid = (a.r + b.r) / 2;
		const bricks = Math.max(3, Math.round((Math.PI * 2 * Math.max(rMid, 0.05)) / across));
		const uScale = bricks / BRICK.perTileX;
		const base = P.length / 3;
		const phase = (opts.phase ?? 0) + k * 0.37;
		for (let j = 0; j <= seg; j++) {
			const th = (j / seg) * Math.PI * 2;
			const c = Math.cos(th),
				s = Math.sin(th);
			for (const [pt, vt] of [
				[a, 0],
				[b, 1]
			] as const) {
				P.push(pt.r * c, pt.y, -pt.r * s);
				const nr = pt.nr ?? fn[0],
					ny = pt.ny ?? fn[1];
				N.push(nr * c, ny, -nr * s);
				const u = (j / seg) * uScale + phase;
				const v = opts.v === 'course' ? (k + vt) / BRICK.perTileY : pt.y / TILE.h;
				UV.push(u, v);
			}
		}
		// winding: face the normal
		for (let j = 0; j < seg; j++) {
			const i0 = base + j * 2;
			I.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
	g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
	g.setIndex(I);
	fixWinding(g);
	return g;
}

/** Split a smooth profile into steps of one course each, by arc length. */
export function coursesAlong(
	f: (t: number) => ProfilePoint,
	course = BRICK.course,
	minStep = BRICK.course * 0.34
) {
	// sample densely, then walk it
	const S = 400;
	const pts: ProfilePoint[] = [];
	for (let i = 0; i <= S; i++) pts.push(f(i / S));
	const out: ProfilePoint[] = [pts[0]];
	let acc = 0;
	for (let i = 1; i <= S; i++) {
		acc += Math.hypot(pts[i].r - pts[i - 1].r, pts[i].y - pts[i - 1].y);
		if (acc >= course || i === S) {
			// a course that would come out thinner than a third is rolled into
			// the one above, which is what a bricklayer does with it too
			if (i === S && acc < minStep && out.length > 1) out.pop();
			out.push(pts[i]);
			acc = 0;
		}
	}
	return out;
}

/** Flip triangles whose face disagrees with the vertex normals. */
export function fixWinding(g: THREE.BufferGeometry) {
	const idx = g.index!;
	const p = g.getAttribute('position'),
		n = g.getAttribute('normal');
	const a = new THREE.Vector3(),
		b = new THREE.Vector3(),
		c = new THREE.Vector3(),
		na = new THREE.Vector3();
	for (let i = 0; i < idx.count; i += 3) {
		const i0 = idx.getX(i),
			i1 = idx.getX(i + 1),
			i2 = idx.getX(i + 2);
		a.fromBufferAttribute(p, i0);
		b.fromBufferAttribute(p, i1).sub(a);
		c.fromBufferAttribute(p, i2).sub(a);
		na.fromBufferAttribute(n, i0);
		if (b.cross(c).dot(na) < 0) {
			idx.setX(i + 1, i2);
			idx.setX(i + 2, i1);
		}
	}
	idx.needsUpdate = true;
}

/**
 * World-unit brick UVs for a geometry already placed in world space. Vertical
 * faces run along their own horizontal and course by height; faces that look
 * up or down are laid flat in plan.
 */
export function planarBrickUV(g: THREE.BufferGeometry, rotatePlan = 0) {
	const p = g.getAttribute('position'),
		n = g.getAttribute('normal');
	const uv = new Float32Array(p.count * 2);
	const cr = Math.cos(rotatePlan),
		sr = Math.sin(rotatePlan);
	for (let i = 0; i < p.count; i++) {
		const x = p.getX(i),
			y = p.getY(i),
			z = p.getZ(i);
		const nx = n.getX(i),
			ny = n.getY(i),
			nz = n.getZ(i);
		if (Math.abs(ny) > 0.7) {
			uv[i * 2] = (x * cr - z * sr) / TILE.w;
			uv[i * 2 + 1] = (x * sr + z * cr) / TILE.h;
		} else {
			const h = Math.hypot(nx, nz) || 1;
			const tx = -nz / h,
				tz = nx / h;
			uv[i * 2] = (x * tx + z * tz) / TILE.w;
			uv[i * 2 + 1] = y / TILE.h;
		}
	}
	g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	return g;
}

/** Merge geometries into one draw, whatever their indexing. */
export function merge(geos: THREE.BufferGeometry[]) {
	const flat = geos.map((g) => {
		const keep = g.index ? g.toNonIndexed() : g;
		for (const name of Object.keys(keep.attributes))
			if (!['position', 'normal', 'uv'].includes(name)) keep.deleteAttribute(name);
		return keep;
	});
	const m = mergeGeometries(flat, false)!;
	m.computeBoundingSphere();
	return m;
}
