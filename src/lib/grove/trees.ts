import * as THREE from 'three';
import { grow, type Skeleton, type Species } from './lsystem';
import { U, WIND_GLSL, patch, nightPatch } from './shared';
import { rng } from './rng';
import { foliageTexture } from './textures';

// one painted spray per species, shared by every tree of it
const sprays = new Map<string, THREE.Texture>();
function foliageFor(sp: Species) {
	let t = sprays.get(sp.name);
	if (!t) {
		t = foliageTexture(sp.leaf.kind, sp.leaf.color, sp.name.length * 17 + 3);
		sprays.set(sp.name, t);
	}
	return t;
}

// ─── A tree as geometry ───────────────────────────────────────────────────
// Every chain of the skeleton is swept as one tube, ring to ring, with
// frames carried along it by parallel transport so the bark never twists.
// Each vertex also knows the centre of its own ring, the centre of the ring
// before it, and the path length at both: that is all the vertex shader
// needs to grow the tree from the ground, a ring sliding out along its
// segment and swelling as it goes, children starting where their parent
// has reached. Pressing a tree runs the same thing backwards.

export interface StandItem {
	sp: Species;
	seed: number;
	/** where it stands on the lawn, and how it is turned */
	pos: THREE.Vector3;
	rotY: number;
	heightScale?: number;
	/** held back this far along the growth, so a stand does not grow in step */
	sOffset?: number;
}

export interface Perch {
	p: THREE.Vector3;
	flex: number;
	s: number;
}

/** One or more plants in one draw each for bark and leaves. */
export interface TreeHandles {
	group: THREE.Group;
	bark: THREE.Mesh;
	leaves: THREE.Mesh;
	skeletons: Skeleton[];
	items: StandItem[];
	/** the tallest plant's height and the stand's rough extent */
	height: number;
	crown: THREE.Vector3;
	crownR: number;
	/** growth is measured along the branches: how far there is to go */
	sMax: number;
	u: {
		uGrow: { value: number };
		uGrowAll: { value: number };
	};
	/** twig ends, in world space, and how far each flexes */
	perches: Perch[];
	dispose(): void;
}

const BARK_V = /* glsl */ `
attribute vec3 aCenter;
attribute vec3 aParent;
attribute vec2 aS;
attribute float aFlex;
uniform float uGrow;
uniform float uGrowAll;
${WIND_GLSL}
`;

const barkVertex = (shader: THREE.WebGLProgramParametersWithUniforms, u: TreeHandles['u']) => {
	shader.uniforms.uTime = U.uTime;
	shader.uniforms.uWind = U.uWind;
	shader.uniforms.uPtr = U.uPtr;
	shader.uniforms.uPtrAmp = U.uPtrAmp;
	shader.uniforms.uGrow = u.uGrow;
	shader.uniforms.uGrowAll = u.uGrowAll;
	shader.vertexShader =
		BARK_V +
		shader.vertexShader.replace(
			'#include <begin_vertex>',
			/* glsl */ `
		float k = clamp((uGrow - aS.x) / max(aS.y - aS.x, 1e-4), 0.0, 1.0);
		vec3 c = mix(aParent, aCenter, k);
		vec3 transformed = c + (position - aCenter) * k * mix(0.3, 1.0, uGrowAll);
		transformed += windOffset((modelMatrix * vec4(c, 1.0)).xyz, aFlex);
		`
		);
};

const LEAF_V = /* glsl */ `
attribute vec3 iAnchor;
attribute vec4 iQuat;
attribute float iScale;
attribute float iS;
attribute float iFlex;
attribute float iTint;
attribute vec3 iCrown;
uniform float uGrow;
varying float vTint;
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
${WIND_GLSL}
`;

const LEAF_BEGIN = /* glsl */ `
	float k = clamp((uGrow - iS) / 0.8, 0.0, 1.0);
	k = k * k * (3.0 - 2.0 * k);
	vec3 transformed = iAnchor + qrot(iQuat, position) * iScale * k;
	vec3 wp = (modelMatrix * vec4(iAnchor, 1.0)).xyz;
	transformed += windOffset(wp, iFlex);
	transformed += vec3(sin(uTime * 4.1 + iTint * 31.0), 0.0, cos(uTime * 3.3 + iTint * 17.0))
		* 0.04 * (position.y + 0.5) * iScale * uWind;
	vTint = iTint;
`;

