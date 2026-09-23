import * as THREE from 'three';
import { U } from './shared';
import { createSky } from './sky';
import { brickTextures, lawnTexture, barkTextures, woodTexture } from './textures';
import { buildIsland, ISLAND, type IslandParts } from './island';
import { buildPavilion, type PavilionParts } from './pavilion';
import { buildGramophone, type Gramophone } from './gramophone';
import { buildStand, type TreeHandles, type StandItem } from './trees';
import { SPECIES, SHRUB } from './lsystem';
import { patch, nightPatch } from './shared';
import { rng, clamp, damp, easeInOut, lerp, smoothstep } from './rng';
import { Air } from './air';

// ─── The grove, in three dimensions ───────────────────────────────────────
// One renderer behind the whole page. At the top of it the island hangs in
// the evening with its trees and its pavilion; scroll, and the camera sinks
// past the island's underside into the sky the rest of the page is set in.

export interface GroveOptions {
	canvas: HTMLCanvasElement;
	day: boolean;
	reduced: boolean;
	seed?: number;
	onGramophone?: () => void;
}

type Layout = 'side' | 'stack';

const SUN_DIR = new THREE.Vector3(0.9, 0.22, -0.36).normalize();
// The moon hangs low over the cloud, in the picture: between the island and
// the words where they stand side by side, over the island where they stack.
// It is a mood, not an almanac.
const moonAt = (azDeg: number, elDeg: number) => {
	const az = THREE.MathUtils.degToRad(azDeg),
		el = THREE.MathUtils.degToRad(elDeg);
	return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
};
const MOON_DIR = moonAt(12, 6.5);

export class Grove {
	renderer: THREE.WebGLRenderer;
	scene = new THREE.Scene();
	camera: THREE.PerspectiveCamera;
	sky = createSky();
	private light: THREE.DirectionalLight;
	private hemi: THREE.HemisphereLight;
	private envDay: THREE.Texture | null = null;
	private envNight: THREE.Texture | null = null;
	private moonDir = MOON_DIR.clone();
	private world = new THREE.Group();
	island!: IslandParts;
	pavilion!: PavilionParts;
	gramophone!: Gramophone;
	trees: TreeHandles[] = [];
	shrubs!: TreeHandles;
	air!: Air;
	private mats!: {
		brick: THREE.MeshStandardMaterial;
		copper: THREE.MeshStandardMaterial;
		bark: { map: THREE.Texture; normalMap: THREE.Texture };
	};

	readonly reduced: boolean;
	private raf = 0;
	private last = 0;
	private clock = 0;
	private running = false;
	private dayMix: number;
	private dayTo: number;
	private layout: Layout = 'side';
	private W = 1;
	private H = 1;
	private dist = 30;
	private hv = 16;
	private scroll = 0;
	private scrollSmooth = 0;
	private yaw = 0;
	private yawVel = 0;
	private pitchNudge = 0;
	private pointerNdc = new THREE.Vector2(0, 0);
	private pointerOn = false;
	private ptrAmp = 0;
	private drag: {
		id: number;
		x: number;
		y: number;
		yaw: number;
		moved: boolean;
		t: number;
	} | null = null;
	private pressed: TreeHandles | null = null;
	private growth = new Map<TreeHandles, { g: number; to: number; pop: number; popV: number }>();
	private intro = { t: -1, dur: 3.4 };
	private dpr = 1;
	private dprCap = 2;
	private frameTimes: number[] = [];
	private ray = new THREE.Raycaster();
	private playing = false;
	private crankA = 0;
	private shadowTick = 0;
	private rand: () => number;
	private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
	onGramophone?: () => void;

