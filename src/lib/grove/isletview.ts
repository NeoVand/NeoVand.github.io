import * as THREE from 'three';
import { U } from './shared';
import { Islet, ISLET_FRAME } from './islet';
import { SHADOW_LAYER } from './flora/plants';
import { rustleFrom } from './flora/wind';
import { clamp, damp, easeOut, lerp, smoothstep } from './rng';
import { Air } from './air';
import { Notes } from './notes';
import { lampRoom } from './gramophone';
import { moonTexture } from './sky';

// ─── The islet, over the reading room ─────────────────────────────────────
// While a paper is open the page lies under frosted glass, and over the glass,
// in the corner the words leave free, the islet floats: drawn by a renderer of
// its own onto a canvas with nothing behind it, so the glass shows round it.
// It keeps the grove's hours: its light is the grove's light, its wind the
// grove's wind, and the grove's clock runs it. It comes up into its place as
// the room opens and sinks away as it closes; a hand turns it and tilts it; a
// tap in the crown shakes leaves down, a tap on the water rings it, a tap on
// the gramophone plays a record (the same one the grove's plays), and a tap
// on nothing at all closes the room, as a tap on the glass would. Its doves
// are the grove's kind, and do as they do; and the moon hangs by it.

// The picture's grade, after the tone map, for a renderer that draws straight
// to its canvas: what the grove's last pass does, in the same terms, so the
// islet and the grove are one picture. (Only a renderer that asks for the
// custom tone map uses it; the grove's does its own afterwards.)
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
	'vec3 CustomToneMapping( vec3 color ) { return color; }',
	`vec3 CustomToneMapping( vec3 color ) {
		vec3 c = pow( max( AgXToneMapping( color ), 0.0 ), vec3( 1.0 / 2.2 ) );
		float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
		c = mix( vec3( l ), c, 1.18 );
		c = mix( c, c * c * ( 3.0 - 2.0 * c ), 0.34 );
		return pow( max( c, 0.0 ), vec3( 2.2 ) );
	}`
);

/** how the islet is first seen: turned a little, so the fall shows */
const YAW0 = 0.3;

/** the grove's light as it is now, for the islet to be lit the same */
export interface Lights {
	key: THREE.DirectionalLight;
	keyDir: THREE.Vector3;
	hemi: THREE.HemisphereLight;
	day: number;
	exposure: number;
	envIntensity: number;
	/** whether a record is playing, and how loud it is now */
	playing: boolean;
	level: number;
}

/** where on the canvas the moon hangs: across it, and down its framed part */
const MOON_AT = [0.83, 0.15];
/** its radius on screen, in the page's pixels, and how far off it is drawn */
const MOON_R = 30;
const MOON_D = 80;

/** the layers the gramophone's outline is made from: the machine, and what can stand in front of it */
const GRAM_LAYER = 3,
	OCCLUDER_LAYER = 4;

/**
 * The line round the gramophone under the pointer, as the grove draws it: a
 * crisp ring just outside the machine's silhouette, read from a mask of it,
 * with a fainter one beyond. Drawn over the finished picture, adding to it.
 */
