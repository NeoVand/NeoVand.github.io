import * as THREE from 'three';
import type { Grove } from './engine';
import type { Stand as TreeHandles } from './flora/plants';
import { bendTree } from './flora/wind';
import { U, patch, nightPatch } from './shared';
import { rng, clamp, damp, lerp, smoothstep } from './rng';

// ─── The air ──────────────────────────────────────────────────────────────
// By day two dozen doves; by night as many fireflies, which keep to the
// garden on their own (below). The doves keep to the grove in two parties,
// one to a tree, and a party crosses to another tree every twenty seconds or
// so; grab the tree a party is on and it is off almost together, some of it
// breaking for the pavilion, which nobody can pull over.
//
// Carried over from the flat grove: one bird and one number. `pose` says
// how far it has come out of the air onto the branch, and everything is
// read off it — the wings running out of the beat into the spread it brakes
// on and down onto its back, the body swinging from its heading to the
// small backward lean of a bird on a branch. On the wing a dove beats in
// runs of a few strokes and glides between them on wings held up in a
// shallow V, and it leans into its turns. A perched bird is drawn from its twig, through
// the same wind field that bends the twig, so the two move as one.

type Site =
	| { kind: 'twig'; tree: TreeHandles; i: number }
	| { kind: 'point'; p: THREE.Vector3; group: string };
type PointSite = Extract<Site, { kind: 'point' }>;

/** what a bird on its perch is about */
type Act = 'idle' | 'walk' | 'hop' | 'peck' | 'preen' | 'flutter' | 'coo';

/** an angle brought round to the short way, within half a turn of nothing */
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

interface Creature {
	id: number;
	party: number;
	state: 'away' | 'perch' | 'fly' | 'wheel';
	site: Site | null;
	pos: THREE.Vector3;
	vel: THREE.Vector3;
	yaw: number;
	yawTo: number;
	pose: number;
	flap: number;
	phase: number;
	timer: number;
	size: number;
	tone: number;
	// flight
	from: THREE.Vector3;
	c1: THREE.Vector3;
	c2: THREE.Vector3;
	ft: number;
	fdur: number;
	/** still off stage, waiting for its entrance */
	arriving: boolean;
	/** this flight is only a hop, along the ledge or to the next twig */
	hop: boolean;
	yawFrom: number;
	// on the perch
	act: Act;
	actT: number;
	actLen: number;
	count: number;
	side: number;
	walkTo: THREE.Vector3;
	hopTo: Site | null;
	gait: number;
	/** the body comes round in little shuffles, a step at a time */
	yawStep: number;
	stepT: number;
	// the head: turned, tipped down, pushed forward; and where the eyes are
	hy: number;
	hp: number;
	hz: number;
	lookY: number;
	lookP: number;
	lookT: number;
	lean: number;
	roll: number;
	bob: number;
	/** the wings, while it stands */
	wf: number;
	wo: number;
	/** started up off the turning island: circling in the open air, and the perch it left */
	wheel: Wheel | null;
	home: Site | null;
	/** a moment yet before it goes up with the rest (-1: not going) */
	goIn: number;
	/** leaning into a turn */
	bank: number;
	/** the wingbeat: where in the stroke, how hard, whether it is beating
	 *  or gliding, and for how much longer */
	wp: number;
	amp: number;
	beating: boolean;
	wT: number;
}

/**
 * A bird circling over the island. It is in the air, not on the island, so
 * it is kept in the air's frame (which the eye's turn carries round) and
 * the island goes round under it when it is turned.
 */
interface Wheel {
	/** where it is and how it is going, in the air */
	q: THREE.Vector3;
	w: THREE.Vector3;
	/** its heading in the air, turned toward the way it goes */
	ah: number;
	/** its own ring: how wide, how high, its sway, its place in the flock, its speed */
	r: number;
	h: number;
	ph: number;
	off: number;
	v: number;
	/** how long it has been up, the least it stays, how long the island has
	 *  been still, and how long it lets it be still before it thinks of coming down */
	t: number;
	stay: number;
	calm: number;
	linger: number;
}

/**
 * Where a flock lives: the trees it has, the other places it stands and
 * walks, what it must fly round, where it comes in from and goes to, and the
 * eye it is seen by. The grove's is its rotunda and its wall; the islet's,
 * its lantern, its stones, its grass and its gramophone.
 */
export interface Habitat {
	readonly camera: THREE.PerspectiveCamera;
	readonly reduced: boolean;
	readonly trees: TreeHandles[];
	/** how many birds */
	count: number;
	/** places to stand other than a twig, how often each is taken, and those
	 *  that have room for one bird only */
	spots: { name: string; weight: number; single?: boolean }[];
	/** how often a bird takes one of those rather than a twig */
	spotChance: number;
	/** which of them are ledges it can walk along */
	walks: string[];
	/** where to wait while no tree is ready, and where a bird put off a tree goes */
	fallback: string;
	refuge: string[];
	/** a place of the kind */
	spot(name: string, r: () => number, out: THREE.Vector3): THREE.Vector3;
	/** somewhere `d` along from `p` on the same ledge, into `out`; or null */
	walk(
		name: string,
		p: THREE.Vector3,
		d: number,
		r: () => number,
		out: THREE.Vector3
	): THREE.Vector3 | null;
	/** a point walked to, put back onto its surface */
	settle?(name: string, p: THREE.Vector3): void;
	/** inside what a bird must fly round, with `m` to spare */
	solid(p: THREE.Vector3, m: number): boolean;
	/** how wide round it a flight swings, and how high over it; null if nothing */
	readonly around: { R: number; top: number } | null;
	/** the ring a startled flock goes round on, how wide and how high */
	ring: { r: [number, number]; h: [number, number] };
	/** a point out of the picture, where arrivals come from and leavers go */
	offstage(out: THREE.Vector3, r: () => number): THREE.Vector3;
	/** where a firefly might be; without it, no fireflies */
	flyHome?(near: THREE.Vector3 | undefined, r: () => number): THREE.Vector3;
	/** how far the lights have come on, and the picture's height in its own
	 *  pixels and its scale, for the fireflies */
	readonly arrive: number;
	readonly pxH: number;
	readonly dpr: number;
}