	constructor(opts: GroveOptions) {
		this.reduced = opts.reduced;
		this.dayMix = this.dayTo = opts.day ? 1 : 0;
		this.onGramophone = opts.onGramophone;
		this.rand = rng(opts.seed ?? Date.now() & 0xffff);
		const r = new THREE.WebGLRenderer({
			canvas: opts.canvas,
			antialias: true,
			alpha: false,
			powerPreference: 'high-performance',
			stencil: false
		});
		r.outputColorSpace = THREE.SRGBColorSpace;
		r.toneMapping = THREE.ACESFilmicToneMapping;
		r.toneMappingExposure = 1.0;
		r.shadowMap.enabled = true;
		r.shadowMap.type = THREE.PCFShadowMap;
		// redrawn every other frame: see update()
		r.shadowMap.autoUpdate = false;
		r.shadowMap.needsUpdate = true;
		this.renderer = r;
		const phone = Math.min(screen.width, screen.height) < 600;
		this.dprCap = Math.min(window.devicePixelRatio || 1, phone ? 2 : 2);
		this.dpr = this.dprCap;

		this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
		this.sky.uniforms.uSun.value.copy(SUN_DIR);
		this.sky.uniforms.uMoon.value.copy(this.moonDir);
		// The sky fills every pixel with an opaque colour first. Leaves cut out
		// by alpha-to-coverage then write their partial alpha into the canvas,
		// and a browser that composites the canvas's alpha (WebKit does, even
		// asked not to) shows the page's own ground through every leaf edge as
		// a speck of blue. So nothing after the sky writes alpha; draw() turns
		// it back on at the end of the frame, for the shadow pass, which packs
		// depth into all four channels.
		const gl = r.getContext();
		this.sky.backdrop.onAfterRender = () => gl.colorMask(true, true, true, false);
		this.scene.add(this.sky.backdrop);
		this.scene.add(this.world);

		this.light = new THREE.DirectionalLight(0xffffff, 2.5);
		this.light.castShadow = true;
		const sm = phone ? 1024 : 2048;
		this.light.shadow.mapSize.set(sm, sm);
		const sc = this.light.shadow.camera;
		sc.left = sc.bottom = -11;
		sc.right = sc.top = 11;
		sc.near = 1;
		sc.far = 70;
		this.light.shadow.bias = -0.0004;
		this.light.shadow.normalBias = 0.03;
		this.light.shadow.radius = 3;
		this.scene.add(this.light, this.light.target);
		this.hemi = new THREE.HemisphereLight(0xa8bddb, 0x8a6048, 0.6);
		this.scene.add(this.hemi);

		this.build();
		this.air = new Air(this);
		this.world.add(this.air.group);
		this.applyDay(this.dayMix);
		this.bind();
		this.resize();
	}

	// ── building ──────────────────────────────────────────────────────────
	private build() {
		const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
		const bricks = brickTextures(aniso);
		const bark = barkTextures(aniso);
		const brick = patch(
			new THREE.MeshStandardMaterial({
				map: bricks.map,
				normalMap: bricks.normalMap,
				normalScale: new THREE.Vector2(1.1, 1.1),
				roughness: 0.9,
				metalness: 0
			}),
			'brick',
			nightPatch
		);
		const copper = patch(
			new THREE.MeshStandardMaterial({ color: 0xc9825a, metalness: 1, roughness: 0.3 }),
			'copper',
			nightPatch
		);
		this.mats = { brick, copper, bark };

		this.island = buildIsland(brick, copper, lawnTexture(aniso));
		this.world.add(this.island.group);
		this.pavilion = buildPavilion(brick, copper);
		this.world.add(this.pavilion.group);
		this.gramophone = buildGramophone(copper, woodTexture(aniso));
		this.gramophone.group.position.set(0.05, this.pavilion.floorY, 0.1);
		this.gramophone.group.rotation.y = 0.18;
		this.world.add(this.gramophone.group);

		this.plant();
	}