function outlinePass() {
	const m = new THREE.ShaderMaterial({
		uniforms: {
			uMask: { value: null as THREE.Texture | null },
			uTexel: { value: new THREE.Vector2(1, 1) },
			uColor: { value: new THREE.Color(1.0, 0.86, 0.62) },
			uOn: { value: 0 }
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = position.xy * 0.5 + 0.5;
				gl_Position = vec4(position.xy, 0.0, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			uniform sampler2D uMask;
			uniform vec2 uTexel;
			uniform vec3 uColor;
			uniform float uOn;
			varying vec2 vUv;
			float ring(vec2 uv, float r) {
				float m = 0.0;
				for (int i = 0; i < 12; i++) {
					float a = float(i) * 0.5236;
					m = max(m, texture2D(uMask, uv + vec2(cos(a), sin(a)) * uTexel * r).r);
				}
				return m;
			}
			void main() {
				float inside = texture2D(uMask, vUv).r;
				float line = clamp(ring(vUv, 1.7) - inside, 0.0, 1.0);
				float halo = clamp(ring(vUv, 3.4) - inside, 0.0, 1.0) * 0.35;
				float a = max(line, halo) * uOn;
				if (a < 0.003) discard;
				gl_FragColor = vec4(uColor, 1.0);
				#include <colorspace_fragment>
				gl_FragColor = vec4(gl_FragColor.rgb * a, a);
			}`,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		premultipliedAlpha: true
	});
	const tri = new THREE.BufferGeometry().setAttribute(
		'position',
		new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
	);
	const mesh = new THREE.Mesh(tri, m);
	mesh.frustumCulled = false;
	const scene = new THREE.Scene();
	scene.add(mesh);
	return { scene, mat: m };
}

/** The moon, a disc with its painting on it, and a glow round it that only adds light. */
function moonMesh() {
	const m = new THREE.ShaderMaterial({
		uniforms: { uMap: { value: moonTexture() }, uOn: { value: 0 }, uGlow: { value: 1 } },
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			uniform sampler2D uMap;
			uniform float uOn;
			uniform float uGlow;
			varying vec2 vUv;
			void main() {
				vec2 p = vUv * 2.0 - 1.0;
				float r = length(p);
				const float R = 0.34;
				float disc = 1.0 - smoothstep(R - 0.012, R + 0.004, r);
				vec3 m = texture2D(uMap, p / (2.0 * R) + 0.5).rgb;
				float limb = 0.82 + 0.18 * sqrt(max(0.0, 1.0 - (r / R) * (r / R)));
				vec3 moon = vec3(1.0, 0.97, 0.9) * m * 2.2 * limb;
				float halo = exp(-max(r - R, 0.0) * 7.0) * 0.16 * (1.0 - disc) * uGlow;
				if (disc + halo < 0.002) discard;
				gl_FragColor = vec4(moon * disc + vec3(0.8, 0.86, 1.0) * halo, 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
				// the disc covers what is behind it; the glow only adds
				gl_FragColor = vec4(gl_FragColor.rgb * uOn, disc * uOn);
			}`,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true
	});
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
	mesh.frustumCulled = false;
	mesh.renderOrder = -10;
	return mesh;
}

/** A sky to be reflected in the water and the stone: a gradient, overhead to
 *  horizon to the cloud below, for a renderer with no sky of its own. */
function skyEnv(r: THREE.WebGLRenderer, top: number[], horizon: number[], low: number[]) {
	const scene = new THREE.Scene();
	const v = (c: number[]) => ({ value: new THREE.Color(c[0], c[1], c[2]) });
	const m = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		uniforms: { uTop: v(top), uHor: v(horizon), uLow: v(low) },
		vertexShader: /* glsl */ `
			varying vec3 vD;
			void main() {
				vD = position;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			uniform vec3 uTop, uHor, uLow;
			varying vec3 vD;
			void main() {
				float e = normalize(vD).y;
				vec3 c = e > 0.0 ? mix(uHor, uTop, pow(e, 0.55)) : mix(uHor, uLow, pow(-e, 0.35));
				gl_FragColor = vec4(c, 1.0);
			}`
	});
	scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m));
	const pm = new THREE.PMREMGenerator(r);
	const tex = pm.fromScene(scene, 0, 0.1, 50).texture;
	pm.dispose();
	m.dispose();
	return tex;
}

