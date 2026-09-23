import * as THREE from 'three';
import { U } from './shared';

// ─── The notes ────────────────────────────────────────────────────────────
// They come out of the horn and go up and out the way the bell is pointed,
// sideways more than up, or the picture would empty itself in a second and a
// half. They come on the music rather than on a timer: the bottom of the
// spectrum is read each frame and spent as a budget, so the stream thins and
// thickens with the piece. Each is drawn — a head and a stem and a flag, or
// two heads beamed — rather than set in whatever font the system has.

const MAX = 40;

function glyphs() {
	const S = 128;
	const c = document.createElement('canvas');
	c.width = S * 2;
	c.height = S;
	const g = c.getContext('2d')!;
	g.fillStyle = '#fff';
	g.strokeStyle = '#fff';
	g.lineCap = 'round';
	const head = (x: number, y: number) => {
		g.save();
		g.translate(x, y);
		g.rotate(-0.4);
		g.beginPath();
		g.ellipse(0, 0, 15, 10.5, 0, 0, Math.PI * 2);
		g.fill();
		g.restore();
	};
	// a quaver: head, stem, flag
	head(46, 92);
	g.lineWidth = 5;
	g.beginPath();
	g.moveTo(59, 88);
	g.lineTo(59, 22);
	g.stroke();
	g.beginPath();
	g.moveTo(59, 22);
	g.bezierCurveTo(78, 36, 90, 46, 80, 70);
	g.stroke();
	// two beamed quavers
	head(S + 30, 96);
	head(S + 84, 84);
	g.beginPath();
	g.moveTo(S + 43, 92);
	g.lineTo(S + 43, 30);
	g.moveTo(S + 97, 80);
	g.lineTo(S + 97, 18);
	g.stroke();
	g.lineWidth = 11;
	g.beginPath();
	g.moveTo(S + 43, 30);
	g.lineTo(S + 97, 18);
	g.stroke();
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

export class Notes {
	points: THREE.Points;
	private pos = new Float32Array(MAX * 3);
	private life = new Float32Array(MAX);
	private kind = new Float32Array(MAX);
	private vel: THREE.Vector3[] = [];
	private age = new Float32Array(MAX);
	private ttl = new Float32Array(MAX);
	private budget = 0;
	private next = 0;
	private mat: THREE.ShaderMaterial;

	constructor() {
		const geo = new THREE.BufferGeometry();
		geo.setAttribute(
			'position',
			new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
		);
		geo.setAttribute(
			'aLife',
			new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage)
		);
		geo.setAttribute(
			'aKind',
			new THREE.BufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage)
		);
		for (let i = 0; i < MAX; i++) {
			this.vel.push(new THREE.Vector3());
			this.pos[i * 3 + 1] = -999;
		}
		this.mat = new THREE.ShaderMaterial({
			uniforms: {
				uMap: { value: glyphs() },
				uScale: { value: 1 },
				uInk: { value: new THREE.Color() },
				uNight: U.uNight
			},
			vertexShader: /* glsl */ `
				attribute float aLife;
				attribute float aKind;
				uniform float uScale;
				varying float vLife;
				varying float vKind;
				void main() {
					vLife = aLife;
					vKind = aKind;
					vec4 mv = modelViewMatrix * vec4(position, 1.0);
					gl_PointSize = uScale / -mv.z * (0.6 + 0.4 * smoothstep(0.0, 0.2, aLife));
					gl_Position = projectionMatrix * mv;
				}`,
			fragmentShader: /* glsl */ `
				uniform sampler2D uMap;
				uniform vec3 uInk;
				varying float vLife;
				varying float vKind;
				void main() {
					vec2 uv = vec2((gl_PointCoord.x + vKind) * 0.5, 1.0 - gl_PointCoord.y);
					float a = texture2D(uMap, uv).a;
					// in over a fifth of its life, out over the last half
					float fade = smoothstep(0.0, 0.2, vLife) * smoothstep(1.0, 0.5, vLife);
					if (a * fade < 0.02) discard;
					gl_FragColor = vec4(uInk, a * fade);
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
		const night = U.uNight.value;
		(this.mat.uniforms.uInk.value as THREE.Color).setRGB(
			0.16 + night * 0.76,
			0.12 + night * 0.8,
			0.1 + night * 0.84
		);
		if (playing) this.budget += dt * (0.4 + level * 5.5);
		while (this.budget >= 1) {
			this.budget -= 1;
			const i = this.next++ % MAX;
			this.pos[i * 3] = mouth.x;
			this.pos[i * 3 + 1] = mouth.y;
			this.pos[i * 3 + 2] = mouth.z;
			const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
			this.vel[i]
				.copy(dir)
				.multiplyScalar(0.35 + Math.random() * 0.25)
				.addScaledVector(side, (Math.random() - 0.5) * 0.5)
				.add(new THREE.Vector3(0, 0.16 + Math.random() * 0.12, 0));
			this.age[i] = 0;
			this.ttl[i] = 3.2 + Math.random() * 1.6;
			this.kind[i] = Math.random() < 0.6 ? 0 : 1;
		}
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
			const wob = Math.sin(this.age[i] * 2.4 + i) * 0.12;
			this.pos[i * 3] += (v.x + wob * v.z) * dt;
			this.pos[i * 3 + 1] += v.y * dt;
			this.pos[i * 3 + 2] += (v.z - wob * v.x) * dt;
			v.multiplyScalar(1 - dt * 0.25);
			this.life[i] = l;
		}
		const g = this.points.geometry;
		(g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
		(g.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true;
		(g.getAttribute('aKind') as THREE.BufferAttribute).needsUpdate = true;
		this.points.visible = any || playing;
		return any;
	}
}
