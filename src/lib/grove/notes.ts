import * as THREE from 'three';
import { U } from './shared';

// ─── The notes ────────────────────────────────────────────────────────────
// A few notes drift out of the horn while the record plays: one every couple
// of seconds, more when the music swells, never a stream. Each floats out
// through the arch at a walking pace, rises once clear of the roof, rocks a
// little as it goes, and fades. They are drawn as an engraver would: an oval
// head set at a slant, a fine stem, a flag that swells and tapers — a quaver,
// or two beamed.

const MAX = 12;

function glyphs() {
	const S = 256;
	const c = document.createElement('canvas');
	c.width = S * 2;
	c.height = S;
	const g = c.getContext('2d')!;
	// the ink in red, and in green a soft halo round it, from the canvas's
	// own shadow: dark by day, so a note reads against the sky and the brick
	// alike, and a glow by night
	g.fillStyle = '#f00';
	g.strokeStyle = '#f00';
	g.shadowColor = '#0f0';
	g.shadowBlur = 14;
	g.lineCap = 'round';
	g.lineJoin = 'round';
	const head = (x: number, y: number) => {
		g.save();
		g.translate(x, y);
		g.rotate(-0.38);
		g.beginPath();
		g.ellipse(0, 0, 25, 17.5, 0, 0, Math.PI * 2);
		g.fill();
		g.restore();
	};
	// a quaver: head, stem, and a flag that swells and tapers
	const qx = 96,
		qy = 196;
	head(qx, qy);
	g.lineWidth = 6;
	g.beginPath();
	g.moveTo(qx + 22, qy - 8);
	g.lineTo(qx + 22, 40);
	g.stroke();
	g.beginPath();
	g.moveTo(qx + 19, 38);
	g.bezierCurveTo(qx + 30, 76, qx + 80, 92, qx + 66, 152);
	g.bezierCurveTo(qx + 70, 112, qx + 40, 98, qx + 25, 90);
	g.closePath();
	g.fill();
	// two beamed, the second a step higher
	const ax = S + 62,
		ay = 200,
		bx = S + 172,
		by = 180;
	head(ax, ay);
	head(bx, by);
	g.beginPath();
	g.moveTo(ax + 22, ay - 8);
	g.lineTo(ax + 22, 58);
	g.moveTo(bx + 22, by - 8);
	g.lineTo(bx + 22, 38);
	g.stroke();
	g.beginPath();
	g.moveTo(ax + 19, 58);
	g.lineTo(bx + 25, 36);
	g.lineTo(bx + 25, 56);
	g.lineTo(ax + 19, 78);
	g.closePath();
	g.fill();
	const t = new THREE.CanvasTexture(c);
	t.minFilter = THREE.LinearMipmapLinearFilter;
	return t;
}

export class Notes {
	points: THREE.Points;
	private pos = new Float32Array(MAX * 3);
	private life = new Float32Array(MAX);
	private kind = new Float32Array(MAX);
	private tilt = new Float32Array(MAX);
	private vel: THREE.Vector3[] = [];
	private age = new Float32Array(MAX);
	private ttl = new Float32Array(MAX);
	private lift = new Float32Array(MAX);
	private phase = new Float32Array(MAX);
	private side = new Float32Array(MAX);
	private budget = 0.6;
	private next = 0;
	private mat: THREE.ShaderMaterial;

	constructor() {
		const geo = new THREE.BufferGeometry();
		const dyn = (a: Float32Array, n: number) =>
			new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
		geo.setAttribute('position', dyn(this.pos, 3));
		geo.setAttribute('aLife', dyn(this.life, 1));
		geo.setAttribute('aKind', dyn(this.kind, 1));
		geo.setAttribute('aTilt', dyn(this.tilt, 1));
		for (let i = 0; i < MAX; i++) {
			this.vel.push(new THREE.Vector3());
			this.pos[i * 3 + 1] = -999;
		}
		this.mat = new THREE.ShaderMaterial({
			uniforms: {
				uMap: { value: glyphs() },
				uScale: { value: 1 },
				uInk: { value: new THREE.Color() },
				uHalo: { value: new THREE.Color() },
				uHaloA: { value: 0.6 }
			},
			vertexShader: /* glsl */ `
				attribute float aLife;
				attribute float aKind;
				attribute float aTilt;
				uniform float uScale;
				varying float vLife;
				varying float vKind;
				varying vec2 vRot;
				void main() {
					vLife = aLife;
					vKind = aKind;
					vRot = vec2(cos(aTilt), sin(aTilt));
					vec4 mv = modelViewMatrix * vec4(position, 1.0);
					gl_PointSize = uScale / -mv.z * (0.75 + 0.25 * smoothstep(0.0, 0.25, aLife));
					gl_Position = projectionMatrix * mv;
				}`,
			fragmentShader: /* glsl */ `
				uniform sampler2D uMap;
				uniform vec3 uInk;
				uniform vec3 uHalo;
				uniform float uHaloA;
				varying float vLife;
				varying float vKind;
				varying vec2 vRot;
				void main() {
					// the note rocks as it goes: turn the sprite about its middle
					vec2 p = gl_PointCoord - 0.5;
					p = mat2(vRot.x, -vRot.y, vRot.y, vRot.x) * p * 1.12 + 0.5;
					if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;
					vec4 t = texture2D(uMap, vec2((p.x + vKind) * 0.5, 1.0 - p.y));
					float fill = t.r * t.a;
					float halo = t.g * t.a * uHaloA * (1.0 - fill);
					// in over the first eighth of its life, out over the last third
					float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.62, 1.0, vLife));
					float a = (fill + halo) * fade;
					if (a < 0.01) discard;
					gl_FragColor = vec4((uInk * fill + uHalo * halo) / max(fill + halo, 1e-4), a);
				}`,
			transparent: true,
			depthWrite: false
		});
		this.points = new THREE.Points(geo, this.mat);
		this.points.frustumCulled = false;
		this.points.renderOrder = 10;
	}