	/** Deal the stand: every species at least once, the rest at random. */
	private plant() {
		const r = this.rand;
		const phone = Math.min(window.innerWidth, window.innerHeight) < 700;
		const n = phone ? 5 : 6;
		// slots round the back and sides; the front is left open to the doorway
		const slots: THREE.Vector3[] = [];
		let guard = 0;
		while (slots.length < n && guard++ < 500) {
			const a = lerp(1.35, Math.PI * 2 - 1.35, r());
			const rad = lerp(3.9, 5.6, r());
			const p = new THREE.Vector3(Math.sin(a) * rad, 0, Math.cos(a) * rad);
			if (slots.every((s) => s.distanceTo(p) > 2.7)) slots.push(p);
		}
		const order = SPECIES.map((_, i) => i).sort(() => r() - 0.5);
		while (order.length < slots.length) order.push(Math.floor(r() * SPECIES.length));
		// the tallest toward the back
		slots.sort((a, b) => b.z - a.z);
		this.trees = slots.map((pos, i) =>
			this.plantTree({
				sp: SPECIES[order[i]],
				seed: Math.floor(r() * 1e6),
				pos,
				rotY: r() * Math.PI * 2,
				heightScale: lerp(0.86, 1.04, i / Math.max(1, slots.length - 1))
			})
		);

		// undergrowth along the lip and round the pavilion's foot
		const items: StandItem[] = [];
		const places: THREE.Vector3[] = [];
		guard = 0;
		const want = phone ? 13 : 17;
		while (places.length < want && guard++ < 800) {
			const a = r() * Math.PI * 2;
			const nearPav = r() < 0.3;
			const rad = nearPav ? lerp(2.75, 3.3, r()) : lerp(5.3, 6.2, r());
			const p = new THREE.Vector3(Math.sin(a) * rad, 0, Math.cos(a) * rad);
			// keep the path and the doorway clear
			if (Math.abs(p.x) < 1.1 && p.z > 1.5) continue;
			if (places.some((q) => q.distanceTo(p) < 1.2)) continue;
			if (this.trees.some((t) => t.items[0].pos.distanceTo(p) < 1.0)) continue;
			places.push(p);
			items.push({
				sp: SHRUB,
				seed: Math.floor(r() * 1e6),
				pos: p,
				rotY: r() * Math.PI * 2,
				heightScale: lerp(0.8, 1.2, r()),
				sOffset: r() * 0.8
			});
		}
		this.shrubs = buildStand(items, {
			barkMap: this.mats.bark.map,
			barkNormal: this.mats.bark.normalMap
		});
		this.world.add(this.shrubs.group);
		this.growth.set(this.shrubs, { g: 1, to: 1, pop: 0, popV: 0 });
		this.shadeLawn();
	}

	private plantTree(item: StandItem) {
		const t = buildStand([item], {
			barkMap: this.mats.bark.map,
			barkNormal: this.mats.bark.normalMap
		});
		this.world.add(t.group);
		this.growth.set(t, { g: 1, to: 1, pop: 0, popV: 0 });
		return t;
	}

	/** Darken the grass under each crown and round the pavilion's foot. */
	private shadeLawn() {
		const blobs = this.island.lawnU.uBlobs.value;
		blobs.forEach((b) => b.set(0, 0, 1, 0));
		blobs[0].set(0, 0, 3.1, 0.35);
		this.trees.forEach((t, i) => {
			const p = t.items[0].pos;
			blobs[i + 1].set(p.x, p.z, 1.9, 0.38);
		});
	}

	/** A tree that has gone completely comes back as a different species. */
	private replant(t: TreeHandles) {
		const i = this.trees.indexOf(t);
		if (i < 0) return t;
		const old = t.items[0];
		const others = SPECIES.filter((s) => s !== old.sp);
		const sp = others[Math.floor(this.rand() * others.length)];
		this.world.remove(t.group);
		t.dispose();
		this.growth.delete(t);
		const nt = this.plantTree({ ...old, sp, seed: Math.floor(this.rand() * 1e6) });
		this.trees[i] = nt;
		const st = this.growth.get(nt)!;
		st.g = 0;
		st.to = 1;
		nt.u.uGrow.value = 0;
		this.air.replanted(t, nt);
		return nt;
	}

	// ── the light ─────────────────────────────────────────────────────────
	private async bakeEnvironment() {
		const pm = new THREE.PMREMGenerator(this.renderer);
		const envScene = new THREE.Scene();
		const skyMat = this.sky.mesh.material as THREE.ShaderMaterial;
		const cap = new THREE.Mesh(this.sky.mesh.geometry, skyMat);
		envScene.add(cap);
		const u = this.sky.uniforms;
		const keep = u.uMix.value;
		u.uStars.value = 0;
		u.uMix.value = 1;
		this.envDay = pm.fromScene(envScene, 0, 0.1, 100).texture;
		u.uMix.value = 0;
		this.envNight = pm.fromScene(envScene, 0, 0.1, 100).texture;
		u.uMix.value = keep;
		u.uStars.value = 1;
		pm.dispose();
	}