/** The grove's: the rotunda's dome, its cornice sills and its finial, and the wall. */
export function groveHabitat(g: Grove): Habitat {
	const tmp = new THREE.Vector3(),
		tmp2 = new THREE.Vector3();
	/** on the dome, at a latitude up from the cornice and an azimuth round from the front */
	const roofAt = (lat: number, az: number, out: THREE.Vector3) => {
		const { r: R, y, h } = g.pavilion.dome;
		return out.set(
			Math.cos(lat) * R * Math.sin(az),
			y + Math.sin(lat) * h + 0.02,
			Math.cos(lat) * R * Math.cos(az)
		);
	};
	/** where on the dome a point is, as [latitude, azimuth] */
	const domeAt = (p: THREE.Vector3): [number, number] => {
		const { r: R, y, h } = g.pavilion.dome;
		return [Math.atan2((p.y - 0.02 - y) / h, Math.hypot(p.x, p.z) / R), Math.atan2(p.x, p.z)];
	};
	return {
		get camera() {
			return g.camera;
		},
		get reduced() {
			return g.reduced;
		},
		get trees() {
			return g.trees;
		},
		get arrive() {
			return g.arrive;
		},
		get pxH() {
			return g.H * g.bufferScale;
		},
		get dpr() {
			return g.bufferScale;
		},
		count: 24,
		spots: [
			{ name: 'roof', weight: 2 },
			{ name: 'sill', weight: 1 },
			{ name: 'rim', weight: 1 },
			{ name: 'crown', weight: 1, single: true }
		],
		spotChance: 0.22,
		walks: ['roof', 'sill', 'rim'],
		fallback: 'roof',
		refuge: ['roof', 'sill'],
		spot(group, r, out) {
			if (group === 'roof') return roofAt(lerp(0.35, 1.2, r()), lerp(-1.3, 1.3, r()), out);
			if (group === 'crown') return out.copy(g.pavilion.crown).setY(g.pavilion.crown.y + 0.06);
			if (group === 'sill') {
				const [a, b] = g.pavilion.sills[Math.floor(r() * g.pavilion.sills.length)];
				return out.copy(a).lerp(b, r());
			}
			if (group === 'rim') {
				// the near side, where it is seen
				const cand = g.island.rim.filter((p) => p.z > 1);
				return out.copy(cand[Math.floor(r() * cand.length)]);
			}
			return out.set(0, 0, 0);
		},
		// over the dome, down the cornice's run, round the wall's top
		walk(group, p, d, r, q) {
			if (group === 'roof') {
				const { r: R, h } = g.pavilion.dome;
				const [lat, az] = domeAt(p);
				const a = r() * Math.PI;
				return roofAt(
					clamp(lat + (Math.sin(a) * d) / h, 0.35, 1.2),
					clamp(az + (Math.cos(a) * d) / (R * Math.cos(lat)), -1.35, 1.35),
					q
				);
			}
			if (group === 'sill') {
				// the run it is on, and how far along it
				let best = g.pavilion.sills[0],
					bd = Infinity;
				for (const run of g.pavilion.sills) {
					const dd = p.distanceTo(run[0]) + p.distanceTo(run[1]);
					if (dd < bd) [bd, best] = [dd, run];
				}
				const [a, b] = best;
				const len = a.distanceTo(b);
				const u = tmp.subVectors(p, a).dot(tmp2.subVectors(b, a)) / (len * len);
				return q.copy(a).lerp(b, clamp(u + d / len, 0.06, 0.94));
			}
			if (group === 'rim') {
				const top = g.island.rim[0];
				const cx = Math.hypot(top.x, top.z);
				const th = Math.atan2(-p.z, p.x) + d / cx;
				q.set(cx * Math.cos(th), top.y, -cx * Math.sin(th));
				// and only on the near side, where it is seen
				return q.z < 1 ? null : q;
			}
			return null;
		},
		settle(group, p) {
			if (group === 'roof') {
				const [lat, az] = domeAt(p);
				roofAt(lat, az, p);
			}
		},
		/** in the rotunda's walls or under its dome */
		solid(p, m) {
			const pv = g.pavilion;
			const { r: R, y: dy, h } = pv.dome;
			if (p.y < pv.floorY - 0.4) return false;
			const rh = Math.hypot(p.x, p.z);
			// the cornice's corners, where the sills are, stand out furthest
			const [a, b] = pv.sills[0];
			const eaves = a.y;
			const wallR = Math.hypot((a.x + b.x) / 2, (a.z + b.z) / 2) + 0.1;
			if (p.y < eaves + m) return rh < wallR + m;
			if (p.y < dy) return rh < R + m;
			const u = rh / (R + m),
				v = (p.y - dy) / (h + m);
			if (u * u + v * v < 1) return true;
			return rh < 0.3 + m && p.y < pv.crown.y + 0.3 + m;
		},
		get around() {
			const pv = g.pavilion;
			const [a, b] = pv.sills[0];
			return {
				R: Math.max(Math.hypot((a.x + b.x) / 2, (a.z + b.z) / 2), pv.dome.r) + 1.4,
				top: pv.crown.y + 1
			};
		},
		// about the heads of the trees, out beyond the cypresses
		ring: { r: [7, 8.6], h: [6.4, 7.6] },
		offstage(out, r) {
			const side = r() < 0.5 ? -1 : 1;
			out.set(side * lerp(12, 18, r()), lerp(9, 14, r()), lerp(-8, 6, r()));
			// keep it on the far side of the camera's frame
			out.x += g.camera.position.x * 0.2;
			return out;
		},
		/**
		 * Somewhere a firefly might be: mostly low over the lawn and among the
		 * shrubs by the wall, some up in the lower crowns; never in the
		 * rotunda's walls, and never out over the edge.
		 */
		flyHome(near, r) {
			const p = new THREE.Vector3();
			for (let k = 0; k < 20; k++) {
				if (near) {
					p.set(near.x + (r() - 0.5) * 2.4, 0, near.z + (r() - 0.5) * 2.4);
					p.y = clamp(near.y + (r() - 0.5) * 0.8, 0.25, 3.6);
				} else {
					const a = r() * Math.PI * 2,
						rad = lerp(2.9, 6.2, Math.sqrt(r()));
					const high = r() < 0.25;
					p.set(
						Math.sin(a) * rad,
						high ? lerp(1.8, 3.6, r()) : lerp(0.25, 1.5, r()),
						Math.cos(a) * rad
					);
				}
				const rh = Math.hypot(p.x, p.z);
				if (rh > 2.9 && rh < 6.2) return p;
			}
			return p.set(0, 0.8, 4.2);
		}
	};
}

/** A white dove: body along +z, wings hinged at the shoulders, grey at the
 *  tips, as in the old pictures of garden houses in the air. */