export class IsletView {
	renderer: THREE.WebGLRenderer;
	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(30, 1, 1, 200);
	/** a tap on nothing: the room closes */
	onMiss?: () => void;
	private key = new THREE.DirectionalLight(0xffffff, 3);
	private hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
	private envDay: THREE.Texture | null = null;
	private envNight: THREE.Texture | null = null;
	private envRoom: THREE.Texture | null = null;
	/** a record asked for: the grove's gramophone and this one play the same */
	onGramophone?: () => void;
	/** its doves, the notes out of its horn, and the moon */
	private air: Air;
	private notes = new Notes();
	private moon = moonMesh();
	private wasSpinning = false;
	private orbit = 0;
	private overGram = false;
	private gramGlow = 0;
	private mouth = new THREE.Vector3();
	private mouthDir = new THREE.Vector3();
	/** the gramophone's outline: its mask, and the pass that rings it */
	private outline = outlinePass();
	private gramMask = new THREE.WebGLRenderTarget(2, 2);
	private maskWhite = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
	private maskDepth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
	private flat = new THREE.Camera();
	/** coming up into its place (1), or gone (0), and which way it is going */
	private k = 0;
	private to = 0;
	private yaw = 0;
	private yawVel = 0;
	private pitch = 0;
	private pitchTo = 0;
	private spunAt = -99;
	private drag: {
		id: number;
		x: number;
		y: number;
		yaw: number;
		pitch: number;
		moved: boolean;
		sample: { yaw: number; t: number };
	} | null = null;
	private W = 1;
	private H = 1;
	private frameH = 1;
	private dist = 40;
	private hv = 20;
	private clock = 0;
	private shadowTick = 0;
	private ray = new THREE.Raycaster();
	private ndc = new THREE.Vector2();
	private viewYaw = 0;
	private listeners: [string, EventListener][] = [];