	private applyDay(m: number) {
		U.uNight.value = 1 - m;
		this.sky.uniforms.uMix.value = m;
		if (this.W > 1) this.sizeSky();
		// the light swings from the moon's quarter to the sun's
		// the moon is behind the island from here, so by night it is drawn in
		// its rim light, with a cool fill from the sky to keep its shape
		const moonLight = this.moonDir.clone().setY(Math.max(this.moonDir.y, 0.28)).normalize();
		const dir = moonLight.lerp(SUN_DIR, smoothstep(0, 1, m)).normalize();
		this.light.position.copy(dir).multiplyScalar(30);
		const sunCol = new THREE.Color(1.0, 0.72, 0.48);
		const moonCol = new THREE.Color(0.7, 0.8, 1.0);
		this.light.color.copy(moonCol).lerp(sunCol, m);
		this.light.intensity = lerp(2.2, 3.1, m);
		// by night the cloud below is lit by the moon, and gives some of it back
		this.hemi.color.set(0x55688c).lerp(new THREE.Color(0xa9c0e0), m);
		this.hemi.groundColor.set(0x3a465e).lerp(new THREE.Color(0x9a6a4c), m);
		this.hemi.intensity = lerp(1.7, 0.75, m);
		U.uSunColor.value.copy(this.light.color).multiplyScalar(lerp(0.18, 1, m));
		this.renderer.toneMappingExposure = lerp(1.45, 1.0, m);
		const env = m > 0.5 ? this.envDay : this.envNight;
		this.scene.environment = env;
		this.scene.environmentIntensity =
			lerp(1.2, 0.55, m) * Math.min(1, Math.abs(m - 0.5) * 4 + 0.25);
		U.uWind.value = lerp(0.55, 1, m);
	}

	setDay(day: boolean) {
		this.dayTo = day ? 1 : 0;
		this.air.setDay(day);
		if (this.reduced) {
			this.dayMix = this.dayTo;
			this.applyDay(this.dayMix);
		}
		this.wake();
	}

	setPlaying(on: boolean) {
		this.playing = on;
		this.wake();
	}

	setScroll(y: number) {
		this.scroll = y;
		this.wake();
	}

	// ── framing ───────────────────────────────────────────────────────────
	resize() {
		// the canvas's own box: the large viewport on a phone, which does not
		// change as the browser's bars come and go
		const cv = this.renderer.domElement;
		const w = Math.max(1, cv.clientWidth || window.innerWidth),
			h = Math.max(1, cv.clientHeight || window.innerHeight);
		// on a phone the bars come and go; ignore the small height changes
		// they make, or the island jumps every time the page scrolls a little
		if (this.W === w && Math.abs(this.H - h) < 120 && this.W < 900) return;
		this.W = w;
		this.H = h;
		this.layout = w >= 900 && w / h > 1.05 ? 'side' : 'stack';
		this.renderer.setPixelRatio(this.dpr);
		this.renderer.setSize(w, h, false);
		this.sizeSky();
		this.camera.aspect = w / h;
		// fit the island and its trees into the part of the screen it owns
		const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
		const [fw, fh] = this.layout === 'side' ? [0.52, 0.8] : [0.86, 0.44];
		const subjectW = 17,
			subjectH = 12;
		const dW = subjectW / (fw * 2 * tan * this.camera.aspect);
		const dH = subjectH / (fh * 2 * tan);
		this.dist = Math.max(dW, dH);
		this.hv = 2 * this.dist * tan;
		const [fx, fy] = this.layout === 'side' ? [0.31, 0.5] : [0.5, 0.27];
		this.moonDir.copy(this.layout === 'side' ? MOON_DIR : moonAt(3.5, 7.5));
		this.sky.uniforms.uMoon.value.copy(this.moonDir);
		this.applyDay(this.dayMix);
		this.camera.setViewOffset(w, h, (0.5 - fx) * w, (0.5 - fy) * h, w, h);
		this.camera.near = Math.max(0.5, this.dist - 30);
		this.camera.far = this.dist + 200;
		this.camera.updateProjectionMatrix();
		this.wake();
	}

	/** Where the island sits on screen, for the page to lay its words round it. */
	get frame() {
		return { layout: this.layout };
	}