const leafVertex = (
	shader: THREE.WebGLProgramParametersWithUniforms,
	u: TreeHandles['u'],
	withNormal: boolean
) => {
	shader.uniforms.uTime = U.uTime;
	shader.uniforms.uWind = U.uWind;
	shader.uniforms.uPtr = U.uPtr;
	shader.uniforms.uPtrAmp = U.uPtrAmp;
	shader.uniforms.uGrow = u.uGrow;
	let v = LEAF_V + shader.vertexShader.replace('#include <begin_vertex>', LEAF_BEGIN);
	if (withNormal)
		// A canopy is shaded as a volume, not as two thousand little mirrors:
		// each leaf's normal is bent toward the direction out of the crown, so
		// the tree reads as a rounded mass lit from one side, and the leaves'
		// own turn only breaks that up.
		v = v.replace(
			'#include <beginnormal_vertex>',
			/* glsl */ `
			vec3 outward = normalize(iAnchor - iCrown + vec3(0.0, 0.6, 0.0));
			vec3 objectNormal = normalize(mix(qrot(iQuat, normal), outward, 0.78));
			`
		);
	shader.vertexShader = v;
};

// Leaves lit from behind: looking toward the sun through a crown, the light
// comes through the blades, and an evening grove is mostly that.
const leafFragment = (shader: THREE.WebGLProgramParametersWithUniforms) => {
	shader.uniforms.uSunView = U.uSunView;
	shader.uniforms.uSunColor = U.uSunColor;
	shader.fragmentShader = shader.fragmentShader
		.replace(
			'void main() {',
			'varying float vTint;\nuniform vec3 uSunView;\nuniform vec3 uSunColor;\nvoid main() {'
		)
		.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;')
		.replace(
			'#include <color_fragment>',
			`#include <color_fragment>
			diffuseColor.rgb *= mix(0.8, 1.12, vTint) * vec3(1.0 + vTint * 0.06, 1.0, 1.0 - vTint * 0.08);`
		)
		.replace(
			'#include <opaque_fragment>',
			`float back = pow(max(dot(normalize(-vViewPosition), uSunView), 0.0), 5.0);
			outgoingLight += diffuseColor.rgb * uSunColor * back * 1.3;
			#include <opaque_fragment>`
		);
};

export interface CardSet {
	anchors: number[];
	quats: number[];
	scales: number[];
	ss: number[];
	flexes: number[];
	tints: number[];
	crowns: number[];
}

/**
 * Cards of painted leaves, one draw for all of them: the trees' crowns, and
 * the ivy on the pavilion, which is the same thing held against a wall.
 */
export function leafCards(
	c: CardSet,
	map: THREE.Texture,
	u: TreeHandles['u'],
	bounds: THREE.Sphere,
	shadows = true
) {
	const base = new THREE.PlaneGeometry(1, 1);
	const geo = new THREE.InstancedBufferGeometry();
	geo.index = base.index;
	geo.setAttribute('position', base.getAttribute('position'));
	geo.setAttribute('normal', base.getAttribute('normal'));
	geo.setAttribute('uv', base.getAttribute('uv'));
	const inst = (arr: number[], size: number) =>
		new THREE.InstancedBufferAttribute(new Float32Array(arr), size);
	geo.setAttribute('iAnchor', inst(c.anchors, 3));
	geo.setAttribute('iQuat', inst(c.quats, 4));
	geo.setAttribute('iScale', inst(c.scales, 1));
	geo.setAttribute('iS', inst(c.ss, 1));
	geo.setAttribute('iFlex', inst(c.flexes, 1));
	geo.setAttribute('iTint', inst(c.tints, 1));
	geo.setAttribute('iCrown', inst(c.crowns, 3));
	geo.instanceCount = c.scales.length;
	geo.boundingSphere = bounds;

	const mat = patch(
		new THREE.MeshLambertMaterial({
			map,
			alphaTest: 0.42,
			alphaToCoverage: true,
			side: THREE.DoubleSide
		}),
		'leaf',
		(sh) => leafVertex(sh, u, true),
		leafFragment,
		nightPatch
	);
	const depth = patch(
		new THREE.MeshDepthMaterial({
			depthPacking: THREE.RGBADepthPacking,
			side: THREE.DoubleSide,
			map,
			alphaTest: 0.42
		}),
		'leaf-depth',
		(sh) => leafVertex(sh, u, false)
	);
	const mesh = new THREE.Mesh(geo, mat);
	mesh.customDepthMaterial = depth;
	mesh.castShadow = shadows;
	mesh.receiveShadow = true;
	return mesh;
}

export interface TreeMaterials {
	barkMap: THREE.Texture;
	barkNormal: THREE.Texture;
}

