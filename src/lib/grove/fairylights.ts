import * as THREE from 'three';
import { ROT, type RotundaParts } from './rotunda';

// ─── Fairy lights ─────────────────────────────────────────────────────────
// Strings of small warm bulbs on the rotunda: one down each rib of the dome
// from the finial to the cornice, and from each corner a swag slung under
// the cornice across the top of the arch. By day they are glass beads on a
// dark wire; as the light goes they come on, bulb after bulb, from the top
// of the dome down and out along the swags, and by night each breathes a
// little on its own. Their light on the brick is laid into the glow map.

const BULB_R = 0.028;
/** warm white, a little under a candle's colour */
const WARM = new THREE.Color(1.0, 0.6, 0.28);

export interface FairyLights {
	group: THREE.Group;
	/** out from each rib and where each swag hangs lowest: their light, for the glow map */
	glowAt: THREE.Vector3[];
	update(on: number, time: number, still: boolean): void;
}

export function buildFairyLights(rot: RotundaParts): FairyLights {
	const { floor, ap, wallH } = ROT;
	const n6 = Math.PI / 6;
	const corner = ap / Math.cos(n6);
	const entY = floor + wallH;
	const { r: domeR, y: domeY, h: domeH } = rot.dome;

	// every string as a run of points, each point with how far down the
	// order of lighting it comes (0 first, 1 last)
	const strings: { p: THREE.Vector3[]; order: number[] }[] = [];
	const glowAt: THREE.Vector3[] = [];
	const at = (a: number, r: number, y: number) =>
		new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);

	for (let k = 0; k < 6; k++) {
		const a = n6 + (k * Math.PI) / 3;
		// down the rib: evenly along the arc, just proud of the lead
		const rib: THREE.Vector3[] = [];
		const N = 72;
		const pts: THREE.Vector3[] = [];
		for (let j = 0; j <= N; j++) {
			const th = 1.36 * (1 - j / N) + 0.02;
			pts.push(at(a, (domeR + 0.045) * Math.cos(th), domeY + (domeH + 0.045) * Math.sin(th)));
		}
		// over the cornice's lip to the corner the swags hang from
		const anchor = at(a, corner + 0.37, entY + 0.4);
		pts.push(at(a, corner + 0.3, entY + 0.66), anchor);
		const curve = new THREE.CatmullRomCurve3(pts);
		const len = curve.getLength();
		const n = Math.round(len / 0.2);
		for (let j = 0; j <= n; j++) rib.push(curve.getPointAt(j / n));
		strings.push({ p: rib, order: rib.map((_, j) => (j / n) * 0.55) });
		// the ribs' light, taken out past the lead toward the crowns: laid
		// on the dome itself it would pale the whole of it
		glowAt.push(at(a, corner + 0.9, domeY + 0.5));

		// the swag to the next corner, sagging over the arch
		const b = n6 + ((k + 1) * Math.PI) / 3;
		const next = at(b, corner + 0.37, entY + 0.4);
		const swag: THREE.Vector3[] = [];
		const M = 15;
		for (let j = 1; j < M; j++) {
			const t = j / M;
			const q = anchor.clone().lerp(next, t);
			// out a little, clear of the frieze, and down in a festoon to
			// just under the crown of the arch
			const out = Math.sin(Math.PI * t) * 0.08;
			q.x += Math.sin((a + b) / 2) * out;
			q.z += Math.cos((a + b) / 2) * out;
			q.y -= 0.56 * 4 * t * (1 - t);
			swag.push(q);
		}
		strings.push({
			p: swag,
			order: swag.map((_, j) => 0.55 + 0.45 * (1 - Math.abs((j + 1) / M - 0.5) * 2))
		});
		glowAt.push(swag[Math.floor(swag.length / 2)].clone());
	}

	// and at the very top, on the finial's point, one larger lamp: the first
	// to come on, and what keeps the crown of the dome from going dark
	const tip = rot.crown.clone().setY(rot.crown.y + 0.08);
	strings.push({ p: [tip], order: [0] });
	glowAt.push(tip.clone().setY(tip.y - 0.9));

	const group = new THREE.Group();

	// the wire, dark, and only just there by day
	const wire: number[] = [];
	for (const s of strings)
		for (let j = 0; j < s.p.length - 1; j++)
			wire.push(...s.p[j].toArray(), ...s.p[j + 1].toArray());
	// the swags hang from the ribs' ends: join them
	for (let k = 0; k < 6; k++) {
		const rib = strings[k * 2].p,
			swag = strings[k * 2 + 1].p;
		const nextRib = strings[((k + 1) % 6) * 2].p;
		wire.push(...rib[rib.length - 1].toArray(), ...swag[0].toArray());
		wire.push(...swag[swag.length - 1].toArray(), ...nextRib[nextRib.length - 1].toArray());
	}
	const wireGeo = new THREE.BufferGeometry();
	wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
	const wireMat = new THREE.LineBasicMaterial({
		color: 0x1c1a16,
		transparent: true,
		opacity: 0.55,
		depthWrite: false
	});
	group.add(new THREE.LineSegments(wireGeo, wireMat));

	// the bulbs
	const all: THREE.Vector3[] = [],
		order: number[] = [],
		phase: number[] = [];
	for (const s of strings)
		s.p.forEach((p, j) => {
			all.push(p);
			order.push(s.order[j]);
			phase.push(Math.random());
		});
	const geo = new THREE.IcosahedronGeometry(BULB_R, 1);
	geo.setAttribute('aOrder', new THREE.InstancedBufferAttribute(new Float32Array(order), 1));
	geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phase), 1));
	const uniforms = {
		uOn: { value: 0 },
		uTime: { value: 0 },
		uTwinkle: { value: 1 },
		uWarm: { value: WARM.clone().multiplyScalar(4.6) },
		uBead: { value: new THREE.Color(0.42, 0.4, 0.34) }
	};
	const mat = new THREE.ShaderMaterial({
		uniforms,
		vertexShader: /* glsl */ `
			attribute float aOrder;
			attribute float aPhase;
			uniform float uOn;
			uniform float uTime;
			uniform float uTwinkle;
			varying float vOn;
			varying float vShade;
			void main() {
				// each comes on in its turn as the dusk deepens
				float on = smoothstep(aOrder * 0.6, aOrder * 0.6 + 0.4, uOn);
				float breathe = 1.0 + uTwinkle * (0.16 * sin(uTime * 1.3 + aPhase * 6.283)
					+ 0.08 * sin(uTime * 2.9 + aPhase * 17.0));
				vOn = on * breathe;
				// a bead by day is lit from above
				vShade = 0.55 + 0.45 * normal.y;
				gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			uniform vec3 uWarm;
			uniform vec3 uBead;
			varying float vOn;
			varying float vShade;
			void main() {
				vec3 bead = uBead * vShade;
				gl_FragColor = vec4(mix(bead, uWarm * vOn, clamp(vOn * 1.5, 0.0, 1.0)), 1.0);
			}`
	});
	const bulbs = new THREE.InstancedMesh(geo, mat, all.length);
	const m = new THREE.Matrix4();
	all.forEach((p, i) => {
		m.makeScale(p === tip ? 2.6 : 1, p === tip ? 2.6 : 1, p === tip ? 2.6 : 1).setPosition(p);
		bulbs.setMatrixAt(i, m);
	});
	bulbs.frustumCulled = false;
	group.add(bulbs);

	return {
		group,
		glowAt,
		update(on, time, still) {
			uniforms.uOn.value = on;
			uniforms.uTime.value = time;
			uniforms.uTwinkle.value = still ? 0 : 1;
			wireMat.opacity = 0.55 * (1 - on * 0.8);
		}
	};
}