	private placeCamera(dt: number) {
		const H = this.H;
		this.scrollSmooth = this.reduced ? this.scroll : damp(this.scrollSmooth, this.scroll, 10, dt);
		const p = clamp(this.scrollSmooth / H, 0, 2.4);
		// the intro: in from a little further out and higher up
		let k = 1;
		if (this.intro.t >= 0 && this.intro.t < this.intro.dur)
			k = easeInOut(this.intro.t / this.intro.dur);
		else if (this.intro.t < 0) k = 0;
		const back = lerp(1.22, 1, k);
		const lift = lerp(7, 0, k);
		// sinking past the island, and looking up at it as it goes by
		// Beside the words the island can linger and be looked up at as it goes;
		// over them, where they stack, it keeps ahead of the text it would cover.
		const rate = this.layout === 'side' ? 0.55 : 0.8;
		const descend = Math.min(p, 1.7) * rate * this.hv + Math.max(0, p - 1.7) * 0.15 * this.hv;
		// The camera only sinks; it does not tip. Going below the island is
		// enough to see its underside, and a level camera keeps the horizon and
		// the moon where they were, behind the page as well as the picture.
		const pitch = THREE.MathUtils.degToRad(6.5 + lift) + this.pitchNudge;
		const drift = this.reduced ? 0 : Math.sin(this.clock * 0.045) * 0.06;
		const yaw = this.yaw + drift + lerp(-0.35, 0, k);
		const target = new THREE.Vector3(0, 3.0 - descend, 0);
		const d = this.dist * back;
		this.camera.position.set(
			target.x + Math.sin(yaw) * Math.cos(pitch) * d,
			target.y + Math.sin(pitch) * d,
			target.z + Math.cos(yaw) * Math.cos(pitch) * d
		);
		this.camera.lookAt(target);
		if (this.peekAt) {
			const k = this.peekAt;
			this.camera.position.set(
				k.x + Math.sin(k.yaw) * Math.cos(k.pitch) * k.d,
				k.y + Math.sin(k.pitch) * k.d,
				k.z + Math.cos(k.yaw) * Math.cos(k.pitch) * k.d
			);
			this.camera.lookAt(k.x, k.y, k.z);
		}
		return p;
	}

	/** Debugging: look at a point from a distance, or null to let go. */
	peekAt: { x: number; y: number; z: number; d: number; yaw: number; pitch: number } | null = null;

	// ── input ─────────────────────────────────────────────────────────────
	private on(t: EventTarget, type: string, fn: EventListener, o?: AddEventListenerOptions) {
		t.addEventListener(type, fn, o);
		this.listeners.push([t, type, fn, o]);
	}

	private bind() {
		const cv = this.renderer.domElement;
		this.on(window, 'resize', () => this.resize());
		this.on(document, 'visibilitychange', () => (document.hidden ? this.stop() : this.wake()));
		this.on(cv, 'pointermove', ((e: PointerEvent) => {
			this.setPointer(e);
			this.pointerOn = e.pointerType === 'mouse';
			if (this.drag && this.drag.id === e.pointerId) {
				const dx = e.clientX - this.drag.x;
				if (Math.abs(dx) > 4) this.drag.moved = true;
				const was = this.yaw;
				this.yaw = clamp(this.drag.yaw - (dx / this.W) * 2.4, -0.75, 0.75);
				this.yawVel = (this.yaw - was) * 60;
			}
			this.wake();
		}) as EventListener);
		this.on(cv, 'pointerleave', () => (this.pointerOn = false));
		this.on(cv, 'pointerdown', ((e: PointerEvent) => {
			this.setPointer(e);
			const hit = this.pick();
			if (hit === 'gramophone') {
				this.onGramophone?.();
				return;
			}
			if (hit) {
				this.pressed = hit;
				this.growth.get(hit)!.to = 0;
				this.air.pressed(hit);
			}
			this.drag = {
				id: e.pointerId,
				x: e.clientX,
				y: e.clientY,
				yaw: this.yaw,
				moved: false,
				t: this.clock
			};
			cv.setPointerCapture(e.pointerId);
			this.wake();
		}) as EventListener);
		const up = ((e: PointerEvent) => {
			if (this.drag?.id === e.pointerId) this.drag = null;
			if (this.pressed) {
				const st = this.growth.get(this.pressed);
				if (st) st.to = 1;
				this.pressed = null;
			}
			this.wake();
		}) as EventListener;
		this.on(cv, 'pointerup', up);
		this.on(cv, 'pointercancel', up);
	}

	private setPointer(e: PointerEvent) {
		this.pointerNdc.set((e.clientX / this.W) * 2 - 1, -(e.clientY / this.H) * 2 + 1);
	}

