import * as THREE from 'three';
import { patch, nightPatch, U } from './shared';
import { GLOW_GLSL } from './glow';

// ─── Water ────────────────────────────────────────────────────────────────
// A spring in a stone basin, a channel out of it to the lip of the rock, and
// the fall over the edge. The still water is a mirror: dark, and all its
// colour the sky's, taken in at a slant, broken up by small ripples the wind
// sends across it and by rings where it is touched. The channel's water runs,
// its ripples carried down it, whitening where it tips over the lip. The fall
// leaves the lip as a glassy sheet, goes down under its own weight, draws out
// into strands, and breaks into spray that the air takes before it is far
// below the rock.

/** The fall's own clock: every pattern in it repeats after this many
 *  seconds, so the clock can go round without a seam. */
const LOOP = 256;

const NOISE = /* glsl */ `
float wHash(vec2 i) {
	i = mod(i, 256.0);
	return fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
}
// value noise that repeats every 256 cells, so a clock taken round 256 is seamless
float wNoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x),
		mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

export const WATER_U = {
	/** the fall's clock, taken round LOOP */
	uFlowT: { value: 0 },
	/** the last touch on the water: where (x, z), when, how hard */
	uSplash: { value: new THREE.Vector4(0, 0, -100, 0) }
};

export function stepWater(t: number) {
	WATER_U.uFlowT.value = t % LOOP;
}

/**
 * The surface of the pool and the channel. Two attributes say what water it
 * is: aFlow, which way it runs and how fast (x, z, speed); aWet, how much
 * foam is on it and how shallow it is over the stone.
 */
export function waterMaterial() {
	const m = new THREE.MeshStandardMaterial({
		color: new THREE.Color(0.012, 0.07, 0.085),
		roughness: 0.05,
		metalness: 0,
		envMapIntensity: 0.9
	});
	return patch(
		m,
		'water',
		(s) => {
			s.uniforms.uTime = U.uTime;
			s.uniforms.uSplash = WATER_U.uSplash;
			s.vertexShader = s.vertexShader
				.replace(
					'void main() {',
					`attribute vec3 aFlow;
					attribute vec2 aWet;
					varying vec3 vWP;
					varying vec3 vFlow;
					varying vec2 vWet;
					void main() {`
				)
				.replace(
					'#include <begin_vertex>',
					`#include <begin_vertex>
					vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
					vFlow = aFlow;
					vWet = aWet;`
				);
			s.fragmentShader = s.fragmentShader
				.replace(
					'void main() {',
					`uniform float uTime;
					uniform vec4 uSplash;
					varying vec3 vWP;
					varying vec3 vFlow;
					varying vec2 vWet;
					${NOISE}
					void main() {`
				)
				.replace(
					'#include <color_fragment>',
					`#include <color_fragment>
					// over the stone at the edge the water is shallow, and browner
					diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.065, 0.04), vWet.y * 0.7);
					vec2 fq = vWP.xz - vFlow.xy * vFlow.z * uTime;
					float foamN = wNoise(fq * vec2(9.0, 9.0)) * 0.6 + wNoise(fq * 23.0) * 0.4;
					float foam = vWet.x * smoothstep(0.35, 0.75, foamN + vWet.x * 0.3);
					diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.82, 0.84), foam);`
				)
				.replace(
					'#include <roughnessmap_fragment>',
					`#include <roughnessmap_fragment>
					roughnessFactor = mix(roughnessFactor, 0.7, foam);`
				)
				.replace(
					'#include <normal_fragment_maps>',
					`#include <normal_fragment_maps>
					{
						// small ripples the wind sends across, carried down the
						// channel where it runs, a little rougher where it runs
						vec2 q = vWP.xz - vFlow.xy * vFlow.z * uTime * 0.8;
						float run = 1.0 + vFlow.z * 3.0;
						vec2 g = vec2(0.0);
						vec2 d; float ph;
						d = normalize(vec2(1.0, 0.35)); ph = dot(q, d) * 9.0 + uTime * 1.7; g += d * 0.036 * cos(ph);
						d = normalize(vec2(-0.4, 1.0)); ph = dot(q, d) * 14.0 + uTime * 2.3; g += d * 0.04 * cos(ph);
						d = normalize(vec2(0.7, -0.8)); ph = dot(q, d) * 23.0 + uTime * 3.1; g += d * 0.036 * cos(ph);
						d = normalize(vec2(-0.9, -0.3)); ph = dot(q, d) * 37.0 + uTime * 4.2; g += d * 0.03 * cos(ph);
						g *= run;
						// rings from a touch, running out and dying away
						vec2 rd = vWP.xz - uSplash.xy;
						float r = length(rd);
						float age = uTime - uSplash.z;
						if (age > 0.0 && age < 4.0) {
							float front = r - age * 0.5;
							float env = uSplash.w * exp(-age * 1.1) * exp(-front * front * 26.0) / (1.0 + r * 2.0);
							g += (rd / max(r, 1e-3)) * env * 1.6 * cos(front * 42.0);
						}
						vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
						normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
					}`
				);
		},
		nightPatch
	);
}

/** the shape of the fall: where water that left the lip `t` seconds ago is */
export interface FallShape {
	lip: THREE.Vector3;
	/** out over the edge, level */
	out: THREE.Vector3;
	/** how fast it leaves the lip, and how long until it is gone */
	v0: number;
	T: number;
	/** its width at the lip */
	w0: number;
}

const G = 7.8;

export function fallAt(f: FallShape, t: number, out = new THREE.Vector3()) {
	return out
		.copy(f.lip)
		.addScaledVector(f.out, f.v0 * t + 0.08 * t * t)
		.setY(f.lip.y - 0.5 * G * t * t);
}

/** the fall as a sheet: across it u in -1..1, along it s in 0..1 */
function fallGeometry(f: FallShape, widen: number, bulge: number, rows = 56, cols = 12) {
	const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), f.out).normalize();
	const pos: number[] = [],
		attr: number[] = [];
	const c = new THREE.Vector3();
	for (let i = 0; i <= rows; i++) {
		const s = i / rows;
		// rows closer together at the top, where it curls over the lip
		const t = f.T * s * s * 0.35 + f.T * s * 0.65;
		fallAt(f, t, c);
		const w = f.w0 * widen * (1 + 0.5 * t);
		for (let j = 0; j <= cols; j++) {
			const u = (j / cols) * 2 - 1;
			const p = c
				.clone()
				.addScaledVector(side, (u * w) / 2)
				.addScaledVector(f.out, bulge * w * (1 - u * u));
			pos.push(p.x, p.y, p.z);
			attr.push(u, s, t);
		}
	}
	const idx: number[] = [];
	for (let i = 0; i < rows; i++)
		for (let j = 0; j < cols; j++) {
			const a = i * (cols + 1) + j,
				b = a + 1,
				d = a + cols + 1,
				e = d + 1;
			idx.push(a, d, b, b, d, e);
		}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('aFall', new THREE.Float32BufferAttribute(attr, 3));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

function fallMaterial(layer: number, opacity: number) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uFlowT: WATER_U.uFlowT,
			uNight: U.uNight,
			uSunColor: U.uSunColor,
			uGlowMap: U.uGlowMap,
			uGlowOn: U.uGlowOn,
			uLayer: { value: layer },
			uOpacity: { value: opacity }
		},
		vertexShader: /* glsl */ `
			attribute vec3 aFall;
			varying vec3 vFall;
			varying vec3 vWP;
			varying vec3 vN;
			void main() {
				vFall = aFall;
				vec4 w = modelMatrix * vec4(position, 1.0);
				vWP = w.xyz;
				vN = normalize(mat3(modelMatrix) * normal);
				gl_Position = projectionMatrix * viewMatrix * w;
			}`,
		fragmentShader: /* glsl */ `
			uniform float uFlowT;
			uniform float uNight;
			uniform vec3 uSunColor;
			uniform float uLayer;
			uniform float uOpacity;
			varying vec3 vFall;
			varying vec3 vWP;
			varying vec3 vN;
			${GLOW_GLSL}
			${NOISE}
			void main() {
				float u = vFall.x, s = vFall.y, t = vFall.z;
				// the water here left the lip at tau: its pattern goes down with it,
				// faster and faster, as the water does
				float tau = uFlowT - t;
				float k = 13.0 * uLayer;
				float n1 = wNoise(vec2(u * 6.0 + k, tau * 2.0));
				float n2 = wNoise(vec2(u * 17.0 + 3.0 + k, tau * 5.0));
				float n3 = wNoise(vec2(u * 2.5 + 7.0, tau * 1.0 + k));
				float streak = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
				float edge = 1.0 - smoothstep(0.5 - 0.2 * s, 1.0, abs(u));
				// whole at the lip, drawn into strands as it goes, gone into spray
				float whole = 1.0 - smoothstep(0.0, 0.4, s);
				float strands = smoothstep(0.42 + 0.22 * s, 0.72 + 0.12 * s, streak);
				float a = mix(strands, 0.72 + 0.28 * streak, whole * (1.0 - uLayer * 0.6)) * edge;
				a *= 1.0 - smoothstep(0.45, 0.95, s);
				a *= uOpacity;
				if (a < 0.004) discard;
				// glassy and a little green where it is whole, white where it breaks
				vec3 c = mix(vec3(0.34, 0.56, 0.64), vec3(1.0), clamp(smoothstep(0.45, 0.8, streak) + s * 0.6, 0.0, 1.0));
				vec3 n = normalize(vN);
				float lam = 0.6 + 0.4 * abs(dot(n, normalize(vec3(-0.5, 0.55, 0.45))));
				vec3 sky = mix(vec3(0.62, 0.7, 0.82), vec3(0.07, 0.085, 0.13), uNight);
				vec3 light = (uSunColor * 0.55 + sky) * lam + glowAt(vWP) * 0.8;
				gl_FragColor = vec4(c * light, a);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
			}`,
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide
	});
}

/** The fall: a sheet and a thinner veil round it. */
export function buildFall(f: FallShape) {
	const group = new THREE.Group();
	const core = new THREE.Mesh(fallGeometry(f, 1, 0.08), fallMaterial(0, 1));
	const veil = new THREE.Mesh(fallGeometry(f, 1.5, 0.16), fallMaterial(1, 0.55));
	veil.renderOrder = 1;
	core.renderOrder = 2;
	for (const m of [core, veil]) {
		m.frustumCulled = false;
		group.add(m);
	}
	return group;
}

// ─── Spray ────────────────────────────────────────────────────────────────
// Where the fall draws out into strands it throws off spray: fine drops that
// go on down a little way, slowing, and spread into a haze; and at its foot
// the last of it goes into the air as a slow cloud of mist.

const SPRAY = 64;

interface Drop {
	p: THREE.Vector3;
	v: THREE.Vector3;
	age: number;
	life: number;
	size: number;
	grow: number;
	a: number;
}

export class Spray {
	points: THREE.Points;
	private d: Drop[] = [];
	private pos = new Float32Array(SPRAY * 3);
	private size = new Float32Array(SPRAY);
	private alpha = new Float32Array(SPRAY);
	private next = 0;
	private wait = 0;

	constructor(private f: FallShape) {
		const g = new THREE.BufferGeometry();
		g.setAttribute(
			'position',
			new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
		);
		g.setAttribute(
			'aSize',
			new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage)
		);
		g.setAttribute(
			'aAlpha',
			new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage)
		);
		const m = new THREE.ShaderMaterial({
			uniforms: {
				uScale: { value: 500 },
				uNight: U.uNight,
				uSunColor: U.uSunColor,
				uGlowMap: U.uGlowMap,
				uGlowOn: U.uGlowOn
			},
			vertexShader: /* glsl */ `
				attribute float aSize;
				attribute float aAlpha;
				uniform float uScale;
				varying float vA;
				varying vec3 vWP;
				void main() {
					vA = aAlpha;
					vec4 w = modelMatrix * vec4(position, 1.0);
					vWP = w.xyz;
					vec4 mv = viewMatrix * w;
					gl_PointSize = min(aSize * uScale / -mv.z, 220.0);
					gl_Position = projectionMatrix * mv;
				}`,
			fragmentShader: /* glsl */ `
				uniform float uNight;
				uniform vec3 uSunColor;
				varying float vA;
				varying vec3 vWP;
				${GLOW_GLSL}
				void main() {
					float d = length(gl_PointCoord - 0.5) * 2.0;
					float a = exp(-d * d * 3.5) * (1.0 - d) * vA;
					if (a < 0.003) discard;
					vec3 sky = mix(vec3(0.7, 0.76, 0.86), vec3(0.08, 0.095, 0.14), uNight);
					gl_FragColor = vec4((uSunColor * 0.45 + sky) + glowAt(vWP) * 0.6, a);
					#include <tonemapping_fragment>
					#include <colorspace_fragment>
				}`,
			transparent: true,
			depthWrite: false
		});
		this.points = new THREE.Points(g, m);
		this.points.frustumCulled = false;
		this.points.renderOrder = 3;
		for (let i = 0; i < SPRAY; i++)
			this.d.push({
				p: new THREE.Vector3(0, -100, 0),
				v: new THREE.Vector3(),
				age: 0,
				life: 0,
				size: 0,
				grow: 0,
				a: 0
			});
	}

	/** pixels a metre at a metre off: the picture's height over the lens */
	setScale(pxPerUnit: number) {
		(this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = pxPerUnit;
	}

	update(dt: number, reduced: boolean) {
		const f = this.f;
		this.wait -= dt;
		while (this.wait < 0 && !reduced) {
			this.wait += 0.045;
			const d = this.d[this.next++ % SPRAY];
			// most from where it breaks up; now and then a big slow puff at its foot
			const foot = Math.random() < 0.22;
			const s = foot ? 0.78 + Math.random() * 0.2 : 0.35 + Math.random() * 0.5;
			const t = f.T * s;
			fallAt(f, t, d.p);
			const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), f.out);
			d.p.addScaledVector(side, (Math.random() - 0.5) * f.w0 * (1 + 0.5 * t));
			// going the way the water goes, but the air slows it at once
			d.v
				.copy(f.out)
				.multiplyScalar(f.v0 + 0.16 * t)
				.setY(-G * t * 0.35);
			d.v.x += (Math.random() - 0.5) * 0.5;
			d.v.z += (Math.random() - 0.5) * 0.5;
			d.age = 0;
			d.life = foot ? 2.6 + Math.random() * 1.6 : 1.1 + Math.random() * 1.1;
			d.size = foot ? 0.55 + Math.random() * 0.5 : 0.12 + Math.random() * 0.16;
			d.grow = foot ? 0.7 : 0.45;
			d.a = foot ? 0.2 : 0.3;
		}
		for (let i = 0; i < SPRAY; i++) {
			const d = this.d[i];
			if (d.age >= d.life) {
				this.alpha[i] = 0;
				continue;
			}
			d.age += dt;
			const k = Math.min(1, dt * 1.6);
			d.v.x -= d.v.x * k;
			d.v.z -= d.v.z * k;
			d.v.y += (-0.6 - d.v.y) * k;
			d.p.addScaledVector(d.v, dt);
			const u = d.age / d.life;
			this.pos[i * 3] = d.p.x;
			this.pos[i * 3 + 1] = d.p.y;
			this.pos[i * 3 + 2] = d.p.z;
			this.size[i] = d.size * (1 + d.grow * u * 2.5);
			this.alpha[i] = d.a * Math.min(1, u * 6) * (1 - u) * (1 - u);
		}
		const g = this.points.geometry;
		g.attributes.position.needsUpdate = true;
		g.attributes.aSize.needsUpdate = true;
		g.attributes.aAlpha.needsUpdate = true;
	}
}
