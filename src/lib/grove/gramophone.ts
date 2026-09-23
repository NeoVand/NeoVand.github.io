import * as THREE from 'three';
import { patch, nightPatch } from './shared';

// ─── The gramophone ───────────────────────────────────────────────────────
// It stands in the pavilion, facing out through the front arch, and it is
// the page's other switch. A walnut cabinet on the floor, a record,
// a tone arm, a crank off the right side — the only thing on it that moves
// while it plays — and a horn spun from copper in twelve petals, flaring up
// and out toward whoever is looking, which is where the notes come from.

export interface Gramophone {
	group: THREE.Group;
	crank: THREE.Group;
	record: THREE.Mesh;
	/** where the notes leave, and which way, in the group's frame */
	mouth: THREE.Vector3;
	mouthDir: THREE.Vector3;
	/** perches: the rim of the horn, and a run along the lid's front edge */
	rim: THREE.Vector3;
	lid: [THREE.Vector3, THREE.Vector3];
	hit: THREE.Box3;
	/** how strongly it is lit up for a hand over it, 0..1 */
	hover: { value: number };
}

// ─── Lit up under the hand ────────────────────────────────────────────────
// When a hand comes over the machine its edges catch a warm light, as brass
// does when it is turned to a lamp: a rim, strongest where the surface turns
// away from the eye, so it reads as a line round the whole of it without a
// second drawing of anything.
function rimmed(group: THREE.Object3D, hover: { value: number }) {
	const seen = new Set<THREE.Material>();
	group.traverse((o) => {
		const m = (o as THREE.Mesh).material as THREE.Material | undefined;
		if (!m || seen.has(m)) return;
		seen.add(m);
		const prev = m.onBeforeCompile.bind(m);
		const key = m.customProgramCacheKey();
		m.onBeforeCompile = (sh, r) => {
			prev(sh, r);
			sh.uniforms.uHover = hover;
			sh.fragmentShader = sh.fragmentShader
				.replace('void main() {', 'uniform float uHover;\nvoid main() {')
				.replace(
					'#include <lights_fragment_end>',
					`#include <lights_fragment_end>
					{
						float f = 1.0 - abs(dot(normal, normalize(vViewPosition)));
						totalEmissiveRadiance += vec3(1.0, 0.72, 0.36) * (smoothstep(0.55, 0.95, f) * 2.4 + 0.04) * uHover;
					}`
				);
		};
		m.customProgramCacheKey = () => key + '-rim';
	});
}

function horn(curve: THREE.Curve<THREE.Vector3>, rings: number, seg: number) {
	const frames = curve.computeFrenetFrames(rings, false);
	const P: number[] = [];
	const I: number[] = [];
	const c = new THREE.Vector3();
	for (let i = 0; i <= rings; i++) {
		const t = i / rings;
		curve.getPointAt(t, c);
		const N = frames.normals[i],
			B = frames.binormals[i];
		const flare = 0.022 + 0.33 * Math.pow(t, 3.3);
		for (let j = 0; j <= seg; j++) {
			const th = (j / seg) * Math.PI * 2;
			// twelve petals: a raised seam where two meet
			const seam = Math.pow(Math.abs(Math.cos(th * 6)), 14);
			const r = flare * (1 + 0.05 * seam * t) * (1 - 0.018 * (1 - seam) * t);
			const cx = Math.cos(th) * r,
				sx = Math.sin(th) * r;
			P.push(c.x + N.x * cx + B.x * sx, c.y + N.y * cx + B.y * sx, c.z + N.z * cx + B.z * sx);
		}
	}
	// the lip, rolled back
	const T = curve.getTangentAt(1);
	const Nl = frames.normals[rings],
		Bl = frames.binormals[rings];
	curve.getPointAt(1, c);
	for (const [grow, back] of [
		[1.07, 0.02],
		[1.09, 0.05]
	]) {
		const r0 = (0.022 + 0.33) * grow;
		for (let j = 0; j <= seg; j++) {
			const th = (j / seg) * Math.PI * 2;
			const cx = Math.cos(th) * r0,
				sx = Math.sin(th) * r0;
			P.push(
				c.x + Nl.x * cx + Bl.x * sx - T.x * back,
				c.y + Nl.y * cx + Bl.y * sx - T.y * back,
				c.z + Nl.z * cx + Bl.z * sx - T.z * back
			);
		}
	}
	const R = rings + 2;
	for (let i = 0; i < R; i++)
		for (let j = 0; j < seg; j++) {
			const a = i * (seg + 1) + j,
				b = a + seg + 1;
			I.push(a, b, a + 1, a + 1, b, b + 1);
		}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
	g.setIndex(I);
	g.computeVertexNormals();
	return g;
}