	/** What is under the pointer: the machine, a tree, or nothing. */
	private pick(): TreeHandles | 'gramophone' | null {
		this.ray.setFromCamera(this.pointerNdc, this.camera);
		const ray = this.ray.ray;
		const box = this.gramophone.hit.clone().applyMatrix4(this.gramophone.group.matrixWorld);
		const gHit = ray.intersectBox(box, new THREE.Vector3());
		let best: TreeHandles | null = null,
			bestD = Infinity;
		const a = new THREE.Vector3(),
			b = new THREE.Vector3(),
			onRay = new THREE.Vector3(),
			onSeg = new THREE.Vector3();
		for (const t of this.trees) {
			const p = t.items[0].pos;
			a.set(p.x, 0.3, p.z);
			b.set(t.crown.x, t.height * 0.95, t.crown.z);
			const d2 = ray.distanceSqToSegment(a, b, onRay, onSeg);
			const reach = lerp(0.5, t.crownR * 0.75, clamp(onSeg.y / t.height, 0, 1));
			if (d2 < reach * reach) {
				const along = onRay.distanceTo(ray.origin);
				if (along < bestD) {
					bestD = along;
					best = t;
				}
			}
		}
		if (gHit && gHit.distanceTo(ray.origin) < bestD) return 'gramophone';
		return best;
	}

	// ── the loop ──────────────────────────────────────────────────────────
	async ready() {
		await this.bakeEnvironment();
		this.applyDay(this.dayMix);
		this.placeCamera(0);
		try {
			await this.renderer.compileAsync(this.scene, this.camera);
		} catch {
			/* older engines: the first frame compiles instead */
		}
		this.draw();
	}

	private draw() {
		this.sky.render(this.renderer, this.camera);
		this.renderer.render(this.scene, this.camera);
		this.renderer.getContext().colorMask(true, true, true, true);
	}

	/** The sky's sheet: fewer pixels by day, when it is all soft cloud, than
	 *  by night, when it carries stars a pixel across. */
	private sizeSky() {
		const px = this.W * this.dpr,
			py = this.H * this.dpr;
		this.sky.setSize(px, py, lerp(2.2e6, 1.3e6, this.dayMix));
	}

	/** Begin the opening: the trees grow in, the camera settles, birds come. */
	begin() {
		if (this.reduced) {
			this.intro.t = this.intro.dur;
		} else {
			this.intro.t = 0;
			for (const [t, st] of this.growth) {
				st.g = 0;
				st.to = 1;
				t.u.uGrow.value = 0;
			}
		}
		this.air.begin();
		this.wake();
	}

	wake() {
		if (this.running || document.hidden) return;
		this.running = true;
		this.last = performance.now();
		this.raf = requestAnimationFrame(this.frame_);
	}

	stop() {
		this.running = false;
		cancelAnimationFrame(this.raf);
	}

	private frame_ = (now: number) => {
		if (!this.running) return;
		this.raf = requestAnimationFrame(this.frame_);
		// Deep in the page there is only sky, drifting, and every pane of glass
		// over it has to blur it again each time it changes: there it is drawn
		// twenty times a second, which the cloud cannot tell from sixty.
		if (!this.world.visible && Math.abs(this.dayMix - this.dayTo) < 1e-3 && now - this.last < 48)
			return;
		const dt = Math.min(0.05, (now - this.last) / 1000);
		this.last = now;
		const t0 = performance.now();
		this.update(dt);
		this.draw();
		this.adapt(performance.now() - t0, dt);
	};

