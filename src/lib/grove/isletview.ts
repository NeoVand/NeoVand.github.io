import * as THREE from 'three';
import { U } from './shared';
import { Islet, ISLET_FRAME } from './islet';
import { SHADOW_LAYER } from './flora/plants';
import { rustleFrom } from './flora/wind';
import { clamp, damp, easeOut, lerp } from './rng';

// ─── The islet, over the reading room ─────────────────────────────────────
// While a paper is open the page lies under frosted glass, and over the glass,
// in the corner the words leave free, the islet floats: drawn by a renderer of
// its own onto a canvas with nothing behind it, so the glass shows round it.
// It keeps the grove's hours: its light is the grove's light, its wind the
// grove's wind, and the grove's clock runs it. It comes up into its place as
// the room opens and sinks away as it closes; a hand turns it and tilts it; a
// tap in the crown shakes leaves down, a tap on the water rings it, and a tap
// on nothing at all closes the room, as a tap on the glass would.

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
		private reduced: boolean
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
		this.bind();
	}

	/** the skies it reflects, by day and by night: made apart, being the dearest part of it */
	skies() {
		if (this.envDay) return;
		const r = this.renderer;
		this.envDay = skyEnv(r, [0.16, 0.3, 0.64], [0.55, 0.64, 0.78], [0.62, 0.6, 0.6]);
		this.envNight = skyEnv(r, [0.02, 0.028, 0.056], [0.06, 0.07, 0.1], [0.05, 0.056, 0.078]);
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
		cam.far = this.dist + 60;
		cam.updateProjectionMatrix();
		this.islet.setScale((this.H * dpr) / (2 * tan), dpr);
	}

	open() {
		this.to = 1;
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
		// a throw spins on and slows; left alone a while, it goes home
		if (!this.drag) {
			this.yaw += this.yawVel * dt;
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

		this.islet.update(dt, 1 - L.day, this.reduced);
		// the shadows a few times a second, or every frame while it turns
		this.shadowTick = (this.shadowTick + 1) % 4;
		this.renderer.shadowMap.needsUpdate =
			this.shadowTick === 0 || !!this.drag || Math.abs(this.yawVel) > 0.02 || this.k < 1;
		this.renderer.render(this.scene, cam);
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

	/** what is under the pointer: the maple's crown, the water, the rest of the islet, or nothing */
	private pick(): 'tree' | 'pool' | 'islet' | null {
		const ray = this.ray.ray;
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
					this.canvas.style.cursor = this.pick() ? 'grab' : '';
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
			if (hit === 'tree') {
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
		this.renderer.dispose();
	}
}