export function buildGramophone(copper: THREE.Material, wood: THREE.Texture): Gramophone {
	const group = new THREE.Group();
	const walnut = patch(
		new THREE.MeshStandardMaterial({ map: wood, roughness: 0.42, metalness: 0 }),
		'walnut',
		nightPatch
	);
	const black = patch(
		new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.3, metalness: 0.1 }),
		'vinyl',
		nightPatch
	);
	const label = patch(
		new THREE.MeshStandardMaterial({ color: 0x8e2a22, roughness: 0.6 }),
		'label',
		nightPatch
	);

	// the cabinet, with a moulded lid
	// it stands on the floor, where the doorway shows the whole of it
	const top = 0.0;
	const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.42), walnut);
	box.position.y = top + 0.1;
	group.add(box);
	const lidM = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.46), walnut);
	lidM.position.y = top + 0.215;
	group.add(lidM);
	const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.01), copper);
	plate.position.set(0, top + 0.1, 0.212);
	group.add(plate);

	// the record
	const deck = top + 0.232;
	const record = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.008, 48), black);
	record.position.set(-0.02, deck + 0.004, 0.02);
	group.add(record);
	const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.0085, 32), label);
	lab.position.copy(record.position);
	group.add(lab);

	// horn: from the back of the cabinet, up and out toward the viewer
	const P0 = new THREE.Vector3(0.14, deck + 0.02, -0.16);
	const curve = new THREE.CubicBezierCurve3(
		P0,
		new THREE.Vector3(0.2, deck + 0.34, -0.26),
		new THREE.Vector3(0.02, deck + 0.62, -0.08),
		new THREE.Vector3(-0.18, deck + 0.7, 0.2)
	);
	const hornMesh = new THREE.Mesh(horn(curve, 44, 48), copper);
	hornMesh.castShadow = true;
	group.add(hornMesh);

	// tone arm: a short elbow from the horn's foot to the needle
	const arm = new THREE.Mesh(
		new THREE.TubeGeometry(
			new THREE.CatmullRomCurve3([
				P0,
				new THREE.Vector3(0.12, deck + 0.06, -0.06),
				new THREE.Vector3(0.05, deck + 0.05, 0.06),
				new THREE.Vector3(0.02, deck + 0.02, 0.1)
			]),
			16,
			0.014,
			10
		),
		copper
	);
	group.add(arm);

	// the crank: a shaft out of the right side, a throw, a walnut grip
	const crank = new THREE.Group();
	crank.position.set(0.22, top + 0.1, 0.04);
	const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), copper);
	shaft.rotation.z = Math.PI / 2;
	shaft.position.x = 0.03;
	const thr = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.012), copper);
	thr.position.set(0.06, -0.05, 0);
	const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 10), walnut);
	grip.rotation.z = Math.PI / 2;
	grip.position.set(0.085, -0.1, 0);
	crank.add(shaft, thr, grip);
	group.add(crank);

	group.traverse((o) => {
		if ((o as THREE.Mesh).isMesh) {
			o.castShadow = true;
			o.receiveShadow = true;
		}
	});

	const hover = { value: 0 };
	rimmed(group, hover);

	const mouth = curve.getPointAt(1);
	const mouthDir = curve.getTangentAt(1);
	const hit = new THREE.Box3().setFromObject(group);
	hit.expandByScalar(0.08);
	return {
		group,
		crank,
		record,
		mouth,
		mouthDir,
		rim: mouth.clone().add(new THREE.Vector3(0, 0.36, 0)),
		lid: [new THREE.Vector3(-0.2, top + 0.23, 0.22), new THREE.Vector3(0.2, top + 0.23, 0.22)],
		hit,
		hover
	};
}