	private update(dt: number) {
		this.clock += dt;
		U.uTime.value = this.clock;
		if (this.intro.t >= 0) this.intro.t += dt;

		// the lights
		if (Math.abs(this.dayMix - this.dayTo) > 1e-4) {
			this.dayMix = damp(this.dayMix, this.dayTo, 2.2, dt);
			if (Math.abs(this.dayMix - this.dayTo) < 0.002) this.dayMix = this.dayTo;
			this.applyDay(this.dayMix);
		}

		// orbit: inertia after a drag, then easing home
		if (!this.drag) {
			this.yaw += this.yawVel * dt;
			this.yawVel = damp(this.yawVel, 0, 4, dt);
			if (Math.abs(this.yawVel) < 0.02) this.yaw = damp(this.yaw, 0, 0.35, dt);
			this.yaw = clamp(this.yaw, -0.75, 0.75);
		}
		// a little parallax from the pointer
		const px = this.pointerOn && !this.drag ? this.pointerNdc.x : 0;
		const py = this.pointerOn && !this.drag ? this.pointerNdc.y : 0;
		this.pitchNudge = damp(this.pitchNudge, py * 0.025, 2, dt);
		this.yaw += (px * 0.03 - 0) * dt;

		const p = this.placeCamera(dt);
		const visible = p < 1.85;
		this.world.visible = visible;
		this.light.castShadow = visible;
		// the shadows follow the wind at half the rate the picture does: a
		// crown's shadow on the lawn moves too slowly for the difference to show,
		// and the shadow pass draws every tree a second time
		this.shadowTick = (this.shadowTick + 1) % 2;
		const quick = this.intro.t >= 0 && this.intro.t < this.intro.dur + 1.5;
		this.renderer.shadowMap.needsUpdate =
			visible && (this.shadowTick === 0 || quick || !!this.pressed);

		// the pointer pushes the crowns aside, where it meets the lawn
		this.ptrAmp = damp(this.ptrAmp, this.pointerOn && visible ? 1 : 0, 3, dt);
		U.uPtrAmp.value = this.ptrAmp;
		if (this.pointerOn) {
			this.ray.setFromCamera(this.pointerNdc, this.camera);
			const hit = this.ray.ray.intersectPlane(
				new THREE.Plane(new THREE.Vector3(0, 1, 0), -2.5),
				new THREE.Vector3()
			);
			if (hit) U.uPtr.value.lerp(hit, 1 - Math.exp(-dt * 8));
		}

		// growth: toward the target at a fixed rate, and a spring at the top
		const introGrow = this.intro.t >= 0 ? this.intro.t : -1;
		for (const [t, st] of [...this.growth]) {
			const rate = st.to > st.g ? 0.42 : 0.9;
			let delay = 0;
			if (introGrow >= 0 && introGrow < this.intro.dur + 1) {
				delay = t === this.shrubs ? 0.2 : 0.7 + this.trees.indexOf(t) * 0.16;
				if (introGrow < delay) continue;
			}
			const prev = st.g;
			if (st.g < st.to) st.g = Math.min(st.to, st.g + rate * dt);
			else if (st.g > st.to) st.g = Math.max(st.to, st.g - rate * dt);
			if (prev < 1 && st.g >= 1) {
				st.popV = 1.6;
			}
			// the spring rings down
			st.popV += (-st.pop * 40 - st.popV * 5) * dt;
			st.pop += st.popV * dt;
			const g = easeInOut(clamp(st.g, 0, 1));
			t.u.uGrow.value = g * (t.sMax + 1.2) - 0.4 + st.pop * 0.25;
			t.u.uGrowAll.value = 0.3 + 0.7 * g;
			if (st.g <= 0 && st.to <= 0 && t !== this.shrubs && this.pressed === t) {
				// gone: something else grows in its place
				const nt = this.replant(t);
				this.pressed = nt;
				this.growth.get(nt)!.to = 0;
			}
		}

		// the machine
		if (this.playing) {
			this.crankA += dt * 5.2;
			this.gramophone.crank.rotation.x = this.crankA;
			this.gramophone.record.rotation.y -= dt * 3.5;
		}

		// the light's view-space direction, for leaves lit from behind
		U.uSunView.value
			.copy(this.light.position)
			.normalize()
			.transformDirection(this.camera.matrixWorldInverse);
		this.light.target.position.set(0, 0, 0);

		this.air.update(dt, visible);
	}

	/** Hold the frame rate by giving up resolution, and take it back when there is room. */
	private adapt(ms: number, dt: number) {
		this.frameTimes.push(dt * 1000);
		if (this.frameTimes.length < 90) return;
		const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
		this.frameTimes.length = 0;
		let next = this.dpr;
		if (avg > 24 && this.dpr > 1) next = Math.max(1, this.dpr - 0.25);
		else if (avg < 15 && ms < 8 && this.dpr < this.dprCap)
			next = Math.min(this.dprCap, this.dpr + 0.25);
		if (next !== this.dpr) {
			this.dpr = next;
			this.renderer.setPixelRatio(next);
			this.renderer.setSize(this.W, this.H, false);
			this.sizeSky();
		}
	}

	get stats() {
		return {
			dpr: this.dpr,
			calls: this.renderer.info.render.calls,
			tris: this.renderer.info.render.triangles,
			layout: this.layout
		};
	}

	dispose() {
		this.stop();
		for (const [t, type, fn, o] of this.listeners) t.removeEventListener(type, fn, o);
		this.renderer.dispose();
	}
}

export { ISLAND };