	/** Spend the music's loudness as notes, from `mouth` along `dir`. */
	update(
		dt: number,
		level: number,
		playing: boolean,
		mouth: THREE.Vector3,
		dir: THREE.Vector3,
		px: number
	) {
		this.mat.uniforms.uScale.value = px;
		// gold with a dark edge by day, so it reads on sky and brick alike; by
		// night a lighter gold in a glow of its own
		const night = U.uNight.value;
		const lerp = THREE.MathUtils.lerp;
		const u = this.mat.uniforms;
		(u.uInk.value as THREE.Color)
			.setRGB(1.0, lerp(0.74, 0.8, night), lerp(0.3, 0.47, night))
			.multiplyScalar(lerp(1.15, 2.3, night));
		(u.uHalo.value as THREE.Color)
			.setRGB(lerp(0.1, 1.0, night), lerp(0.06, 0.68, night), lerp(0.02, 0.3, night))
			.multiplyScalar(lerp(1, 0.55, night));
		u.uHaloA.value = lerp(0.55, 0.4, night);
		// about one note every two seconds, a few more when the music swells
		if (playing) this.budget += dt * (0.22 + Math.min(level, 1) * 1.1);
		while (this.budget >= 1) {
			this.budget -= 1;
			const i = this.next++ % MAX;
			this.pos[i * 3] = mouth.x + (Math.random() - 0.5) * 0.2;
			this.pos[i * 3 + 1] = mouth.y + (Math.random() - 0.5) * 0.2;
			this.pos[i * 3 + 2] = mouth.z;
			// out level, the way the doorway lies, through the arch before
			// they rise: a building has a roof
			const flat = new THREE.Vector3(dir.x * 0.35, 0, 1).normalize();
			const side = new THREE.Vector3(-flat.z, 0, flat.x);
			this.vel[i]
				.copy(flat)
				.multiplyScalar(0.55 + Math.random() * 0.15)
				.addScaledVector(side, (Math.random() - 0.5) * 0.25)
				.setY((Math.random() - 0.6) * 0.08);
			this.lift[i] = 0.24 + Math.random() * 0.16;
			// once out, each goes off to one side or the other as it rises
			this.side[i] = (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.18);
			this.phase[i] = Math.random() * 6.28;
			this.age[i] = 0;
			this.ttl[i] = 6.5 + Math.random() * 2;
			this.kind[i] = Math.random() < 0.65 ? 0 : 1;
		}
		if (!playing) this.budget = Math.min(this.budget, 0.6);
		let any = false;
		for (let i = 0; i < MAX; i++) {
			if (this.ttl[i] <= 0) continue;
			this.age[i] += dt;
			const l = this.age[i] / this.ttl[i];
			if (l >= 1) {
				this.ttl[i] = 0;
				this.pos[i * 3 + 1] = -999;
				this.life[i] = 0;
				continue;
			}
			any = true;
			const v = this.vel[i];
			const t = this.age[i] + this.phase[i];
			const sway = Math.sin(t * 1.3) * 0.08;
			this.pos[i * 3] += (v.x + sway * v.z) * dt;
			this.pos[i * 3 + 1] += v.y * dt;
			this.pos[i * 3 + 2] += (v.z - sway * v.x) * dt;
			// once clear of the rotunda they lift and slow
			if (Math.hypot(this.pos[i * 3], this.pos[i * 3 + 2]) > 2.4) {
				const k = Math.min(1, dt * 0.9);
				v.y += (this.lift[i] - v.y) * k;
				v.x += (this.side[i] - v.x) * k;
				v.z *= 1 - dt * 0.5;
			}
			this.tilt[i] = Math.sin(t * 1.3 + 0.8) * 0.26;
			this.life[i] = l;
		}
		const g = this.points.geometry;
		for (const name of ['position', 'aLife', 'aKind', 'aTilt'])
			(g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
		this.points.visible = any || playing;
		return any;
	}
}