	constructor(
		public canvas: HTMLCanvasElement,
		public islet: Islet,
		readonly reduced: boolean
	) {
		const r = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			premultipliedAlpha: true,
			antialias: true,
			powerPreference: 'high-performance'
		});
		r.setClearColor(0x000000, 0);
		r.outputColorSpace = THREE.SRGBColorSpace;
		r.toneMapping = THREE.CustomToneMapping;
		r.shadowMap.enabled = true;
		r.shadowMap.type = THREE.PCFShadowMap;
		r.shadowMap.autoUpdate = false;
		this.renderer = r;
		this.key.castShadow = true;
		this.key.shadow.mapSize.set(1024, 1024);
		const sc = this.key.shadow.camera;
		sc.left = sc.bottom = -6;
		sc.right = sc.top = 6;
		sc.near = 1;
		sc.far = 60;
		this.key.shadow.bias = -0.0004;
		this.key.shadow.normalBias = 0.03;
		this.key.shadow.radius = 3;
		this.key.shadow.camera.layers.enable(SHADOW_LAYER);
		this.scene.add(this.key, this.key.target, this.hemi, islet.group);
		this.gateShadowLayer();
		this.air = new Air(islet.habitat(this));
		islet.group.add(this.air.group, this.notes.points);
		// for the line round the gramophone: the machine, and the solid
		// things that can stand between it and the eye
		islet.gram.group.traverse((o) => o.layers.enable(GRAM_LAYER));
		for (const o of [...islet.solid, islet.tree?.bark].filter(Boolean) as THREE.Object3D[])
			o.traverse((c) => c.layers.enable(OCCLUDER_LAYER));
		this.outline.mat.uniforms.uMask.value = this.gramMask.texture;
		// the moon hangs in the view, not on the islet: it stays where it is as
		// the islet is turned
		this.camera.add(this.moon);
		this.scene.add(this.camera);
		this.bind();
	}

	/** the lights changing over: the doves go for the night, or come back */
	setDay(day: boolean) {
		this.air.setDay(day);
	}

	/** the skies it reflects, by day and by night: made apart, being the dearest part of it */
	skies() {
		if (this.envDay) return;
		const r = this.renderer;
		this.envDay = skyEnv(r, [0.16, 0.3, 0.64], [0.55, 0.64, 0.78], [0.62, 0.6, 0.6]);
		this.envNight = skyEnv(r, [0.02, 0.028, 0.056], [0.06, 0.07, 0.1], [0.05, 0.056, 0.078]);
		// and by night the brass has the lamplit room the grove gives it
		const pm = new THREE.PMREMGenerator(r);
		this.envRoom = pm.fromScene(lampRoom(), 0, 0.05, 50).texture;
		pm.dispose();
	}

	/** The maple's shadow is cast by a thinned set of its leaves on a layer of
	 *  their own, which the shadow pass sees only between these two marks (as
	 *  the grove does it: see its gateShadowLayer). */
	private gateShadowLayer() {
		const mark = (fn: 'onBeforeShadow' | 'onAfterShadow', open: boolean) => {
			const m = new THREE.Mesh(
				new THREE.BufferGeometry().setAttribute(
					'position',
					new THREE.Float32BufferAttribute([], 3)
				),
				new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
			);
			m.castShadow = true;
			m.frustumCulled = false;
			m[fn] = (_r, _o, camera) => {
				if (open) camera.layers.enable(SHADOW_LAYER);
				else camera.layers.disable(SHADOW_LAYER);
			};
			return m;
		};
		const open = mark('onBeforeShadow', true),
			close = mark('onAfterShadow', false);
		this.scene.add(open, close);
		// the opening mark first of all
		this.scene.children.splice(this.scene.children.indexOf(open), 1);
		this.scene.children.unshift(open);
	}

	/** Make its programs now, against its lights, so the first paper opened
	 *  does not wait for them: compiled, then drawn once, shadows and all. */
	async compile() {
		this.skies();
		this.islet.group.visible = true;
		this.scene.environment = this.envDay;
		this.frame(1, 1, 1, 1);
		try {
			await this.renderer.compileAsync(this.scene, this.camera);
		} catch {
			/* the first frame compiles instead */
		}
	}

	/** and drawn once, small, which makes the shadows' programs too */
	warm() {
		this.renderer.shadowMap.needsUpdate = true;
		this.renderer.render(this.scene, this.camera);
		if (!this.active) this.islet.group.visible = false;
	}

	/** its canvas's size, in the page's pixels, and the top part of it the
	 *  islet is framed in (the rest is for the fall) */
	frame(w: number, h: number, frameH: number, dpr: number) {
		this.W = Math.max(1, w);
		this.H = Math.max(1, h);
		this.frameH = Math.max(1, Math.min(frameH, h));
		this.renderer.setPixelRatio(dpr);
		this.renderer.setSize(this.W, this.H, false);
		const cam = this.camera;
		cam.aspect = this.W / this.H;
		const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
		const F = ISLET_FRAME;
		const dW = F.w / (0.86 * 2 * tan * cam.aspect);
		const dH = (F.top - F.foot) / ((this.frameH / this.H) * 0.95 * 2 * tan);
		this.dist = Math.max(dW, dH);
		this.hv = 2 * this.dist * tan;
		// the islet's middle at the middle of its part of the canvas
		const fy = this.frameH / 2 / this.H;
		cam.setViewOffset(this.W, this.H, 0, (0.5 - fy) * this.H, this.W, this.H);
		cam.near = Math.max(0.5, this.dist - 16);
		cam.far = Math.max(this.dist + 60, MOON_D + 20);
		cam.updateProjectionMatrix();
		this.islet.setScale((this.H * dpr) / (2 * tan), dpr);
		// the moon: where it hangs on the canvas, as a point in the camera's own
		// space, and as big as its radius on screen asks at that distance
		const v = new THREE.Vector3(
			MOON_AT[0] * 2 - 1,
			1 - 2 * ((MOON_AT[1] * this.frameH) / this.H),
			0.5
		).applyMatrix4(cam.projectionMatrixInverse);
		this.moon.position.copy(v.multiplyScalar(-MOON_D / v.z));
		const perM = this.H / (2 * tan) / MOON_D;
		this.moon.scale.setScalar((2 * (MOON_R / perM)) / 0.68);
		this.pxPerUnit = (this.H * dpr) / (2 * tan);
		const bw = Math.max(1, Math.round(this.W * dpr)),
			bh = Math.max(1, Math.round(this.H * dpr));
		this.gramMask.setSize(bw, bh);
		this.outline.mat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
	}
	private pxPerUnit = 1000;

	open() {
		this.to = 1;
		// the doves, the first time: already where they would be
		if (!this.air.begun) this.air.settle();
		if (this.k === 0) {
			this.yaw = 0;
			this.yawVel = 0;
			this.pitch = this.pitchTo = 0;
		}
		if (this.reduced) this.k = 1;
	}

	close() {
		this.to = 0;
		this.drag = null;
		if (this.reduced) this.k = 0;
	}

	/** still coming, there, or going: anything to draw */
	get active() {
		return this.k > 0 || this.to > 0;
	}

	/** A frame: its turn, its light, and the picture. False once it is gone. */
	step(dt: number, L: Lights) {
		this.clock += dt;
		if (this.k !== this.to) {
			const rate = this.to > this.k ? 1 / 1.5 : 1 / 0.55;
			this.k = this.to > this.k ? Math.min(1, this.k + dt * rate) : Math.max(0, this.k - dt * rate);
		}
		if (!this.active) {
			this.islet.group.visible = false;
			return false;
		}
		this.skies();
		this.islet.group.visible = true;
		// a throw spins on and slows; left alone a while, it goes home. While a
		// record plays it turns slowly round, as the grove does.
		this.orbit = damp(this.orbit, L.playing && !this.reduced ? 0.09 : 0, 0.5, dt);
		if (this.orbit > 0.004) this.spunAt = this.clock;
		if (!this.drag) {
			this.yaw += (this.yawVel + this.orbit) * dt;
			const home = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2;
			if (!this.reduced && this.clock - this.spunAt > 5 && Math.abs(this.yawVel) < 0.4) {
				const w = 0.9;
				this.yawVel += (-(w * w) * (this.yaw - home) - 2 * w * this.yawVel) * dt;
			} else this.yawVel *= Math.exp(-dt * 0.9);
			this.pitchTo = damp(this.pitchTo, 0, this.reduced ? 20 : 0.9, dt);
		}
		this.pitch = damp(this.pitch, this.pitchTo, 12, dt);

		// up out of the glass into its place, turning a little as it comes
		const rise = 1 - easeOut(this.k);
		const drift = this.reduced ? 0 : Math.sin(this.clock * 0.05) * 0.08;
		const yaw = this.yaw + YAW0 + drift - 0.5 * rise;
		this.viewYaw = yaw;
		const pitch = THREE.MathUtils.degToRad(13) + this.pitch;
		const F = ISLET_FRAME;
		const target = new THREE.Vector3(0, (F.top + F.foot) / 2 + rise * 0.3 * this.hv, 0);
		const cam = this.camera;
		cam.position.set(
			target.x + Math.sin(yaw) * Math.cos(pitch) * this.dist,
			target.y + Math.sin(pitch) * this.dist,
			target.z + Math.cos(yaw) * Math.cos(pitch) * this.dist
		);
		cam.lookAt(target);
		cam.updateMatrixWorld();
		this.canvas.style.opacity = String(clamp(this.k * 1.8, 0, 1));

		// the grove's light, turned with the view as the grove turns its own
		this.key.color.copy(L.key.color);
		this.key.intensity = L.key.intensity;
		this.key.target.position.set(0, 0.5, 0);
		this.key.position
			.copy(L.keyDir)
			.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
			.multiplyScalar(30)
			.add(this.key.target.position);
		this.hemi.color.copy(L.hemi.color);
		this.hemi.groundColor.copy(L.hemi.groundColor);
		this.hemi.intensity = L.hemi.intensity;
		this.scene.environment = L.day > 0.5 ? this.envDay : this.envNight;
		this.scene.environmentIntensity = L.envIntensity;
		this.scene.environmentRotation.set(0, yaw, 0);
		// (a little more by night than the grove has: the islet is seen against
		// dark glass, not against a sky with a moon in it)
		this.renderer.toneMappingExposure = L.exposure * lerp(1.22, 1, L.day);
		// the leaves lit from behind read the light in this camera's terms
		U.uSunView.value
			.copy(this.key.position)
			.sub(this.key.target.position)
			.normalize()
			.transformDirection(cam.matrixWorldInverse);

		// the moon out by night, faint in the day's sky
		const mu = (this.moon.material as THREE.ShaderMaterial).uniforms;
		// (gone in the full day, as the grove's is)
		mu.uOn.value = (1 - smoothstep(0.55, 0.85, L.day)) * clamp(this.k * 1.5, 0, 1);
		mu.uGlow.value = 1 - smoothstep(0.3, 0.7, L.day);
		this.moon.visible = mu.uOn.value > 0.002;
		// by night the brass shines with the lamplit room; by day with the day
		this.islet.brass.envMap = L.day > 0.5 ? null : this.envRoom;
		this.islet.update(dt, 1 - L.day, this.reduced, L.playing);
		// the doves: put up when it is turned, as the grove's are
		const spinning = !!this.drag?.moved || Math.abs(this.yawVel) > 0.35;
		if (spinning && !this.wasSpinning && (Math.abs(this.yawVel) > 0.8 || this.drag?.moved))
			this.air.startle();
		if (spinning || Math.abs(this.yawVel) < 0.2) this.wasSpinning = spinning;
		this.air.update(dt, true, yaw, spinning);
		// the machine: lit under the hand, and the notes out of its horn
		this.gramGlow = damp(this.gramGlow, this.overGram ? 1 : 0, 9, dt);
		this.islet.gram.hover.value = this.gramGlow * 0.6;
		const gg = this.islet.gram.group;
		this.mouth.copy(this.islet.gram.mouth).applyMatrix4(gg.matrix);
		this.mouthDir.copy(this.islet.gram.mouthDir).transformDirection(gg.matrix);
		this.notes.update(
			dt,
			L.playing ? L.level : 0,
			L.playing && !this.reduced,
			this.mouth,
			this.mouthDir,
			this.pxPerUnit * 0.36
		);
		// the shadows a few times a second, or every frame while it turns
		this.shadowTick = (this.shadowTick + 1) % 4;
		this.renderer.shadowMap.needsUpdate =
			this.shadowTick === 0 || !!this.drag || Math.abs(this.yawVel) > 0.02 || this.k < 1;
		this.renderer.render(this.scene, cam);
		this.drawOutline();
		return true;
	}

	/**
	 * While the gramophone is under the pointer, the line round it: a mask of
	 * it (the solid things in front drawn first into depth alone, so that
	 * they hide the line too, then the machine in white), and the ring read
	 * from it laid over the picture. Nothing at all otherwise.
	 */
	private drawOutline() {
		const on = this.gramGlow;
		this.outline.mat.uniforms.uOn.value = on;
		if (on < 0.002) return;
		const r = this.renderer,
			cam = this.camera,
			scene = this.scene;
		const keep = {
			layers: cam.layers.mask,
			shadows: r.shadowMap.needsUpdate,
			bg: scene.background
		};
		r.shadowMap.needsUpdate = false;
		r.setRenderTarget(this.gramMask);
		r.setClearColor(0x000000, 1);
		r.clear();
		r.autoClear = false;
		cam.layers.set(OCCLUDER_LAYER);
		scene.overrideMaterial = this.maskDepth;
		r.render(scene, cam);
		cam.layers.set(GRAM_LAYER);
		scene.overrideMaterial = this.maskWhite;
		r.render(scene, cam);
		scene.overrideMaterial = null;
		cam.layers.mask = keep.layers;
		r.setRenderTarget(null);
		r.setClearColor(0x000000, 0);
		r.render(this.outline.scene, this.flat);
		r.autoClear = true;
		r.shadowMap.needsUpdate = keep.shadows;
	}

	// ── the hand ──────────────────────────────────────────────────────────
	private point(e: PointerEvent) {
		const r = this.canvas.getBoundingClientRect();
		this.ndc.set(
			((e.clientX - r.left) / r.width) * 2 - 1,
			-((e.clientY - r.top) / r.height) * 2 + 1
		);
		this.ray.setFromCamera(this.ndc, this.camera);
	}

	/** what is under the pointer: the gramophone, the maple's crown, the water, the rest of the islet, or nothing */
	private pick(): 'gram' | 'tree' | 'pool' | 'islet' | null {
		const ray = this.ray.ray;
		const g = this.islet.gram;
		const box = g.hit.clone().applyMatrix4(g.group.matrix);
		if (ray.intersectsBox(box)) return 'gram';
		const t = this.islet.tree;
		// the crown as a squashed ball, as wide as it reaches and as high as the tree
		const rh = t.crownR * 0.85,
			k = rh / Math.max(t.height + t.items[0].pos.y - t.crown.y, 1);
		const e = new THREE.Ray(
			ray.origin
				.clone()
				.sub(t.crown)
				.setY((ray.origin.y - t.crown.y) * k),
			new THREE.Vector3(ray.direction.x, ray.direction.y * k, ray.direction.z).normalize()
		);
		if (e.distanceSqToPoint(new THREE.Vector3()) < rh * rh) return 'tree';
		const first = this.ray.intersectObjects(this.islet.solid, true)[0];
		if (first) return first.object === this.islet.pool ? 'pool' : 'islet';
		return null;
	}

	private on(type: string, fn: EventListener) {
		this.canvas.addEventListener(type, fn);
		this.listeners.push([type, fn]);
	}

	private bind() {
		this.on('pointerdown', ((e: PointerEvent) => {
			if (!this.active) return;
			this.point(e);
			this.yawVel = 0;
			this.drag = {
				id: e.pointerId,
				x: e.clientX,
				y: e.clientY,
				yaw: this.yaw,
				pitch: this.pitchTo,
				moved: false,
				sample: { yaw: this.yaw, t: performance.now() }
			};
			this.canvas.setPointerCapture(e.pointerId);
		}) as EventListener);
		this.on('pointermove', ((e: PointerEvent) => {
			const d = this.drag;
			if (!d || d.id !== e.pointerId) {
				// over the islet, a hand that can take hold of it
				if (e.pointerType === 'mouse' && this.active) {
					this.point(e);
					const hit = this.pick();
					this.overGram = hit === 'gram';
					this.canvas.style.cursor = hit === 'gram' ? 'pointer' : hit ? 'grab' : '';
				}
				return;
			}
			const dx = e.clientX - d.x,
				dy = e.clientY - d.y;
			if (Math.hypot(dx, dy) > 4) d.moved = true;
			this.canvas.style.cursor = 'grabbing';
			this.yaw = d.yaw - (dx / Math.max(this.W, 400)) * 3.2;
			this.pitchTo = clamp(d.pitch + (dy / this.frameH) * 0.9, -0.14, 0.4);
			const now = performance.now();
			const dt = (now - d.sample.t) / 1000;
			if (dt > 0.004) {
				const v = (this.yaw - d.sample.yaw) / dt;
				this.yawVel = lerp(this.yawVel, clamp(v, -8, 8), Math.min(1, dt * 18));
				d.sample = { yaw: this.yaw, t: now };
			}
		}) as EventListener);
		const up = ((e: PointerEvent) => {
			const d = this.drag;
			if (!d || d.id !== e.pointerId) return;
			this.drag = null;
			this.spunAt = this.clock;
			this.canvas.style.cursor = '';
			if (performance.now() - d.sample.t > 90 || this.reduced) this.yawVel = 0;
			if (d.moved || e.type !== 'pointerup') return;
			// a tap, not a turn
			this.point(e);
			const hit = this.pick();
			if (hit === 'gram') this.onGramophone?.();
			else if (hit === 'tree') {
				const t = this.islet.tree;
				const at = this.ray.ray.closestPointToPoint(t.crown, new THREE.Vector3());
				rustleFrom(at, 1);
				if (!this.reduced) this.islet.shake(at, 14);
			} else if (hit === 'pool') {
				const w = this.ray.intersectObject(this.islet.pool, false)[0];
				if (w) this.islet.splash(w.point);
			} else if (!hit) this.onMiss?.();
		}) as EventListener;
		this.on('pointerup', up);
		this.on('pointercancel', up);
	}

	dispose() {
		for (const [type, fn] of this.listeners) this.canvas.removeEventListener(type, fn);
		this.envDay?.dispose();
		this.envNight?.dispose();
		this.envRoom?.dispose();
		this.gramMask.dispose();
		this.renderer.dispose();
	}
}