function birdGeometry() {
	const pos: number[] = [],
		col: number[] = [],
		side: number[] = [];
	const I: number[] = [];
	const push = (x: number, y: number, z: number, c: [number, number, number], s = 0) => {
		pos.push(x, y, z);
		col.push(...c);
		side.push(s);
		return pos.length / 3 - 1;
	};
	const back: [number, number, number] = [0.8, 0.8, 0.82];
	const belly: [number, number, number] = [0.93, 0.92, 0.9];
	const wing: [number, number, number] = [0.86, 0.87, 0.89];
	const bar: [number, number, number] = [0.6, 0.61, 0.65];
	const beak: [number, number, number] = [0.6, 0.42, 0.4];
	// body: rings along z, the highest point over the eye
	const prof: [number, number, number][] = [
		// z, radius, lift
		[-0.34, 0.03, 0.02],
		[-0.26, 0.09, 0.01],
		[-0.12, 0.15, 0.0],
		[0.04, 0.16, 0.0],
		[0.16, 0.13, 0.03],
		[0.24, 0.11, 0.07],
		[0.31, 0.105, 0.09],
		[0.37, 0.08, 0.09],
		[0.41, 0.04, 0.08]
	];
	const seg = 8;
	for (const [z, r, lift] of prof)
		for (let j = 0; j < seg; j++) {
			const a = (j / seg) * Math.PI * 2;
			const y = Math.cos(a),
				x = Math.sin(a);
			const c = y < -0.25 && z > -0.2 ? belly : back;
			push(x * r * 0.85, y * r + lift, z, c);
		}
	for (let i = 0; i < prof.length - 1; i++)
		for (let j = 0; j < seg; j++) {
			const a = i * seg + j,
				b = i * seg + ((j + 1) % seg);
			const c = a + seg,
				d = b + seg;
			I.push(a, c, b, b, c, d);
		}
	// beak
	const b0 = push(0, 0.1, 0.52, beak);
	const lastRing = (prof.length - 1) * seg;
	for (let j = 0; j < seg; j++) I.push(lastRing + j, b0, lastRing + ((j + 1) % seg));
	// tail: a fan, a little up
	const t0 = push(-0.05, 0.03, -0.3, wing),
		t1 = push(0.05, 0.03, -0.3, wing);
	const t2 = push(0.1, 0.07, -0.66, wing),
		t3 = push(-0.1, 0.07, -0.66, wing);
	I.push(t0, t1, t2, t0, t2, t3, t0, t2, t1, t0, t3, t2);
	// wings, hinged at the shoulder; side is -1 left, +1 right
	for (const s of [-1, 1]) {
		const h0 = push(s * 0.1, 0.1, 0.14, wing, s),
			h1 = push(s * 0.1, 0.1, -0.14, wing, s);
		const m0 = push(s * 0.38, 0.1, 0.1, bar, s),
			m1 = push(s * 0.36, 0.1, -0.18, wing, s);
		const tp = push(s * 0.78, 0.1, -0.28, bar, s);
		I.push(h0, m0, h1, h1, m0, m1, m0, tp, m1);
		I.push(h0, h1, m0, h1, m1, m0, m0, m1, tp);
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
	g.setIndex(I);
	g.computeVertexNormals();
	return g;
}

const WING_V = /* glsl */ `
attribute float aSide;
attribute vec2 iWing; // flap angle, fold 0..1
attribute vec3 iHead; // the head: turned, tipped down, pushed forward
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
`;

export class Air {
	group = new THREE.Group();
	private h: Habitat;
	private n: number;
	private birds: THREE.InstancedMesh;
	private wingAttr: THREE.InstancedBufferAttribute;
	private headAttr: THREE.InstancedBufferAttribute;
	private flies: THREE.Points;
	private flyPos: Float32Array;
	private flyGlow: Float32Array;
	/** The fireflies are in the air, not on the island: when it is turned
	 *  they stay where they are and it goes round under them. So they hang
	 *  in a frame that turns with the eye, and their light on the garden is
	 *  laid where they really are. */
	private flyGroup = new THREE.Group();
	private flyWorld: Float32Array;
	/** the eye's turn about the island, and whether the island is being turned */
	private yaw = 0;
	private spinning = false;
	/** the flock circling, where its middle is on the ring, and which way round */
	private flock = { phi: 0, dir: 1 };
	/** each firefly's patch of air, where it is going, and its flashing */
	private ff: {
		home: THREE.Vector3;
		to: THREE.Vector3;
		move: number;
		ph: number;
		flash: number;
		wait: number;
		len: number;
	}[] = [];
	private c: Creature[] = [];
	private r = rng(91);
	private day: number;
	private dayTo: number;
	private started = false;
	private partyTree: (TreeHandles | null)[] = [null, null];
	private migrateT = 18;
	private m = new THREE.Matrix4();
	private q = new THREE.Quaternion();
	private tmp = new THREE.Vector3();
	private tmp2 = new THREE.Vector3();

	constructor(h: Habitat) {
		this.h = h;
		const N = (this.n = h.count);
		this.flyWorld = new Float32Array(N * 3);
		this.day = this.dayTo = U.uNight.value < 0.5 ? 1 : 0;
		const geo = birdGeometry();
		this.wingAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
		this.wingAttr.setUsage(THREE.DynamicDrawUsage);
		geo.setAttribute('iWing', this.wingAttr);
		this.headAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
		this.headAttr.setUsage(THREE.DynamicDrawUsage);
		geo.setAttribute('iHead', this.headAttr);
		const mat = patch(
			new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
			'bird',
			(s) => {
				s.vertexShader =
					WING_V +
					s.vertexShader
						.replace(
							'#include <beginnormal_vertex>',
							`vec3 objectNormal = vec3(normal);
						if (aSide != 0.0) {
							objectNormal = rotY(aSide * iWing.y * 1.5) * (rotZ(aSide * iWing.x * (1.0 - iWing.y)) * objectNormal);
						} else if (position.z > 0.14) {
							float hw = smoothstep(0.14, 0.3, position.z);
							objectNormal = rotY(iHead.x * hw) * (rotX(iHead.y * hw) * objectNormal);
						}`
						)
						.replace(
							'#include <begin_vertex>',
							`vec3 transformed = vec3(position);
						if (aSide != 0.0) {
							vec3 hinge = vec3(aSide * 0.1, 0.1, 0.0);
							vec3 v = transformed - hinge;
							v = rotZ(aSide * iWing.x * (1.0 - iWing.y)) * v;
							v = rotY(aSide * iWing.y * 1.5) * v;
							v.y -= iWing.y * abs(v.x) * 0.25;
							v.x *= 1.0 - iWing.y * 0.55;
							transformed = hinge + v;
						} else if (position.z > 0.14) {
							// the head, and the neck with it, turned about the neck's root
							float hw = smoothstep(0.14, 0.3, position.z);
							vec3 neck = vec3(0.0, 0.07, 0.16);
							vec3 v = rotY(iHead.x * hw) * (rotX(iHead.y * hw) * (transformed - neck));
							v.z += iHead.z * hw;
							transformed = neck + v;
						}`
						);
			},
			nightPatch
		);
		this.birds = new THREE.InstancedMesh(geo, mat, N);
		this.birds.frustumCulled = false;
		this.birds.castShadow = true;
		this.birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

		// fireflies: points of yellow-green, blinking
		const fg = new THREE.BufferGeometry();
		this.flyPos = new Float32Array(N * 3);
		this.flyGlow = new Float32Array(N);
		fg.setAttribute(
			'position',
			new THREE.BufferAttribute(this.flyPos, 3).setUsage(THREE.DynamicDrawUsage)
		);
		fg.setAttribute(
			'aGlow',
			new THREE.BufferAttribute(this.flyGlow, 1).setUsage(THREE.DynamicDrawUsage)
		);
		const fm = new THREE.ShaderMaterial({
			uniforms: { uScale: { value: 1 }, uDpr: { value: 1 } },
			vertexShader: /* glsl */ `
				attribute float aGlow;
				uniform float uScale;
				uniform float uDpr;
				varying float vGlow;
				void main() {
					vGlow = aGlow;
					vec4 mv = modelViewMatrix * vec4(position, 1.0);
					// a bright point in a soft halo of its own light: a few
					// pixels across, however near it comes
					gl_PointSize = clamp(uScale / -mv.z, 10.0 * uDpr, 24.0 * uDpr);
					gl_Position = projectionMatrix * mv;
				}`,
			fragmentShader: /* glsl */ `

				varying float vGlow;
				void main() {
					float d = length(gl_PointCoord - 0.5) * 2.0;
					// the core bright enough to bloom, the halo round it faint
					float core = exp(-d * d * 70.0);
					float halo = exp(-d * d * 7.0) * max(1.0 - d, 0.0);
					gl_FragColor = vec4(vec3(0.8, 1.0, 0.4) * (core * 7.0 + halo * 0.7) * vGlow, 1.0);
				}`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		});
		this.flies = new THREE.Points(fg, fm);
		this.flies.frustumCulled = false;
		this.flyGroup.add(this.flies);
		this.group.add(this.birds, this.flyGroup);

		for (let i = 0; i < N; i++) {
			this.c.push({
				id: i,
				party: i % 2,
				state: 'away',
				site: null,
				pos: new THREE.Vector3(0, -200, 0),
				vel: new THREE.Vector3(),
				yaw: this.r() * Math.PI * 2,
				yawTo: 0,
				pose: 1,
				flap: 0,
				phase: this.r() * 10,
				timer: 0,
				size: lerp(0.3, 0.38, this.r()),
				tone: this.r(),
				from: new THREE.Vector3(),
				c1: new THREE.Vector3(),
				c2: new THREE.Vector3(),
				ft: 0,
				fdur: 1,
				arriving: false,
				hop: false,
				yawFrom: 0,
				act: 'idle',
				actT: 0,
				actLen: 1,
				count: 0,
				side: 1,
				walkTo: new THREE.Vector3(),
				hopTo: null,
				gait: 0,
				yawStep: 0,
				stepT: 0,
				hy: 0,
				hp: 0,
				hz: 0,
				lookY: 0,
				lookP: 0,
				lookT: 0,
				lean: 0.28,
				roll: 0,
				bob: 0,
				wf: 0,
				wo: 1,
				wheel: null,
				home: null,
				goIn: -1,
				bank: 0,
				wp: this.r() * 6,
				amp: 0,
				beating: false,
				wT: 0
			});
		}
		for (let i = 0; i < N; i++) {
			const home = this.flyHome();
			this.ff.push({
				home,
				to: home.clone(),
				move: lerp(4, 12, this.r()),
				ph: this.r() * 100,
				flash: -1,
				wait: this.r() * 4,
				len: 0.5
			});
		}
	}

	/** somewhere a firefly might be, if this habitat has any */
	private flyHome(near?: THREE.Vector3) {
		return this.h.flyHome ? this.h.flyHome(near, this.r) : new THREE.Vector3(0, -200, 0);
	}

	// ── where a bird can be ───────────────────────────────────────────────
	/** twig ends high on the crown, where a bird shows against the sky */
	/** twig ends high on the crown, where a bird shows against the sky —
	 *  and only those that have grown, since a bird cannot land on a promise */
	private twigsOf(t: TreeHandles) {
		const ps = t.perches;
		const top = t.height * 0.55;
		const grown = t.u.uGrow.value;
		const out: number[] = [];
		for (let i = 0; i < ps.length; i++) if (ps[i].p.y > top && ps[i].s < grown - 0.8) out.push(i);
		if (out.length) return out;
		for (let i = 0; i < ps.length; i++) if (ps[i].s < grown - 0.8) out.push(i);
		return out;
	}

	/** is the twig under this site there at all? */
	private standing(s: Site) {
		if (s.kind !== 'twig') return true;
		const pr = s.tree.perches[s.i];
		return !!pr && s.tree.u.uGrow.value - pr.s > 0.4;
	}

	private sitePos(s: Site, out: THREE.Vector3) {
		if (s.kind === 'twig') {
			const pr = s.tree.perches[s.i];
			if (!pr) return out.set(0, -100, 0);
			// the twig as the wind has it right now
			bendTree(pr.p, pr.base, pr.height, pr.flex, out);
			out.y += 0.05;
			return out;
		}
		return out.copy(s.p);
	}

	private pointSites(group: string) {
		return this.h.spot(group, this.r, new THREE.Vector3());
	}

	/** is anyone else standing at `q`, or on the way there? */
	private crowded(q: THREE.Vector3, cr: Creature) {
		for (const o of this.c) {
			if (o === cr || o.state === 'away' || o.site?.kind !== 'point') continue;
			if (o.site.p.distanceTo(q) < 0.26) return true;
			if (o.act === 'walk' && o.walkTo.distanceTo(q) < 0.26) return true;
		}
		return false;
	}

	/**
	 * Somewhere a short way along the ledge a bird is standing on, clear of
	 * the others. Null if there is nowhere.
	 */
	private along(s: PointSite, lo: number, hi: number, cr: Creature) {
		if (!this.h.walks.includes(s.group)) return null;
		const r = this.r;
		const q = new THREE.Vector3();
		for (let k = 0; k < 8; k++) {
			const d = lerp(lo, hi, r()) * (r() < 0.5 ? -1 : 1);
			if (!this.h.walk(s.group, s.p, d, r, q)) continue;
			if (q.distanceTo(s.p) < lo * 0.6 || this.crowded(q, cr)) continue;
			return q;
		}
		return null;
	}

	/** another twig high on the same crown, a hop away, with nobody on it */
	private nearTwig(cr: Creature): Site | null {
		const s = cr.site;
		if (s?.kind !== 'twig') return null;
		const here = s.tree.perches[s.i]?.p;
		if (!here) return null;
		const taken = (i: number) =>
			this.c.some(
				(o) => o !== cr && o.site?.kind === 'twig' && o.site.tree === s.tree && o.site.i === i
			);
		const cand = this.twigsOf(s.tree).filter((i) => {
			if (i === s.i) return false;
			const d = s.tree.perches[i].p.distanceTo(here);
			return d > 0.25 && d < 1.4 && !taken(i);
		});
		return cand.length
			? { kind: 'twig', tree: s.tree, i: cand[Math.floor(this.r() * cand.length)] }
			: null;
	}

	private pickSite(cr: Creature, prefer?: TreeHandles | null): Site {
		const r = this.r();
		const h = this.h;
		const trees = h.trees;
		const tree = prefer ?? this.partyTree[cr.party] ?? trees[Math.floor(this.r() * trees.length)];
		if (prefer === undefined && r < h.spotChance) {
			let x = this.r() * h.spots.reduce((a, s) => a + s.weight, 0);
			let sp = h.spots[0];
			for (const s of h.spots) {
				sp = s;
				if ((x -= s.weight) < 0) break;
			}
			const gname = sp.name;
			if (!sp.single || !this.c.some((o) => o.site?.kind === 'point' && o.site.group === gname))
				return { kind: 'point', p: this.pointSites(gname), group: gname };
		}
		const twigs = tree ? this.twigsOf(tree) : [];
		// a tree still coming up: wait somewhere else instead
		if (!tree || !twigs.length)
			return { kind: 'point', p: this.pointSites(h.fallback), group: h.fallback };
		return { kind: 'twig', tree, i: twigs[Math.floor(this.r() * twigs.length)] };
	}

	// ── flights ───────────────────────────────────────────────────────────
	private fly(cr: Creature, to: Site, delay = 0) {
		// already on the wing, it goes at once, on from the way it was going
		const onWing = cr.state === 'wheel' || (cr.state === 'fly' && !cr.hop && cr.ft >= 0);
		if (onWing) delay = 0;
		else {
			cr.beating = true;
			cr.wT = lerp(0.45, 1, this.r());
		}
		cr.wheel = null;
		cr.goIn = -1;
		cr.site = to;
		cr.from.copy(cr.pos);
		const end = this.sitePos(to, this.tmp);
		const d = cr.from.distanceTo(end);
		// an arc that dips below the straight line, then flattens into the perch
		const up = clamp(d * 0.28, 0.4, 3.5);
		cr.c1
			.copy(cr.from)
			.lerp(end, 0.33)
			.add(this.tmp2.set(0, up, 0));
		cr.c2
			.copy(cr.from)
			.lerp(end, 0.75)
			.add(this.tmp2.set(0, up * 0.35, 0));
		cr.fdur = clamp(d / lerp(4.2, 5.4, this.r()), 0.7, 4.5);
		const sp = cr.vel.length();
		if (onWing && sp > 0.5)
			cr.c1.copy(cr.from).addScaledVector(cr.vel, Math.min((sp * cr.fdur) / 3, d * 0.45) / sp);
		cr.ft = -delay;
		cr.state = 'fly';
		this.route(cr, end.clone());
		cr.hop = false;
		cr.act = 'idle';
		cr.hopTo = null;
	}

	/** is `p` in what a bird flies round, with `m` to spare? */
	private inBuilding(p: THREE.Vector3, m: number) {
		return this.h.solid(p, m);
	}

	/** does the flight laid out for `cr` keep out of the building? */
	private clear(cr: Creature, end: THREE.Vector3) {
		const q = new THREE.Vector3();
		for (let i = 1; i < 24; i++) {
			this.bezier(cr, i / 24, q);
			if (q.distanceTo(cr.from) < 0.5 || q.distanceTo(end) < 0.5) continue;
			if (this.inBuilding(q, 0.3)) return false;
		}
		return true;
	}

	/**
	 * A flight never goes through the rotunda. If the straight arc would, it
	 * swings wide round the side it is nearer, or the other, and failing both
	 * goes up over the dome.
	 */
	private route(cr: Creature, end: THREE.Vector3) {
		const around = this.h.around;
		if (!around || this.clear(cr, end)) return;
		const c1 = cr.c1.clone(),
			c2 = cr.c2.clone();
		const R = around.R;
		const n = new THREE.Vector3(-(end.z - cr.from.z), 0, end.x - cr.from.x).normalize();
		const mid = cr.from.clone().lerp(end, 0.5);
		const near = Math.sign(n.x * mid.x + n.z * mid.z) || 1;
		// out along ±n until the point is R from the axis
		const wide = (c: THREE.Vector3, from: THREE.Vector3, s: number) => {
			const an = (from.x * n.x + from.z * n.z) * s;
			const aa = from.x * from.x + from.z * from.z;
			const k = aa >= R * R ? 0 : -an + Math.sqrt(an * an - aa + R * R);
			c.copy(from).addScaledVector(n, k * s);
		};
		for (const s of [near, -near]) {
			wide(cr.c1, c1, s);
			wide(cr.c2, c2, s);
			if (this.clear(cr, end)) {
				cr.fdur *= 1.25;
				return;
			}
		}
		// over the top, higher each time until it is clear
		const top = around.top;
		for (let k = 0; k < 4; k++) {
			const y = (top + k - 0.125 * (cr.from.y + end.y)) / 0.75;
			cr.c1.copy(c1).setY(Math.max(c1.y, y));
			cr.c2.copy(c2).setY(Math.max(c2.y, y));
			if (this.clear(cr, end)) break;
		}
		cr.fdur *= 1.3;
	}

	/**
	 * Which way to stand, somewhere worth facing: as often as not toward the
	 * garden's visitor, now and then away, otherwise anywhere.
	 */
	private face(cr: Creature) {
		const cam = this.group.worldToLocal(this.tmp.copy(this.h.camera.position));
		const toCam = Math.atan2(cam.x - cr.pos.x, cam.z - cr.pos.z);
		const r = this.r();
		const want =
			r < 0.5
				? toCam + (this.r() - 0.5) * 1.4
				: r < 0.7
					? toCam + Math.PI + (this.r() - 0.5) * 1.4
					: this.r() * Math.PI * 2;
		return cr.yaw + wrap(want - cr.yaw);
	}

	/**
	 * A hop: a low, quick arc, the wings half open for a beat or two, and
	 * the body turning on the way to face `face` as it comes down.
	 */
	private hop(cr: Creature, to: Site, face: number) {
		cr.site = to;
		cr.from.copy(cr.pos);
		const end = this.sitePos(to, this.tmp);
		const d = cr.from.distanceTo(end);
		// a cubic whose middle points are both raised peaks at three quarters of it
		const h = (0.07 + d * 0.22) / 0.75;
		cr.c1.copy(cr.from).lerp(end, 0.3);
		cr.c1.y += h + Math.max(0, end.y - cr.from.y) * 0.3;
		cr.c2.copy(cr.from).lerp(end, 0.7);
		cr.c2.y += h;
		cr.fdur = 0.26 + d * 0.2;
		cr.ft = 0;
		cr.yawFrom = cr.yaw;
		cr.yawTo = face;
		cr.hop = true;
		cr.act = 'idle';
		cr.hopTo = null;
		cr.state = 'fly';
	}

	private bezier(cr: Creature, t: number, out: THREE.Vector3) {
		const end = this.sitePos(cr.site!, this.tmp2);
		const u = 1 - t;
		return out
			.copy(cr.from)
			.multiplyScalar(u * u * u)
			.addScaledVector(cr.c1, 3 * u * u * t)
			.addScaledVector(cr.c2, 3 * u * t * t)
			.addScaledVector(end, t * t * t);
	}

	/** A point just out of the picture, from where an arrival can come in. */
	private offstage(out: THREE.Vector3) {
		return this.h.offstage(out, this.r);
	}

	begin() {
		this.started = true;
		const trees = this.h.trees;
		const shuffled = [...trees].sort(() => this.r() - 0.5);
		this.partyTree = [shuffled[0] ?? null, shuffled[1] ?? null];
		for (const cr of this.c) {
			this.offstage(cr.pos);
			// by night they are away already, and come with the morning
			if (this.dayTo < 0.5) {
				cr.state = 'away';
				cr.site = null;
				continue;
			}
			const site = this.pickSite(cr);
			const delay = this.h.reduced ? 0 : lerp(2.6, 7.5, this.r());
			if (this.h.reduced) {
				cr.site = site;
				this.sitePos(site, cr.pos);
				cr.state = 'perch';
				cr.pose = 1;
				cr.timer = lerp(2, 8, this.r());
			} else {
				this.fly(cr, site, delay);
				cr.arriving = true;
			}
		}
	}

	/**
	 * Everyone at once where they would be by now: for a flock first seen
	 * long after it would have come in. By night they are away.
	 */
	settle() {
		this.started = true;
		const shuffled = [...this.h.trees].sort(() => this.r() - 0.5);
		this.partyTree = [shuffled[0] ?? null, shuffled[1] ?? null];
		for (const cr of this.c) {
			if (this.dayTo < 0.5) {
				cr.state = 'away';
				cr.site = null;
				this.offstage(cr.pos);
				continue;
			}
			const site = this.pickSite(cr);
			cr.site = site;
			this.sitePos(site, cr.pos);
			cr.state = 'perch';
			cr.pose = 1;
			cr.arriving = false;
			cr.act = 'idle';
			cr.timer = lerp(0.5, 5, this.r());
			cr.yaw = cr.yawTo = cr.yawStep = this.face(cr);
		}
	}

	get begun() {
		return this.started;
	}

	/**
	 * The lights change over. As night comes the doves go: up off their
	 * perches a few at a time, and away out of the picture. With the morning
	 * they come back in from where they went, and settle.
	 */
	setDay(day: boolean) {
		const was = this.dayTo;
		this.dayTo = day ? 1 : 0;
		if (!this.started || was === this.dayTo) return;
		const reduced = this.h.reduced;
		for (const cr of this.c) {
			const leaving = cr.state === 'fly' && cr.site?.kind === 'point' && cr.site.group === 'away';
			if (!day) {
				if (cr.state === 'away' || leaving) continue;
				if (reduced) {
					cr.state = 'away';
					cr.site = null;
					continue;
				}
				cr.arriving = false;
				this.fly(
					cr,
					{ kind: 'point', p: this.offstage(new THREE.Vector3()), group: 'away' },
					this.r() * 1.4
				);
			} else {
				if (cr.state !== 'away' && !leaving) continue;
				const site = this.pickSite(cr);
				if (reduced) {
					cr.site = site;
					this.sitePos(site, cr.pos);
					cr.state = 'perch';
					cr.pose = 1;
					cr.timer = lerp(2, 8, this.r());
					continue;
				}
				// those still on their way out turn back at once; the rest come
				// in over the next few seconds
				this.fly(cr, site, leaving ? this.r() * 0.3 : lerp(0.6, 3.6, this.r()));
				cr.arriving = !leaving;
			}
		}
	}

	/**
	 * The island is turned under them: most of the birds on it start up
	 * together, clattering, and go round over it in a loose ring, as doves
	 * do over a roof when something has put them up: gathering into a flock
	 * as they go, the island turning under them, until it is still again
	 * and each, as its perch comes round, drops out of the ring onto it.
	 */
	startle() {
		if (!this.started || this.h.reduced) return;
		const wheeling = this.c.some((cr) => cr.state === 'wheel');
		let sx = 0,
			sz = 0;
		for (const cr of this.c) {
			if (cr.state !== 'perch' || !cr.site || cr.goIn >= 0 || this.r() > 0.85) continue;
			// not all at once: one goes and the rest go with it
			cr.goIn = this.r() * this.r() * 0.45;
			const q = this.toAir(cr.pos, this.tmp);
			const a = Math.atan2(q.z, q.x);
			sx += Math.cos(a);
			sz += Math.sin(a);
		}
		// a new flock gathers about where most of them were, and goes round
		// one way or the other
		if (!wheeling && (sx || sz)) {
			this.flock.phi = Math.atan2(sz, sx);
			this.flock.dir = this.r() < 0.5 ? 1 : -1;
		}
	}

	/** a point on the island, in the air's frame (which the island turns under) */
	private toAir(p: THREE.Vector3, out: THREE.Vector3) {
		const c = Math.cos(this.yaw),
			sn = Math.sin(this.yaw);
		return out.set(p.x * c - p.z * sn, p.y, p.x * sn + p.z * c);
	}

	/** and a point in the air, where it is over the island now */
	private fromAir(q: THREE.Vector3, out: THREE.Vector3) {
		const c = Math.cos(this.yaw),
			sn = Math.sin(this.yaw);
		return out.set(q.x * c + q.z * sn, q.y, -q.x * sn + q.z * c);
	}

	/** Up off the perch: steeply, beating hard, out and up toward the ring. */
	private takeOff(cr: Creature) {
		const r = this.r;
		const q = this.toAir(cr.pos, new THREE.Vector3());
		const rq = Math.hypot(q.x, q.z);
		const ox = rq > 1e-3 ? q.x / rq : 0,
			oz = rq > 1e-3 ? q.z / rq : 1;
		const ah = cr.yaw - this.yaw;
		cr.home = cr.site;
		cr.wheel = {
			q,
			// a leap: up, and out, and on the way it was facing
			w: new THREE.Vector3(ox * 1.3 + Math.sin(ah) * 1.1, 3.2, oz * 1.3 + Math.cos(ah) * 1.1),
			ah,
			// about the heads of the trees, out beyond the cypresses
			r: lerp(this.h.ring.r[0], this.h.ring.r[1], r()),
			h: lerp(this.h.ring.h[0], this.h.ring.h[1], r()),
			ph: r() * Math.PI * 2,
			off: (r() - 0.5) * 1.1,
			v: lerp(4.6, 5.6, r()),
			t: 0,
			stay: lerp(3.5, 6.5, r()),
			calm: 0,
			linger: lerp(0.4, 2.6, r())
		};
		cr.state = 'wheel';
		cr.goIn = -1;
		cr.act = 'idle';
		cr.hop = false;
		cr.hopTo = null;
		cr.beating = true;
		cr.wT = lerp(0.9, 1.4, r());
	}

	/**
	 * Going round. It is steered, not laid out: it makes for a point a
	 * little ahead of it on its ring, turning and speeding up only as fast
	 * as a bird can, and banks into the turn. Its ring breathes, wider and
	 * narrower, higher and lower, on slow swells of its own; and the flock
	 * draws together as it goes, those behind their place in it pressing
	 * on, those ahead easing off. Once the island has been still a while it
	 * waits for its perch to come round ahead, and drops out onto it.
	 */
	private wheelOn(cr: Creature, dt: number, time: number) {
		const W = cr.wheel!;
		const F = this.flock;
		W.t += dt;
		W.calm = this.spinning ? 0 : W.calm + dt;
		const q = W.q,
			w = W.w;
		const th = Math.atan2(q.z, q.x);
		const R = W.r + Math.sin(time * 0.37 + W.ph) * 0.45;
		const H = W.h + Math.sin(time * 0.29 + W.ph * 1.7) * 0.3;
		const phi = th + F.dir * 0.42;
		const behind = wrap(F.phi + W.off - th) * F.dir;
		const v = W.v * (1 + clamp(behind * 0.5, -0.25, 0.45));
		const steer = this.tmp.set(R * Math.cos(phi) - q.x, H - q.y, R * Math.sin(phi) - q.z);
		steer.setLength(v).sub(w);
		const most = 9 * dt;
		if (steer.lengthSq() > most * most) steer.setLength(most);
		w.add(steer);
		// never into the building, nor through a crown: out and up from
		// anything just ahead of it
		const ahead = this.tmp.copy(q).addScaledVector(w, 0.45);
		for (const t of this.h.trees) {
			const c = this.toAir(t.crown, this.tmp2);
			const dx = ahead.x - c.x,
				dy = ahead.y - c.y,
				dz = ahead.z - c.z;
			const d = Math.hypot(dx, dy, dz),
				rr = t.crownR * 0.85 + 0.5;
			if (d < rr && d > 1e-3) {
				w.x += (dx / d) * 12 * dt;
				w.y += (dy / d + 0.6) * 12 * dt;
				w.z += (dz / d) * 12 * dt;
			}
		}
		if (this.inBuilding(this.fromAir(ahead, this.tmp), 0.3)) {
			const rq = Math.max(Math.hypot(q.x, q.z), 1e-3);
			w.x += (q.x / rq) * 14 * dt;
			w.z += (q.z / rq) * 14 * dt;
			w.y += 10 * dt;
		}
		q.addScaledVector(w, dt);
		// facing the way it goes, turned into it a moment behind (slower
		// while it is still lifting off), and leaning into the turn as far as
		// its speed and the turn's tightness ask
		const hv = Math.hypot(w.x, w.z);
		const was = W.ah;
		const up = smoothstep(0, 0.6, W.t);
		if (hv > 0.3) W.ah += wrap(Math.atan2(w.x, w.z) - W.ah) * (1 - Math.exp(-lerp(4, 10, up) * dt));
		const turn = (W.ah - was) / Math.max(dt, 1e-3);
		const lean = clamp(-Math.atan((hv * turn) / 9.8) * 1.05, -0.6, 0.6);
		cr.bank = damp(cr.bank, lean * up, 5, dt);
		const prev = this.tmp2.copy(cr.pos);
		this.fromAir(q, cr.pos);
		cr.vel.subVectors(cr.pos, prev).divideScalar(Math.max(dt, 1e-3));
		cr.yaw = W.ah + this.yaw;
		cr.pose = damp(cr.pose, 0, 7, dt);
		if (W.t < W.stay || W.calm < W.linger) return;
		// down: to where it was, if that is still there and free
		const home = cr.home;
		const to =
			home && this.standing(home) && !(home.kind === 'point' && this.crowded(home.p, cr))
				? home
				: this.pickSite(cr);
		const hq = this.toAir(this.sitePos(to, this.tmp), this.tmp);
		const lead = wrap(Math.atan2(hq.z, hq.x) - th) * F.dir;
		if (Math.hypot(hq.x, hq.z) < 3 || (lead > 0.25 && lead < 2.3) || W.calm > W.linger + 9) {
			cr.home = null;
			this.fly(cr, to, 0);
		}
	}

	/** A tree is grabbed: everyone on it is off, some to the building. */
	pressed(t: TreeHandles) {
		const onIt = this.c.filter(
			(cr) => cr.state !== 'wheel' && cr.site?.kind === 'twig' && cr.site.tree === t
		);
		if (!onIt.length) return;
		const others = this.h.trees.filter((o) => o !== t && !this.partyTree.includes(o));
		const next =
			others[Math.floor(this.r() * others.length)] ?? this.h.trees.find((o) => o !== t) ?? null;
		for (const cr of onIt) {
			if (this.partyTree[cr.party] === t) this.partyTree[cr.party] = next;
			const toBuilding = this.r() < 0.33;
			const ref = this.h.refuge;
			const group = this.r() < 0.6 ? ref[0] : ref[1 % ref.length];
			const site: Site = toBuilding
				? { kind: 'point', p: this.pointSites(group), group }
				: this.pickSite(cr, next ?? undefined);
			this.fly(cr, site, this.r() * 0.25);
		}
	}

	private migrate() {
		const party = this.r() < 0.5 ? 0 : 1;
		const trees = this.h.trees.filter((t) => !this.partyTree.includes(t));
		if (!trees.length) return;
		const next = trees[Math.floor(this.r() * trees.length)];
		this.partyTree[party] = next;
		for (const cr of this.c)
			if (cr.party === party && cr.state === 'perch' && cr.site?.kind === 'twig')
				this.fly(cr, this.pickSite(cr, next), this.r() * 0.6);
	}

	/** where the fireflies are and how bright, for the light they give */
	get fireflies() {
		return { pos: this.flyWorld, glow: this.flyGlow };
	}

	// ── on the perch ──────────────────────────────────────────────────────
	/**
	 * A bird at rest is never still. Its eyes go from one thing to the next
	 * in jumps, the head turned and held and turned again; it comes round in
	 * little shuffles, the head first; and every few seconds it takes up
	 * something: it walks off along the ledge with the pigeon's nod (the head
	 * held still in the air while the body goes on under it, then thrust on),
	 * hops to the next twig or round where it stands, pecks at the stone,
	 * preens, shakes out its wings, or bows and turns about, cooing.
	 */
	private perched(cr: Creature, dt: number) {
		const site = cr.site!;
		const r = this.r;
		cr.actT += dt;
		// where the eyes go, unless what it is doing says otherwise
		cr.lookT -= dt;
		if (cr.lookT < 0) {
			cr.lookT = lerp(0.25, 2.4, r() * r());
			cr.lookY = (r() - 0.5) * (r() < 0.35 ? 2.6 : 1.1);
			cr.lookP = lerp(-0.3, 0.25, r());
		}
		let hy = cr.lookY,
			hp = cr.lookP,
			hz = 0,
			lean = 0.28,
			bob = 0,
			roll = 0,
			flap = 0,
			fold = 1;
		const done = () => {
			cr.act = 'idle';
			cr.actT = 0;
			cr.timer = lerp(0.5, 2.6, r());
		};

		switch (cr.act) {
			case 'idle':
				cr.timer -= dt;
				if (cr.timer < 0) this.choose(cr);
				break;
			case 'walk': {
				if (site.kind !== 'point') {
					done();
					break;
				}
				const p = site.p;
				const d = this.tmp.subVectors(cr.walkTo, p);
				const left = d.length();
				if (left < 0.015 || cr.actT > 7) {
					done();
					break;
				}
				cr.yawTo = cr.yaw + wrap(Math.atan2(d.x, d.z) - cr.yaw);
				hy = 0;
				hp = 0.1;
				// round to face the way first, then off
				if (Math.abs(cr.yawTo - cr.yaw) > 0.5) break;
				cr.gait += dt * 3.4;
				p.addScaledVector(d, Math.min(1, (0.24 * dt) / left));
				this.h.settle?.(site.group, p);
				// the head thrust forward in the first part of each step, then
				// held where it is in the air while the body walks up under it
				const s = cr.gait % 1;
				hz =
					s < 0.3 ? lerp(-0.07, 0.07, smoothstep(0, 0.3, s)) : lerp(0.07, -0.07, (s - 0.3) / 0.7);
				bob = 0.006 * Math.sin(Math.PI * s);
				roll = 0.06 * Math.sin(Math.PI * cr.gait);
				lean = 0.14;
				break;
			}
			case 'hop': {
				const to = cr.hopTo;
				if (!to || !this.standing(to)) {
					done();
					break;
				}
				// a crouch, facing the way, and off
				const end = this.sitePos(to, this.tmp);
				const face = cr.yaw + wrap(Math.atan2(end.x - cr.pos.x, end.z - cr.pos.z) - cr.yaw);
				cr.yawTo = face;
				hy = clamp(face - cr.yaw, -1, 1);
				hp = 0.15;
				lean = 0.18;
				bob = -0.008 * smoothstep(0, 0.2, cr.actT);
				if (cr.actT > 0.22 && Math.abs(face - cr.yaw) < 0.6) this.hop(cr, to, face);
				else if (cr.actT > 2) done();
				break;
			}
			case 'peck': {
				const T = 0.46;
				if (cr.actT >= T * cr.count) {
					done();
					break;
				}
				// down fast, a moment there, and back up
				const u = (cr.actT % T) / T;
				const dip = u < 0.2 ? smoothstep(0, 0.2, u) : 1 - smoothstep(0.32, 0.62, u);
				hy = cr.lookY * 0.25;
				hp = lerp(0.15, 1.05, dip);
				hz = 0.05 * dip;
				lean = lerp(0.22, 0.04, dip);
				break;
			}
			case 'preen': {
				const t = cr.actT;
				if (t > cr.actLen) {
					done();
					break;
				}
				// halfway, as often as not, round to the other side
				if (cr.count === 1 && t > cr.actLen / 2) {
					cr.count = 0;
					if (r() < 0.5) cr.side = -cr.side;
				}
				hy = cr.side * 2.2 + 0.1 * Math.sin(t * 13);
				hp = 0.28 + 0.14 * Math.sin(t * 19 + 1);
				hz = 0.03 * Math.sin(t * 23);
				const e = smoothstep(0, 0.3, t) * (1 - smoothstep(cr.actLen - 0.3, cr.actLen, t));
				fold = 1 - 0.14 * e;
				flap = 0.5 * e;
				break;
			}
			case 'flutter': {
				if (cr.actT > cr.actLen) {
					done();
					break;
				}
				// up on its toes, and the wings shaken out and put away
				const e = Math.sin((Math.PI * cr.actT) / cr.actLen);
				fold = 1 - 0.92 * e;
				flap = e * (0.3 + 0.55 * Math.sin(cr.actT * Math.PI * 2 * 7));
				lean = 0.34;
				hy = 0;
				hp = -0.1;
				bob = 0.012 * e;
				break;
			}
			case 'coo': {
				if (cr.actT > cr.actLen) {
					done();
					break;
				}
				// bowing, and turning about as it bows
				const w = Math.sin(cr.actT * Math.PI * 2 * 1.6);
				hy = 0;
				hp = 0.3 + 0.35 * w;
				hz = -0.03 + 0.03 * w;
				lean = 0.2 + 0.1 * w;
				cr.yawTo += dt * 1.1 * cr.side;
				break;
			}
		}
		if (cr.state !== 'perch') return;

		// coming round: in little shuffles, a step at a time, the head first
		const diff = cr.yawTo - cr.yaw;
		if (Math.abs(diff) > 0.03) {
			cr.stepT -= dt;
			if (cr.stepT < 0) {
				cr.stepT = 0.14;
				cr.yawStep = cr.yaw + clamp(diff, -0.5, 0.5);
			}
			if (cr.act === 'idle') hy = clamp(diff * 1.2, -1.2, 1.2);
			if (cr.act !== 'walk') bob += 0.007 * Math.sin((Math.PI * Math.max(cr.stepT, 0)) / 0.14);
		}
		cr.yaw = damp(cr.yaw, cr.yawStep, 24, dt);
		// the eyes jump; the rest follows more easily
		cr.hy = damp(cr.hy, hy, 26, dt);
		cr.hp = damp(cr.hp, hp, 26, dt);
		cr.hz = damp(cr.hz, hz, 40, dt);
		cr.lean = damp(cr.lean, lean, 10, dt);
		cr.roll = damp(cr.roll, roll, 14, dt);
		cr.bob = bob;
		cr.wf = flap;
		cr.wo = fold;
	}

	/** Something to do, by where it is standing. */
	private choose(cr: Creature) {
		const s = cr.site!;
		const r = this.r;
		cr.actT = 0;
		cr.act = 'idle';
		cr.timer = lerp(0.6, 2.8, r());
		const ledge = s.kind === 'point' && this.h.walks.includes(s.group);
		const twig = s.kind === 'twig';
		// how likely each is: walk, hop, peck, preen, flutter, coo, turn, rest, off
		const w = ledge
			? [0.3, 0.12, 0.15, 0.09, 0.05, 0.05, 0.14, 0.06, 0.04]
			: twig
				? [0, 0.26, 0.08, 0.12, 0.06, 0.04, 0.16, 0.1, 0.18]
				: [0, 0, 0, 0.2, 0.08, 0.08, 0.3, 0.22, 0.12];
		let roll = r() * w.reduce((a, b) => a + b, 0),
			k = 0;
		while (k < w.length - 1 && roll >= w[k]) roll -= w[k++];
		const turn = () => {
			const aim = this.face(cr) - cr.yaw;
			const by =
				Math.abs(aim) > 0.4 && r() < 0.6 ? aim : (r() < 0.5 ? -1 : 1) * lerp(0.5, 2.6, r());
			// as often as not with a jump, where there is room to land
			if ((ledge || twig) && r() < 0.4) this.hop(cr, s, cr.yaw + by);
			else cr.yawTo = cr.yaw + by;
		};
		switch (k) {
			case 0: {
				const q = s.kind === 'point' ? this.along(s, 0.15, 0.7, cr) : null;
				if (!q) return turn();
				cr.act = 'walk';
				cr.walkTo.copy(q);
				cr.gait = 0;
				return;
			}
			case 1: {
				const to = s.kind === 'point' ? this.along(s, 0.25, 0.9, cr) : this.nearTwig(cr);
				if (!to) return turn();
				cr.act = 'hop';
				cr.hopTo =
					to instanceof THREE.Vector3
						? { kind: 'point', p: to, group: (s as PointSite).group }
						: to;
				return;
			}
			case 2:
				cr.act = 'peck';
				cr.count = 1 + Math.floor(r() * 3);
				return;
			case 3:
				cr.act = 'preen';
				cr.actLen = lerp(1.2, 3, r());
				cr.side = r() < 0.5 ? -1 : 1;
				cr.count = 1;
				return;
			case 4:
				cr.act = 'flutter';
				cr.actLen = lerp(0.5, 0.8, r());
				return;
			case 5:
				cr.act = 'coo';
				cr.actLen = lerp(1.4, 2.6, r());
				cr.side = r() < 0.5 ? -1 : 1;
				return;
			case 6:
				return turn();
			case 7:
				return;
			default:
				// off: most often to another twig of the same tree
				this.fly(cr, this.pickSite(cr, twig && r() < 0.65 ? s.tree : undefined));
		}
	}

	// ── a frame ───────────────────────────────────────────────────────────
	update(dt: number, visible: boolean, yaw = 0, spinning = false) {
		this.yaw = yaw;
		this.spinning = spinning;
		this.flyGroup.rotation.y = yaw;
		this.day = damp(this.day, this.dayTo, 2.2, dt);
		this.group.visible = visible && this.started;
		if (!this.started) return;
		const reduced = this.h.reduced;
		this.migrateT -= dt;
		if (this.migrateT < 0) {
			this.migrateT = lerp(16, 28, this.r());
			if (!reduced) this.migrate();
		}
		const night = 1 - this.day;
		const time = U.uTime.value;
		const wing = this.wingAttr.array as Float32Array;
		const head = this.headAttr.array as Float32Array;
		const fwd = new THREE.Vector3(),
			upv = new THREE.Vector3(0, 1, 0),
			right = new THREE.Vector3();

		let anyBird = false;
		// the middle of the flock goes round at the pace of a bird on the ring
		if (this.c.some((cr) => cr.state === 'wheel')) this.flock.phi += this.flock.dir * 0.69 * dt;
		for (const cr of this.c) {
			if (cr.state === 'perch' && cr.goIn >= 0) {
				cr.goIn -= dt;
				if (cr.goIn < 0) this.takeOff(cr);
			}
			if (cr.state === 'fly') {
				cr.ft += dt;
				if (cr.ft < 0) {
					// waiting its turn: out of sight, or riding its perch until it goes
					if (cr.site && cr.from.y > -100) {
						/* keep where it is */
					}
				} else {
					cr.arriving = false;
					const t = Math.min(1, cr.ft / cr.fdur);
					const prev = this.tmp.copy(cr.pos);
					this.bezier(cr, t, cr.pos);
					cr.vel.subVectors(cr.pos, prev).divideScalar(Math.max(dt, 1e-3));
					const away = cr.site?.kind === 'point' && cr.site.group === 'away';
					if (cr.hop) {
						// barely off its feet, and round on the way
						cr.yaw = lerp(cr.yawFrom, cr.yawTo, smoothstep(0, 1, t));
						cr.pose = 1 - 0.4 * Math.sin(Math.PI * t);
					} else {
						// turned toward the way it goes a moment behind, never
						// snapped round, and leaning into the turn
						const hv = Math.hypot(cr.vel.x, cr.vel.z);
						const was = cr.yaw;
						if (hv > 0.2)
							cr.yaw += wrap(Math.atan2(cr.vel.x, cr.vel.z) - cr.yaw) * (1 - Math.exp(-12 * dt));
						const turn = (cr.yaw - was) / Math.max(dt, 1e-3);
						const lean = clamp(-Math.atan((hv * turn) / 9.8) * 1.05, -0.6, 0.6);
						cr.bank = damp(cr.bank, lean * (1 - cr.pose), 6, dt);
						// the last third of a second: reach for the branch. Off it,
						// the body comes out of its perch over a moment.
						const left = (1 - t) * cr.fdur;
						const pose = away ? 0 : smoothstep(0.45, 0.0, left);
						cr.pose = pose > cr.pose ? pose : damp(cr.pose, pose, 8, dt);
					}
					if (t >= 1 && away) {
						cr.state = 'away';
						cr.site = null;
					} else if (t >= 1) {
						cr.state = 'perch';
						cr.bank = 0;
						cr.act = 'idle';
						cr.actT = 0;
						if (cr.hop) {
							cr.hop = false;
							cr.timer = lerp(0.4, 2, this.r());
							cr.yawTo = cr.yaw;
						} else {
							cr.timer = lerp(1, 4, this.r());
							cr.yawTo = this.face(cr);
						}
						cr.yawStep = cr.yaw;
						cr.stepT = 0;
					}
				}
			} else if (cr.state === 'wheel' && cr.wheel) {
				this.wheelOn(cr, dt, time);
			} else if (cr.state === 'perch' && cr.site) {
				cr.pose = damp(cr.pose, 1, 6, dt);
				cr.vel.set(0, 0, 0);
				if (!this.standing(cr.site)) {
					// the twig went out from under it
					this.fly(cr, this.pickSite(cr), 0);
				} else if (!reduced) this.perched(cr, dt);
				if (cr.state === 'perch') this.sitePos(cr.site, cr.pos);
			}
			if (cr.state !== 'perch') {
				// in the air the head is held straight, and the body steady
				cr.hy = damp(cr.hy, 0, 12, dt);
				cr.hp = damp(cr.hp, 0, 12, dt);
				cr.hz = 0;
				cr.lean = damp(cr.lean, 0.28, 8, dt);
				cr.roll = cr.state === 'away' ? 0 : cr.bank;
				cr.bob = 0;
			}
			head[cr.id * 3] = cr.hy;
			head[cr.id * 3 + 1] = cr.hp;
			head[cr.id * 3 + 2] = cr.hz;

			// Wings. A run of steady strokes, three to six, then a glide on
			// them held up in a shallow V, and strokes again: longer runs and
			// quicker ones going up, glides coming down. It eases into a run
			// and out of it, never switched from one to the other.
			const flying = 1 - cr.pose;
			cr.phase += dt;
			const aloft = cr.state === 'wheel' || (cr.state === 'fly' && !cr.hop && cr.ft >= 0);
			if (aloft) {
				const climbing = cr.vel.y > 0.8;
				cr.wT -= dt;
				if (cr.wT < 0) {
					cr.beating = !cr.beating || climbing;
					cr.wT = cr.beating ? lerp(3, 6, this.r()) / 6 : lerp(0.7, 2, this.r());
				} else if (climbing && !cr.beating) {
					cr.beating = true;
					cr.wT = lerp(0.5, 0.9, this.r());
				}
				const up = cr.wheel && cr.wheel.t < 1.2;
				cr.wp += Math.PI * 2 * (up ? 7 : lerp(5.4, 6.4, cr.tone)) * dt;
			}
			cr.amp = damp(cr.amp, aloft && cr.beating ? 1 : 0, 9, dt);
			let flap = lerp(0.3, 0.12 + Math.sin(cr.wp) * 0.85, cr.amp);
			let fold = 0;
			// landing: wings up into the brake, then down onto the back
			const brake = smoothstep(0.0, 0.5, cr.pose) * (1 - smoothstep(0.6, 1.0, cr.pose));
			flap = lerp(flap, 0.7, brake);
			fold = lerp(fold, 0, brake);
			flap = lerp(flap, 0, cr.pose);
			fold = lerp(fold, 1, smoothstep(0.7, 1.0, cr.pose));
			if (cr.state === 'away' || (cr.state === 'fly' && cr.ft < 0)) {
				flap = 0;
				fold = 1;
			}
			flap *= flying > 0.02 ? 1 : 0;
			if (cr.hop && cr.state === 'fly') {
				// half open, and a beat or two
				const e = Math.sin(Math.PI * clamp(cr.ft / cr.fdur, 0, 1));
				fold = 1 - 0.9 * e;
				flap = e * (0.3 + 0.6 * Math.sin(cr.phase * Math.PI * 2 * 12));
			} else if (cr.state === 'perch') {
				flap = cr.wf;
				fold = cr.wo;
			}
			wing[cr.id * 2] = flap;
			wing[cr.id * 2 + 1] = fold;

			// the body: along its heading in the air, leaning back on a branch
			fwd.set(Math.sin(cr.yaw), 0, Math.cos(cr.yaw));
			const climb =
				cr.state === 'fly' || cr.state === 'wheel' ? clamp(cr.vel.y / 6, -0.5, 0.65) : 0;
			fwd.y = lerp(climb, cr.lean, cr.pose);
			fwd.normalize();
			right.crossVectors(upv, fwd).normalize();
			const up2 = this.tmp2.crossVectors(fwd, right).normalize();
			if (cr.roll !== 0) {
				// the waddle: side to side on each step
				const cs = Math.cos(cr.roll),
					sn = Math.sin(cr.roll);
				const was = this.tmp.copy(right);
				right.multiplyScalar(cs).addScaledVector(up2, sn);
				up2.multiplyScalar(cs).addScaledVector(was, -sn);
			}
			this.m.makeBasis(right, up2, fwd);
			const hidden = cr.state === 'away' || cr.arriving || cr.pos.y < -20;
			const s = hidden ? 0 : cr.size;
			if (!hidden) anyBird = true;
			this.m.scale(this.tmp.set(s, s, s));
			this.m.setPosition(cr.pos.x, cr.pos.y + 0.04 * cr.pose + cr.bob, cr.pos.z);
			this.birds.setMatrixAt(cr.id, this.m);
		}
		// The fireflies: each wanders a patch of air on slow sines, and now
		// and then drifts off to another patch nearby; and each flashes on
		// its own clock, a slow swell and fade, dark most of the time.
		// and the fireflies come out once the island has arrived
		const on = smoothstep(0.1, 0.9, night) * this.h.arrive;
		for (let i = 0; i < (this.h.flyHome ? this.ff.length : 0); i++) {
			const f = this.ff[i];
			const k = i * 3;
			if (!reduced) {
				f.move -= dt;
				if (f.move < 0) {
					f.move = lerp(5, 14, this.r());
					f.to.copy(this.flyHome(f.home));
				}
				f.home.x = damp(f.home.x, f.to.x, 0.35, dt);
				f.home.y = damp(f.home.y, f.to.y, 0.35, dt);
				f.home.z = damp(f.home.z, f.to.z, 0.35, dt);
			}
			const t = reduced ? f.ph : time + f.ph;
			this.flyPos[k] = f.home.x + Math.sin(t * 0.31) * 0.5 + Math.sin(t * 0.73 + 1.3) * 0.22;
			this.flyPos[k + 1] = f.home.y + Math.sin(t * 0.47 + 0.4) * 0.2 + Math.sin(t * 1.1) * 0.07;
			this.flyPos[k + 2] = f.home.z + Math.cos(t * 0.37 + 2.1) * 0.5 + Math.sin(t * 0.61) * 0.22;
			let b = 0;
			if (f.flash >= 0) {
				f.flash += dt;
				const u = f.flash / f.len;
				if (u >= 1) {
					f.flash = -1;
					f.wait = lerp(0.6, 3, this.r());
				} else b = Math.pow(Math.sin(Math.PI * u), 2);
			} else {
				f.wait -= dt;
				if (f.wait < 0) {
					f.flash = 0;
					f.len = lerp(0.6, 1.3, this.r());
				}
			}
			this.flyGlow[i] = (reduced ? 0.45 : 0.22 + 0.78 * b) * on;
		}
		// where the fireflies really are, turned with the air, for their light
		const cy = Math.cos(yaw),
			sy = Math.sin(yaw);
		for (let i = 0; i < this.n; i++) {
			const x = this.flyPos[i * 3],
				z = this.flyPos[i * 3 + 2];
			this.flyWorld[i * 3] = x * cy + z * sy;
			this.flyWorld[i * 3 + 1] = this.flyPos[i * 3 + 1];
			this.flyWorld[i * 3 + 2] = -x * sy + z * cy;
		}
		this.birds.instanceMatrix.needsUpdate = true;
		this.wingAttr.needsUpdate = true;
		this.headAttr.needsUpdate = true;
		(this.flies.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
		(this.flies.geometry.getAttribute('aGlow') as THREE.BufferAttribute).needsUpdate = true;
		// in the picture's own pixels, which are not the canvas's
		const H = this.h.pxH;
		const fov = THREE.MathUtils.degToRad(this.h.camera.fov);
		const fu = (this.flies.material as THREE.ShaderMaterial).uniforms;
		fu.uScale.value = (0.55 * H) / (2 * Math.tan(fov / 2));
		fu.uDpr.value = this.h.dpr;
		this.flies.visible = night > 0.02 && !!this.h.flyHome;
		this.birds.visible = anyBird;
	}
}