export function buildStand(
	items: StandItem[],
	mats: TreeMaterials,
	barkTint?: THREE.Color
): TreeHandles {
	const P: number[] = [],
		N: number[] = [],
		UV: number[] = [],
		C: number[] = [],
		PA: number[] = [],
		S: number[] = [],
		F: number[] = [];
	const I: number[] = [];
	const anchors: number[] = [],
		quats: number[] = [],
		scales: number[] = [],
		ss: number[] = [],
		flexes: number[] = [],
		tints: number[] = [],
		crowns: number[] = [];
	const perches: Perch[] = [];
	const skeletons: Skeleton[] = [];
	const t = new THREE.Vector3(),
		n = new THREE.Vector3(),
		b = new THREE.Vector3(),
		tmp = new THREE.Vector3();
	const q = new THREE.Quaternion();
	const qTurn = new THREE.Quaternion();
	const e = new THREE.Euler();
	const dir = new THREE.Vector3();
	const yAxis = new THREE.Vector3(0, 1, 0);
	let sMax = 0,
		height = 0;
	const box = new THREE.Box3();

	for (const item of items) {
		const sp = item.sp;
		const sk = grow(sp, item.seed, item.heightScale ?? 1);
		skeletons.push(sk);
		const r = rng(item.seed * 7 + 3);
		const so = item.sOffset ?? 0;
		// set it down where it stands
		qTurn.setFromAxisAngle(yAxis, item.rotY);
		for (const nd of sk.nodes) {
			nd.p.applyQuaternion(qTurn).add(item.pos);
			nd.dir.applyQuaternion(qTurn);
			nd.s += so;
		}
		sk.crown.applyQuaternion(qTurn).add(item.pos);
		sk.sMax += so;
		sMax = Math.max(sMax, sk.sMax);
		height = Math.max(height, sk.height);
		const { nodes, chains } = sk;
		for (const nd of nodes) box.expandByPoint(nd.p);
		const girth = nodes[1]?.r ?? sp.girth;
		const flexOf = (i: number) => Math.min(1, Math.max(0, 1 - Math.pow(nodes[i].r / girth, 0.4)));

		// ── bark ──
		for (const ch of chains) {
			const r0 = nodes[ch[1]].r;
			const radial = r0 > 0.12 ? 10 : r0 > 0.06 ? 8 : r0 > 0.03 ? 6 : 4;
			const base = P.length / 3;
			t.subVectors(nodes[ch[1]].p, nodes[ch[0]].p).normalize();
			n.set(0, 1, 0);
			if (Math.abs(t.dot(n)) > 0.9) n.set(1, 0, 0);
			n.sub(tmp.copy(t).multiplyScalar(n.dot(t))).normalize();
			for (let i = 0; i < ch.length; i++) {
				const nd = nodes[ch[i]];
				const prev = i > 0 ? nodes[ch[i - 1]] : nd;
				if (i > 0) {
					const nx = i < ch.length - 1 ? nodes[ch[i + 1]].p : null;
					t.subVectors(nd.p, prev.p).normalize();
					if (nx) t.add(tmp.subVectors(nx, nd.p).normalize()).normalize();
					n.sub(tmp.copy(t).multiplyScalar(n.dot(t))).normalize();
				}
				b.crossVectors(t, n);
				// the attaching ring is the branch's own size, sunk in its parent
				const rad = i === 0 ? r0 * 1.05 : nd.r;
				const flex = flexOf(ch[i]);
				const sPrev = i === 0 ? nd.s : prev.s;
				const circ = Math.max(1, Math.round((Math.PI * 2 * rad) / 0.35));
				for (let j = 0; j <= radial; j++) {
					const a = (j / radial) * Math.PI * 2;
					const cx = Math.cos(a),
						sx = Math.sin(a);
					const ox = n.x * cx + b.x * sx,
						oy = n.y * cx + b.y * sx,
						oz = n.z * cx + b.z * sx;
					P.push(nd.p.x + ox * rad, nd.p.y + oy * rad, nd.p.z + oz * rad);
					N.push(ox, oy, oz);
					UV.push((j / radial) * circ, nd.s / 1.2);
					C.push(nd.p.x, nd.p.y, nd.p.z);
					PA.push(prev.p.x, prev.p.y, prev.p.z);
					S.push(sPrev, nd.s);
					F.push(flex);
				}
			}
			const ring = radial + 1;
			for (let i = 0; i < ch.length - 1; i++)
				for (let j = 0; j < radial; j++) {
					const a = base + i * ring + j,
						c = a + ring;
					I.push(a, c, a + 1, a + 1, c, c + 1);
				}
		}

		// ── leaves ──
		const addLeaf = (i: number, spread: number, along: number) => {
			const nd = nodes[i];
			const par = nodes[nd.parent] ?? nd;
			dir.subVectors(nd.p, par.p);
			const segLen = dir.length() || 1;
			dir.normalize();
			const at = tmp.copy(par.p).addScaledVector(dir, segLen * along);
			anchors.push(at.x, at.y, at.z);
			crowns.push(sk.crown.x, sk.crown.y, sk.crown.z);
			// a card faces out of the crown, turned about at random, so a
			// crown seen from anywhere is a mass and not a row of edges
			const outward = new THREE.Vector3(at.x - sk.crown.x, 0.3, at.z - sk.crown.z).normalize();
			const aim = outward.clone();
			aim.x += (r() - 0.5) * spread;
			aim.y += (r() - 0.5) * spread;
			aim.z += (r() - 0.5) * spread;
			aim.normalize();
			q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aim);
			e.set(0, 0, r() * Math.PI * 2);
			q.multiply(new THREE.Quaternion().setFromEuler(e));
			quats.push(q.x, q.y, q.z, q.w);
			scales.push(sp.leaf.card * (0.75 + r() * 0.5));
			ss.push(nd.s);
			flexes.push(flexOf(i));
			tints.push(r());
		};
		for (const tip of sk.tips) {
			for (let k = 0; k < sp.leaf.cluster; k++) addLeaf(tip, 1.6, 0.6 + r() * 0.5);
			const nd = nodes[tip];
			perches.push({ p: nd.p.clone(), flex: flexOf(tip), s: nd.s });
		}
		if (sp.leaf.along > 0)
			for (let i = 1; i < nodes.length; i++) {
				if (nodes[i].tips > 1 && nodes[i].tips <= 6 && r() < sp.leaf.along) addLeaf(i, 2, r());
			}
	}

	const barkGeo = new THREE.BufferGeometry();
	barkGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
	barkGeo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
	barkGeo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
	barkGeo.setAttribute('aCenter', new THREE.Float32BufferAttribute(C, 3));
	barkGeo.setAttribute('aParent', new THREE.Float32BufferAttribute(PA, 3));
	barkGeo.setAttribute('aS', new THREE.Float32BufferAttribute(S, 2));
	barkGeo.setAttribute('aFlex', new THREE.Float32BufferAttribute(F, 1));
	barkGeo.setIndex(I);
	const sphere = box.getBoundingSphere(new THREE.Sphere());
	sphere.radius += 1.5;
	barkGeo.boundingSphere = sphere;

	const u = {
		uGrow: { value: sMax + 2 },
		uGrowAll: { value: 1 }
	};

	const barkMat = patch(
		new THREE.MeshStandardMaterial({
			map: mats.barkMap,
			normalMap: mats.barkNormal,
			normalScale: new THREE.Vector2(0.9, 0.9),
			color: barkTint ?? new THREE.Color(0.55, 0.47, 0.4),
			roughness: 0.92,
			metalness: 0
		}),
		'bark',
		(sh) => barkVertex(sh, u),
		nightPatch
	);
	const barkDepth = patch(
		new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }),
		'bark-depth',
		(sh) => barkVertex(sh, u)
	);
	const bark = new THREE.Mesh(barkGeo, barkMat);
	bark.customDepthMaterial = barkDepth;
	bark.castShadow = true;
	bark.receiveShadow = true;

	const leaves = leafCards(
		{ anchors, quats, scales, ss, flexes, tints, crowns },
		foliageFor(items[0].sp),
		u,
		sphere.clone()
	);
	const leafGeo = leaves.geometry;
	const leafMat = leaves.material as THREE.Material;
	const leafDepth = leaves.customDepthMaterial!;
	const leafBase = { dispose() {} };

	const group = new THREE.Group();
	group.add(bark, leaves);
	const crown = new THREE.Vector3();
	for (const sk of skeletons) crown.add(sk.crown);
	crown.divideScalar(skeletons.length);
	const size = box.getSize(new THREE.Vector3());
	return {
		group,
		bark,
		leaves,
		skeletons,
		items,
		height,
		crown,
		crownR: Math.max(size.x, size.z) / 2,
		sMax,
		u,
		perches,
		dispose() {
			barkGeo.dispose();
			leafGeo.dispose();
			leafBase.dispose();
			barkMat.dispose();
			barkDepth.dispose();
			leafMat.dispose();
			leafDepth.dispose();
		}
	};
}
