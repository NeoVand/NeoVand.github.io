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
// small backward lean of a bird on a branch. The flight is a bounding one,
// a burst of flapping and then the wings shut while it arcs, which is what a
// small bird actually does. A perched bird is drawn from its twig, through
// the same wind field that bends the twig, so the two move as one.

type Site =
	| { kind: 'twig'; tree: TreeHandles; i: number }
	| { kind: 'point'; p: THREE.Vector3; group: string };

interface Creature {
	id: number;
	party: number;
	state: 'away' | 'perch' | 'fly';
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
}

const N = 24;

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
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
`;

export class Air {
	group = new THREE.Group();
	private grove: Grove;
	private birds: THREE.InstancedMesh;
	private wingAttr: THREE.InstancedBufferAttribute;
	private flies: THREE.Points;
	private flyPos: Float32Array;
	private flyGlow: Float32Array;
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

	constructor(grove: Grove) {
		this.grove = grove;
		this.day = this.dayTo = U.uNight.value < 0.5 ? 1 : 0;
		const geo = birdGeometry();
		this.wingAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
		this.wingAttr.setUsage(THREE.DynamicDrawUsage);
		geo.setAttribute('iWing', this.wingAttr);
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
		this.group.add(this.birds, this.flies);

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
				arriving: false
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

	/**
	 * Somewhere a firefly might be: mostly low over the lawn and among the
	 * shrubs by the wall, some up in the lower crowns; never in the rotunda's
	 * walls, and never out over the edge.
	 */
	private flyHome(near?: THREE.Vector3) {
		const p = new THREE.Vector3();
		for (let k = 0; k < 20; k++) {
			if (near) {
				p.set(near.x + (this.r() - 0.5) * 2.4, 0, near.z + (this.r() - 0.5) * 2.4);
				p.y = clamp(near.y + (this.r() - 0.5) * 0.8, 0.25, 3.6);
			} else {
				const a = this.r() * Math.PI * 2,
					rad = lerp(2.9, 6.2, Math.sqrt(this.r()));
				const high = this.r() < 0.25;
				p.set(
					Math.sin(a) * rad,
					high ? lerp(1.8, 3.6, this.r()) : lerp(0.25, 1.5, this.r()),
					Math.cos(a) * rad
				);
			}
			const rh = Math.hypot(p.x, p.z);
			if (rh > 2.9 && rh < 6.2) return p;
		}
		return p.set(0, 0.8, 4.2);
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
		const g = this.grove;
		const r = this.r;
		if (group === 'roof') {
			const { r: R, y, h } = g.pavilion.dome;
			const lat = lerp(0.35, 1.2, r()),
				az = lerp(-1.3, 1.3, r());
			return new THREE.Vector3(
				Math.cos(lat) * R * Math.sin(az),
				y + Math.sin(lat) * h + 0.02,
				Math.cos(lat) * R * Math.cos(az)
			);
		}
		if (group === 'crown') return g.pavilion.crown.clone().setY(g.pavilion.crown.y + 0.06);
		if (group === 'sill') {
			const [a, b] = g.pavilion.sills[Math.floor(r() * g.pavilion.sills.length)];
			return a.clone().lerp(b, r());
		}
		if (group === 'rim') {
			const rim = g.island.rim;
			// the near side, where it is seen
			const cand = rim.filter((p) => p.z > 1);
			return cand[Math.floor(r() * cand.length)].clone();
		}
		if (group === 'horn') {
			const gr = g.gramophone;
			return gr.group.localToWorld(gr.rim.clone().add(new THREE.Vector3(0, -0.02, 0)));
		}
		return new THREE.Vector3();
	}

	private pickSite(cr: Creature, prefer?: TreeHandles | null): Site {
		const r = this.r();
		const trees = this.grove.trees;
		const tree = prefer ?? this.partyTree[cr.party] ?? trees[Math.floor(this.r() * trees.length)];
		if (prefer === undefined && r < 0.22) {
			const groups = ['roof', 'roof', 'sill', 'rim', 'crown', 'horn'];
			const gname = groups[Math.floor(this.r() * groups.length)];
			if (
				gname !== 'crown' ||
				!this.c.some((o) => o.site?.kind === 'point' && o.site.group === 'crown')
			)
				return { kind: 'point', p: this.pointSites(gname), group: gname };
		}
		const twigs = this.twigsOf(tree);
		// a tree still coming up: wait on the building instead
		if (!twigs.length) return { kind: 'point', p: this.pointSites('roof'), group: 'roof' };
		return { kind: 'twig', tree, i: twigs[Math.floor(this.r() * twigs.length)] };
	}

	// ── flights ───────────────────────────────────────────────────────────
	private fly(cr: Creature, to: Site, delay = 0) {
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
		cr.ft = -delay;
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
		const cam = this.grove.camera;
		const side = this.r() < 0.5 ? -1 : 1;
		out.set(side * lerp(12, 18, this.r()), lerp(9, 14, this.r()), lerp(-8, 6, this.r()));
		// keep it on the far side of the camera's frame
		out.x += cam.position.x * 0.2;
		return out;
	}

	begin() {
		this.started = true;
		const trees = this.grove.trees;
		const shuffled = [...trees].sort(() => this.r() - 0.5);
		this.partyTree = [shuffled[0] ?? null, shuffled[1] ?? null];
		for (const cr of this.c) {
			this.offstage(cr.pos);
			const site = this.pickSite(cr);
			const delay = this.grove.reduced ? 0 : lerp(2.6, 7.5, this.r());
			if (this.grove.reduced) {
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

	setDay(day: boolean) {
		this.dayTo = day ? 1 : 0;
	}

	/** A tree is grabbed: everyone on it is off, some to the building. */
	pressed(t: TreeHandles) {
		const onIt = this.c.filter((cr) => cr.site?.kind === 'twig' && cr.site.tree === t);
		if (!onIt.length) return;
		const others = this.grove.trees.filter((o) => o !== t && !this.partyTree.includes(o));
		const next =
			others[Math.floor(this.r() * others.length)] ?? this.grove.trees.find((o) => o !== t)!;
		for (const cr of onIt) {
			if (this.partyTree[cr.party] === t) this.partyTree[cr.party] = next;
			const toBuilding = this.r() < 0.33;
			const site: Site = toBuilding
				? { kind: 'point', p: this.pointSites(this.r() < 0.6 ? 'roof' : 'sill'), group: 'roof' }
				: this.pickSite(cr, next);
			this.fly(cr, site, this.r() * 0.25);
		}
	}

	private migrate() {
		const party = this.r() < 0.5 ? 0 : 1;
		const trees = this.grove.trees.filter((t) => !this.partyTree.includes(t));
		if (!trees.length) return;
		const next = trees[Math.floor(this.r() * trees.length)];
		this.partyTree[party] = next;
		for (const cr of this.c)
			if (cr.party === party && cr.state === 'perch' && cr.site?.kind === 'twig')
				this.fly(cr, this.pickSite(cr, next), this.r() * 0.6);
	}

	/** where the fireflies are and how bright, for the light they give */
	get fireflies() {
		return { pos: this.flyPos, glow: this.flyGlow };
	}

	// ── a frame ───────────────────────────────────────────────────────────
	update(dt: number, visible: boolean) {
		this.day = damp(this.day, this.dayTo, 2.2, dt);
		this.group.visible = visible && this.started;
		if (!this.started) return;
		const reduced = this.grove.reduced;
		this.migrateT -= dt;
		if (this.migrateT < 0) {
			this.migrateT = lerp(16, 28, this.r());
			if (!reduced) this.migrate();
		}
		const night = 1 - this.day;
		const time = U.uTime.value;
		const wing = this.wingAttr.array as Float32Array;
		const fwd = new THREE.Vector3(),
			upv = new THREE.Vector3(0, 1, 0),
			right = new THREE.Vector3();

		for (const cr of this.c) {
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
					if (cr.vel.lengthSq() > 1e-4) cr.yaw = Math.atan2(cr.vel.x, cr.vel.z);
					// the last third of a second: reach for the branch
					const left = (1 - t) * cr.fdur;
					cr.pose = smoothstep(0.45, 0.0, left);
					if (t >= 1) {
						cr.state = 'perch';
						cr.timer = lerp(2.5, 9, this.r());
						cr.yawTo = cr.yaw + (this.r() - 0.5) * 1.2;
					}
				}
			} else if (cr.state === 'perch' && cr.site) {
				this.sitePos(cr.site, cr.pos);
				cr.pose = damp(cr.pose, 1, 6, dt);
				cr.vel.set(0, 0, 0);
				cr.timer -= dt;
				if (!this.standing(cr.site)) {
					// the twig went out from under it
					this.fly(cr, this.pickSite(cr), 0);
				} else if (cr.timer < 0 && !reduced) {
					const roll = this.r();
					if (roll < 0.55) {
						// look the other way
						cr.yawTo = cr.yaw + (this.r() < 0.5 ? -1 : 1) * lerp(0.6, 2.4, this.r());
						cr.timer = lerp(1.5, 6, this.r());
					} else if (roll < 0.9) {
						// the next twig along
						const tree = cr.site.kind === 'twig' ? cr.site.tree : null;
						this.fly(cr, this.pickSite(cr, tree ?? undefined));
					} else {
						this.fly(cr, this.pickSite(cr));
					}
				}
				cr.yaw = damp(cr.yaw, cr.yawTo, 7, dt);
			}

			// wings: a burst of beats, then shut while it arcs
			const flying = 1 - cr.pose;
			cr.phase += dt;
			const cycle = cr.phase % 0.62;
			const burst = cycle < 0.36 ? 1 : 0;
			const beat = Math.sin(cr.phase * Math.PI * 2 * 11) * 0.95;
			const glide = -0.1;
			let flap = burst ? beat : glide;
			let fold = burst ? 0 : 0.75;
			// landing: wings up into the brake, then down onto the back
			const brake = smoothstep(0.0, 0.5, cr.pose) * (1 - smoothstep(0.6, 1.0, cr.pose));
			flap = lerp(flap, 0.7, brake);
			fold = lerp(fold, 0, brake);
			flap = lerp(flap, 0, cr.pose);
			fold = lerp(fold, 1, smoothstep(0.7, 1.0, cr.pose));
			if (cr.state === 'away' || cr.ft < 0) {
				flap = 0;
				fold = 1;
			}
			wing[cr.id * 2] = flap * (flying > 0.02 ? 1 : 0);
			wing[cr.id * 2 + 1] = fold;

			// the body: along its heading in the air, leaning back on a branch
			fwd.set(Math.sin(cr.yaw), 0, Math.cos(cr.yaw));
			const climb = cr.state === 'fly' ? clamp(cr.vel.y / 6, -0.5, 0.5) : 0;
			fwd.y = lerp(climb, 0.28, cr.pose);
			fwd.normalize();
			right.crossVectors(upv, fwd).normalize();
			const up2 = this.tmp2.crossVectors(fwd, right).normalize();
			this.m.makeBasis(right, up2, fwd);
			const hidden = cr.state === 'away' || cr.arriving || cr.pos.y < -20;
			const s = hidden ? 0 : cr.size * smoothstep(0.05, 0.6, this.day);
			this.m.scale(this.tmp.set(s, s, s));
			this.m.setPosition(cr.pos.x, cr.pos.y + 0.04 * cr.pose, cr.pos.z);
			this.birds.setMatrixAt(cr.id, this.m);
		}
		// The fireflies: each wanders a patch of air on slow sines, and now
		// and then drifts off to another patch nearby; and each flashes on
		// its own clock, a slow swell and fade, dark most of the time.
		// and the fireflies come out once the island has arrived
		const on = smoothstep(0.1, 0.9, night) * this.grove.arrive;
		for (let i = 0; i < this.ff.length; i++) {
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
		this.birds.instanceMatrix.needsUpdate = true;
		this.wingAttr.needsUpdate = true;
		(this.flies.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
		(this.flies.geometry.getAttribute('aGlow') as THREE.BufferAttribute).needsUpdate = true;
		// in the picture's own pixels, which are not the canvas's
		const H = this.grove.H * this.grove.bufferScale;
		const fov = THREE.MathUtils.degToRad(this.grove.camera.fov);
		const fu = (this.flies.material as THREE.ShaderMaterial).uniforms;
		fu.uScale.value = (0.55 * H) / (2 * Math.tan(fov / 2));
		fu.uDpr.value = this.grove.bufferScale;
		this.flies.visible = night > 0.02;
		this.birds.visible = this.day > 0.02;
	}
}
