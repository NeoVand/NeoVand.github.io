import * as THREE from 'three';
import { revolve, coursesAlong, planarBrickUV, merge, type ProfilePoint } from './masonry';
import { BRICK } from './textures';
import { patch, nightPatch } from './shared';

// ─── The island ───────────────────────────────────────────────────────────
// The flat grove's shelf floated; what was under it was more sky. Here the
// shelf is a round terrace of the same brick, with a lawn laid in it, a
// coping of bricks on edge round the lip, and under it the wall corbels in
// course by course — each course stepping in from the one above, which is
// how brick is taken out over nothing — until it turns into a shallow
// inverted dome and ends in a copper drop. Seen from the page it is a
// garden; seen from below, as you scroll past it, it is a piece of
// architecture hanging in the evening.

export const ISLAND = { R: 7.0, lawn: 6.72, top: 0 };

export interface IslandParts {
	group: THREE.Group;
	lawn: THREE.Mesh;
	lawnU: { uBlobs: { value: THREE.Vector4[] } };
	/** points along the coping where a bird may stand */
	rim: THREE.Vector3[];
}

export function buildIsland(brick: THREE.Material, copper: THREE.Material, lawnMap: THREE.Texture) {
	const group = new THREE.Group();
	const { R, lawn: RL } = ISLAND;
	const c = BRICK.course;

	// ── the lip: a half-round coping of bricks on edge ──
	const cop: ProfilePoint[] = [];
	const cr = (R + 0.08 - RL) / 2,
		cx = RL + cr,
		cy = 0.1;
	cop.push({ r: RL, y: 0.0, nr: -1, ny: 0 });
	for (let i = 0; i <= 10; i++) {
		const a = Math.PI - (i / 10) * Math.PI;
		cop.push({
			r: cx + Math.cos(a) * cr,
			y: cy + Math.sin(a) * cr,
			nr: Math.cos(a),
			ny: Math.sin(a)
		});
	}
	const coping = revolve(cop, { v: 'course', header: true, segments: 128 });

	// ── the wall, and the course under the coping's overhang ──
	const wallTop = 0.02;
	const courses = 13;
	const wallBot = wallTop - courses * c;
	const wall = revolve(
		[
			{ r: R + 0.08, y: cy },
			{ r: R + 0.08, y: wallTop },
			{ r: R, y: wallTop },
			{ r: R, y: wallBot }
		],
		{ v: 'world', segments: 128 }
	);

	// ── corbelling: each course one step in from the one above ──
	const steps = 12;
	const cor: ProfilePoint[] = [{ r: R, y: wallBot }];
	let r = R,
		y = wallBot;
	for (let k = 1; k <= steps; k++) {
		const nr = R - 3.1 * Math.pow(k / steps, 1.35);
		cor.push({ r: nr, y });
		y -= c;
		cor.push({ r: nr, y });
		r = nr;
	}
	const corbel = revolve(cor, { v: 'course', segments: 128 });

	// ── the inverted dome under it all ──
	const a = r,
		b = 1.9,
		y0 = y;
	const bowl = revolve(
		coursesAlong((t) => {
			const th = t * Math.PI * 0.5;
			const nx = Math.cos(th) / a,
				ny = -Math.sin(th) / b;
			const l = Math.hypot(nx, ny);
			return { r: a * Math.cos(th), y: y0 - b * Math.sin(th), nr: nx / l, ny: ny / l };
		}),
		{ v: 'course', segments: 96 }
	);

	// ── paving: rings of brick round the pavilion, and a path to the lip ──
	const ring: ProfilePoint[] = [];
	for (let k = 0; k <= 9; k++) ring.push({ r: 2.35 + k * c, y: 0.014, nr: 0, ny: 1 });
	ring.reverse();
	const apron = revolve(ring, { v: 'course', segments: 96 });
	const path = new THREE.PlaneGeometry(1.3, RL - 3.1, 1, 1);
	path.rotateX(-Math.PI / 2);
	path.translate(0, 0.012, (RL + 3.1) / 2 - 0.02);
	planarBrickUV(path);

	const masonry = new THREE.Mesh(merge([coping, wall, corbel, bowl, apron, path]), brick);
	masonry.castShadow = true;
	masonry.receiveShadow = true;
	group.add(masonry);

	// ── the drop: copper, turned ──
	const dropY = y0 - b;
	const pts: THREE.Vector2[] = [];
	const prof: [number, number][] = [
		[0.0, 0.08],
		[0.42, 0.08],
		[0.44, 0.0],
		[0.3, -0.12],
		[0.22, -0.3],
		[0.36, -0.52],
		[0.38, -0.7],
		[0.3, -0.9],
		[0.14, -1.12],
		[0.05, -1.36],
		[0.0, -1.5]
	];
	for (const [pr, py] of prof) pts.push(new THREE.Vector2(pr, dropY + py));
	const drop = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), copper);
	drop.castShadow = true;
	group.add(drop);

	// ── the lawn ──
	const lawnU = {
		uBlobs: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 1, 0)) }
	};
	lawnMap.repeat.set(RL, RL);
	const lawnMat = patch(
		new THREE.MeshStandardMaterial({ map: lawnMap, roughness: 0.97, metalness: 0 }),
		'lawn',
		(s) => {
			s.uniforms.uBlobs = lawnU.uBlobs;
			s.vertexShader = s.vertexShader
				.replace('void main() {', 'varying vec2 vPlan;\nvoid main() {')
				.replace(
					'#include <begin_vertex>',
					'#include <begin_vertex>\nvPlan = (modelMatrix * vec4(transformed, 1.0)).xz;'
				);
			s.fragmentShader = s.fragmentShader
				.replace('void main() {', 'varying vec2 vPlan;\nuniform vec4 uBlobs[12];\nvoid main() {')
				.replace(
					'#include <map_fragment>',
					/* glsl */ `#include <map_fragment>
					{
						// broad patches of lusher and thinner grass, so the tiling never shows
						float n = sin(vPlan.x * 0.37 + sin(vPlan.y * 0.23) * 2.0) * sin(vPlan.y * 0.31 + sin(vPlan.x * 0.19) * 2.0);
						diffuseColor.rgb *= 0.9 + 0.16 * n;
						// darker in under the trees and round the pavilion's foot, and at the lip
						float ao = 1.0;
						for (int i = 0; i < 12; i++) {
							vec2 d = vPlan - uBlobs[i].xy;
							ao *= 1.0 - uBlobs[i].w * exp(-dot(d, d) / (uBlobs[i].z * uBlobs[i].z));
						}
						float rr = length(vPlan);
						ao *= 1.0 - 0.3 * smoothstep(${(RL - 0.5).toFixed(2)}, ${RL.toFixed(2)}, rr);
						diffuseColor.rgb *= ao;
					}`
				);
		},
		nightPatch
	);
	const lawnGeo = new THREE.CircleGeometry(RL + 0.01, 128);
	lawnGeo.rotateX(-Math.PI / 2);
	const lawn = new THREE.Mesh(lawnGeo, lawnMat);
	lawn.receiveShadow = true;
	group.add(lawn);

	const rim: THREE.Vector3[] = [];
	for (let i = 0; i < 48; i++) {
		const th = (i / 48) * Math.PI * 2;
		rim.push(new THREE.Vector3(cx * Math.cos(th), cy + cr, -cx * Math.sin(th)));
	}
	return { group, lawn, lawnU, rim } satisfies IslandParts;
}
