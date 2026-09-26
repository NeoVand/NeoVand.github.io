import * as THREE from 'three';
import { U, graded } from './shared';
import { GramOutline, GRAM_LAYER, OCCLUDER_LAYER } from './outline';
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
// grove's wind, and the grove's clock runs it. It comes out of the paper's
// deck with the pages as the room opens, and goes back into it with them as
// it closes; a hand turns it and tilts it; a
// tap in the crown shakes leaves down, a tap on the water rings it, a tap on
// the gramophone plays a record (the same one the grove's plays), and a tap
// on nothing at all closes the room, as a tap on the glass would. Its doves
// are the grove's kind, and do as they do; and the moon hangs by it.

/** how the islet is first seen: turned a little, so the fall shows */
const YAW0 = 0.3;

/** the grove's light as it is now, for the islet to be lit the same */
export interface Lights {
	key: THREE.DirectionalLight;
	keyDir: THREE.Vector3;
	hemi: THREE.HemisphereLight;
	day: number;
	exposure: number;
	/** the grade's warm lights and cool shadows, 0..1 */
	warm: number;
	envIntensity: number;
	/** whether a record is playing, and how loud it is now */
	playing: boolean;
	level: number;
	/** the grove's moon's radius on the screen, in the page's pixels */
	moonPx: number;
}

/** where on the canvas the moon hangs: across it, and down its framed part */
const MOON_AT = [0.79, 0.2];
/** how far off it is drawn */
const MOON_D = 80;
/** the disc's radius on its plane, the plane being a unit square (a margin round it for its edge) */
const MOON_DISC = 0.47;

/**
 * The moon, as the grove's sky draws it: the same painting, read a little
 * inside its own edge, with the same brightness and contrast and the same
 * light, so that the moon over the islet is the grove's moon. No glow of
 * its own: the grove's has none.
 */
function moonMesh() {
	const m = new THREE.ShaderMaterial({
		uniforms: { uMap: { value: moonTexture() }, uOn: { value: 0 }, uGain: { value: 2.4 } },
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			uniform sampler2D uMap;
			uniform float uOn;
			uniform float uGain;
			varying vec2 vUv;
			void main() {
				vec2 p = (vUv * 2.0 - 1.0) / ${(MOON_DISC * 2).toFixed(2)};
				float r = length(p);
				float w = max(fwidth(r), 1e-4);
				float disc = 1.0 - smoothstep(1.0 - w, 1.0 + w, r);
				if (disc < 0.002) discard;
				float face = texture2D(uMap, 0.5 + p * 0.415).r;
				float v = clamp((face * 1.28 - 0.5) * 1.06 + 0.5, 0.0, 1.0);
				gl_FragColor = vec4(vec3(1.0, 0.975, 0.93) * uGain * pow(v, 2.2), 1.0);
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
				gl_FragColor = vec4(gl_FragColor.rgb * disc * uOn, disc * uOn);
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
	/** the line round the gramophone under the pointer */
	private outline = new GramOutline();
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

	/** and drawn once, small, which makes the shadows' programs too (and
	 *  the shadow maps themselves, which a draw without them would sample
	 *  unmade: WebKit refuses such a draw outright) */
	warm() {
		this.islet.group.visible = true;
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
		// (the page's pixels to a unit, at the moon's distance: sized in step)
		this.moonPerM = this.H / (2 * tan) / MOON_D;
		this.pxPerUnit = (this.H * dpr) / (2 * tan);
		const bw = Math.max(1, Math.round(this.W * dpr)),
			bh = Math.max(1, Math.round(this.H * dpr));
		this.outline.setSize(bw, bh);
	}
	private pxPerUnit = 1000;
	private moonPerM = 1;

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

	/** gone at once: the room carries it away itself (see ReadingRoom) */
	close() {
		this.to = 0;
		this.k = 0;
		this.drag = null;
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

		// turning a little into its place as it comes (the room brings it, out
		// of the paper's deck, with the pages)
		const rise = 1 - easeOut(this.k);
		const drift = this.reduced ? 0 : Math.sin(this.clock * 0.05) * 0.08;
		const yaw = this.yaw + YAW0 + drift - 0.45 * rise;
		this.viewYaw = yaw;
		const pitch = THREE.MathUtils.degToRad(13) + this.pitch;
		const F = ISLET_FRAME;
		const target = new THREE.Vector3(0, (F.top + F.foot) / 2, 0);
		const cam = this.camera;
		cam.position.set(
			target.x + Math.sin(yaw) * Math.cos(pitch) * this.dist,
			target.y + Math.sin(pitch) * this.dist,
			target.z + Math.cos(yaw) * Math.cos(pitch) * this.dist
		);
		cam.lookAt(target);
		cam.updateMatrixWorld();

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
		this.renderer.toneMappingExposure = graded(L.exposure * lerp(1.22, 1, L.day), L.warm);
		// the leaves lit from behind read the light in this camera's terms
		U.uSunView.value
			.copy(this.key.position)
			.sub(this.key.target.position)
			.normalize()
			.transformDirection(cam.matrixWorldInverse);

		// the moon out by night, as big as the grove's and as bright (the
		// exposure here being a little more by night, its light a little less),
		// and gone in the full day, as the grove's is
		const mu = (this.moon.material as THREE.ShaderMaterial).uniforms;
		mu.uOn.value = 1 - smoothstep(0.55, 0.85, L.day);
		mu.uGain.value = 2.4 / lerp(1.22, 1, L.day);
		this.moon.scale.setScalar(L.moonPx / this.moonPerM / MOON_DISC);
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
		this.outline.draw(this.renderer, this.scene, cam, this.gramGlow);
		return true;
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
		this.outline.dispose();
		this.renderer.dispose();
	}
}
