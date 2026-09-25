import * as THREE from 'three';
import { U, graded } from './shared';
import { createSky, sunLight } from './sky';
import { bakeTextures, lawnTexture, barkTextures, woodTexture } from './textures';
import { buildIsland, buildLanterns, ISLAND, type IslandParts } from './island';
import { Glow } from './glow';
import { buildRotunda, rotundaClearance, type RotundaParts } from './rotunda';
import { buildFairyLights, type FairyLights } from './fairylights';
import { GramOutline, GRAM_LAYER, OCCLUDER_LAYER } from './outline';
import { buildGramophone, lampRoom, type Gramophone } from './gramophone';
import {
	buildStand,
	prepareStand,
	sharedCanopy,
	SHADOW_LAYER,
	type Stand,
	type PlantItem
} from './flora/plants';
import type { Canopy } from './flora/canopy';
import { OLIVE, BLOSSOM, CYPRESS, WHITE_SHRUB, ROSE_SHRUB, VINE } from './flora/species';
import { rustleFrom } from './flora/wind';
import { Petals, type PetalSource } from './flora/petals';
import { patch, nightPatch, nightPatchWarm } from './shared';
import { rng, clamp, damp, easeInOut, lerp, smoothstep } from './rng';
import { Air, groveHabitat } from './air';
import { Islet } from './islet';
import { IsletView } from './isletview';
import { Notes } from './notes';

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
	/** the drawing context was lost: the page shows its plain sky instead */
	onLost?: () => void;
	/** how loud the music is, 0..1, for the notes out of the horn */
	level?: () => number;
}

type Layout = 'side' | 'stack';

// Directions in the sky, by azimuth from straight ahead (positive to the
// right) and elevation. The sun is on the horizon, a little to the left of
// the island, and lights it from the left and behind, so the crowns glow at
// their edges; the light on the island is taken from a little higher than
// the disc, or its shadows would be twenty metres long. The moon hangs low
// over the cloud: between the island and the words where they stand side by
// side, over the island where they stack. It is a mood, not an almanac.
const moonAt = (azDeg: number, elDeg: number) => {
	const az = THREE.MathUtils.degToRad(azDeg),
		el = THREE.MathUtils.degToRad(elDeg);
	return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
};
const MOON: Record<Layout, [number, number]> = { side: [12, 4.6], stack: [2, 7.2] };
/** which way the moon leaves when the lights come up, in degrees of azimuth and elevation */
const MOON_OUT = [6, 12] as const;
// An afternoon sun, well round to the left and out of the picture, so the
// sky in it is blue all the way up and only its left edge warms. (Nearer the
// middle, its glow in the haze whitens the whole top of a narrow phone.)
const SUN_AZ = { side: -72, stack: -66 };
const SUN_EL = 22;
/** where the disc goes when the lights go down: under the cloud */
const SUN_SET_EL = -7;
// The light on the island is set for the island, not taken from the disc:
// from the left and behind, high enough for short shadows, so the crowns
// are rimmed and the island's face takes the light across it.
const KEY_AZ = { side: -60, stack: -52 };
const KEY_EL = 32;
/** do this when the page has a moment, or soon anyway */
const idle = (f: () => void) => {
	const ric = (
		globalThis as unknown as { requestIdleCallback?: (f: () => void, o?: object) => void }
	).requestIdleCallback;
	if (ric) ric(f, { timeout: 3000 });
	else setTimeout(f, 30);
};
/**
 * Give the page its turn: a frame drawn (the veil's figure moves on), then
 * on. Waiting on the frame, not merely yielding: a bare yield comes back
 * before the browser paints, and the figure moved five times a second. (Not
 * for long, though: a hidden page draws no frames.)
 */
const pause = () =>
	new Promise<void>((r) => {
		let done = false;
		const go = () => {
			if (done) return;
			done = true;
			setTimeout(r, 0);
		};
		requestAnimationFrame(go);
		setTimeout(go, 50);
	});
/** The veil's boot log, and the figure on it that gains a dimension as each
 *  part of the grove is ready (see app.html): what is being built, in numbers. */
type Veil = { log?(tag: string, text: string, metric?: string): void; dim?(n: number): void };
const veil = () => (globalThis as unknown as { __veil?: Veil }).__veil;
const log = (tag: string, text: string, metric?: string) => veil()?.log?.(tag, text, metric);
const since = (t0: number) => `${Math.round(performance.now() - t0)} ms`;
const count = (n: number) => n.toLocaleString('en-US');
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
/** how far the sky is tipped up behind the island, in degrees, by layout */
const SKY_TILT = { side: 0, stack: 9 };

export class Grove {
	renderer: THREE.WebGLRenderer;
	scene = new THREE.Scene();
	camera: THREE.PerspectiveCamera;
	sky = createSky();
	/** the line round the gramophone under the pointer */
	private outline = new GramOutline();
	/** the tone map's exposure, and the grade's warm lights and cool shadows (see graded) */
	private exposure = 1;
	private warm = 0.5;
	private sunAz = SUN_AZ.side;
	private light: THREE.DirectionalLight;
	private hemi: THREE.HemisphereLight;
	private envDay: THREE.Texture | null = null;
	private envNight: THREE.Texture | null = null;
	private envRoom: THREE.Texture | null = null;
	private brass: THREE.MeshStandardMaterial | null = null;
	private moonDir = moonAt(...MOON.side);
	private skyCam = new THREE.PerspectiveCamera();
	/** the view's turn about the island, and the key light's direction before it */
	private viewYaw = 0;
	private keyDir = new THREE.Vector3(0, 1, 0);
	private world = new THREE.Group();
	island!: IslandParts;
	pavilion!: RotundaParts;
	private fairy!: FairyLights;
	private glow = new Glow();
	private petals = new Petals();
	private lanterns: THREE.Vector3[] = [];
	private glassMat = new THREE.MeshStandardMaterial({
		color: 0x2a2014,
		// a candle's orange, kept low enough that the tone map leaves it
		// orange rather than burning it to white
		emissive: new THREE.Color(1.0, 0.44, 0.13),
		emissiveIntensity: 0,
		roughness: 0.3
	});
	/** the lantern in the rotunda: warm, lit at dusk, brighter by night */
	// the lantern in the arch, shining down on the gramophone: a spot, so
	// that it can throw the machine's shadow, wide enough to light the room
	private lamp = new THREE.SpotLight(0xffa04a, 0, 7, 1.18, 0.85, 2);
	gramophone!: Gramophone;
	trees: Stand[] = [];
	/** every stand on the island, and the light inside them all */
	garden: Stand[] = [];
	/** what flowers there are to fall, stand by stand */
	private blooms: PetalSource[] = [];
	canopy: Canopy | null = null;
	air!: Air;
	private mats!: {
		brick: THREE.MeshStandardMaterial;
		copper: THREE.MeshStandardMaterial;
		bark: { map: THREE.Texture; normalMap: THREE.Texture };
		stone: THREE.Material;
	};

	readonly reduced: boolean;
	private raf = 0;
	private last = 0;
	private clock = 0;
	private running = false;
	private dayMix: number;
	private dayTo: number;
	/** the change of light under way: from what, and since when */
	private dayFrom = 1;
	private dayT = -1;
	/** how far out of the picture the moon is (1 by day), on a clock of its own */
	private moonK = 1;
	private moonFrom = 1;
	private moonT = -1;
	private layout: Layout = 'side';
	private W = 1;
	H = 1;
	private dist = 30;
	private hv = 16;
	private scroll = 0;
	private scrollSmooth = 0;
	private yaw = 0;
	private yawVel = 0;
	/** when the last spin was let go, and the last sample of a drag, for its speed */
	private spunAt = -99;
	private spinSample = { yaw: 0, t: 0 };
	/** the slow turn of the island while a record plays, radians a second */
	private orbit = 0;
	/** how far the sky is tipped away as the page goes down, in radians */
	private skyTip = 0;
	private pitchNudge = 0;
	/** the tilt a hand gives the island, dragging it up or down, and where it is going */
	private pitchDrag = 0;
	private pitchDragTo = 0;
	/** whether the island was being turned last frame, for the birds */
	private wasSpinning = false;
	/** the wind as the light has it, before a spin adds to it */
	private windBase = 1;
	private pointerNdc = new THREE.Vector2(0, 0);
	private pointerOn = false;
	private ptrAmp = 0;
	private drag: {
		id: number;
		x: number;
		y: number;
		yaw: number;
		pitch: number;
		moved: boolean;
		t: number;
		/** the tree it came down on, if it did */
		tree: Stand | null;
	} | null = null;
	private pressed: Stand | null = null;
	private growth = new Map<Stand, { g: number; to: number; pop: number; popV: number }>();
	private intro = { t: -1, dur: 3.2 };
	/** the scale the picture is drawn at, which adapt() trades for time */
	private dpr = 1;
	private dprCap = 2;
	/**
	 * On a touch screen the picture goes up with the page, as a picture on
	 * the page would, and is not moved from here at all. A phone scrolls on
	 * its own compositor, at 120 Hz on the newer ones, and anything moved
	 * with the scroll from a script (at most sixty times a second, and a
	 * frame behind) steps against the words beside it however fast it is
	 * drawn: the island came up the screen in small jumps. Scrolled with
	 * the page it moves with the words exactly, and once it is out of sight
	 * nothing is drawn at all.
	 */
	private flowing = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
	/** the canvas's own density: the screen's, up to 2 */
	private native = 1;
	private texReady: Promise<void> = Promise.resolve();
	private lampBase = 0;
	private glassBase = 0;
	private frameTimes: number[] = [];
	/** frame intervals while the page scrolls, and the scale they allow */
	private scrollTimes: number[] = [];
	private dprCeil = Infinity;
	private ceilAt = -Infinity;
	private ceilWait = 30e3;
	/** frames before this are not judged: see adapt() */
	private settleAt = 0;
	private ray = new THREE.Raycaster();
	private playing = false;
	/** a tree in the hand, and every tree's spring */
	private grab: { tree: Stand; id: number; x: number; y: number; moved: boolean } | null = null;
	private springs = new Map<
		Stand,
		{ x: number; z: number; vx: number; vz: number; tx: number; tz: number }
	>();
	/** how far each tree may lean toward the rotunda (radians), and which way that is */
	private reach = new Map<Stand, { nx: number; nz: number; max: number }>();
	private lastMove: { x: number; y: number } | null = null;
	private overGram = false;
	private gramFlash = 0;
	private gramGlow = 0;
	private live = false;
	private crankA = 0;
	private shadowTick = 0;
	private rand: () => number;
	private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
	onGramophone?: () => void;
	private onLost?: () => void;
	/** a finger on the machine, waiting to be lifted: a touch starts music only then */
	private gramTap: { id: number; x: number; y: number; t: number } | null = null;
	/** a change of scale or size, made at the start of the next frame drawn */
	private pendingScale = 0;
	private pendingResize = false;
	private level: () => number;
	private notes = new Notes();
	/** The islet the reading room shows over its glass, on a canvas of its
	 *  own: built when the page is idle, once the room has given its canvas. */
	private islet: IsletView | null = null;
	private isletCanvas: HTMLCanvasElement | null = null;
	/** a tap on the reading room's canvas that found nothing there */
	onIsletMiss?: () => void;
	private lawnTex!: THREE.Texture;
	private rockTex!: THREE.Texture;
	private mouth = new THREE.Vector3();
	private mouthDir = new THREE.Vector3();

	constructor(opts: GroveOptions) {
		this.reduced = opts.reduced;
		this.dayMix = this.dayTo = opts.day ? 1 : 0;
		this.moonK = this.moonFrom = this.dayMix;
		this.onGramophone = opts.onGramophone;
		this.onLost = opts.onLost;
		this.level = opts.level ?? (() => 0);
		this.rand = rng(opts.seed ?? Date.now() & 0xffff);
		const r = new THREE.WebGLRenderer({
			canvas: opts.canvas,
			// Drawn straight to the canvas with the GPU's multisampling, in place
			// of a half-float frame passed over four times more (bloom, tone
			// map, grade, and an edge filter that blurred what it smoothed). At
			// the same scale it costs about the same, and its edges are true
			// ones: a thin leaf is covered, not guessed at, and holds still as
			// it turns. (WebKit gives the canvas an alpha channel even so, and
			// composites it: whatever is drawn must leave alpha at one, as
			// every material here does.)
			antialias: true,
			depth: true,
			alpha: false,
			powerPreference: 'high-performance',
			stencil: false
		});
		r.outputColorSpace = THREE.SRGBColorSpace;
		// every surface tone-maps and grades itself as it is drawn (see shared.ts)
		r.toneMapping = THREE.CustomToneMapping;
		r.toneMappingExposure = graded(this.exposure, this.warm);
		r.shadowMap.enabled = true;
		r.shadowMap.type = THREE.PCFShadowMap;
		// redrawn every other frame: see update()
		r.shadowMap.autoUpdate = false;
		r.shadowMap.needsUpdate = true;
		this.renderer = r;
		// Should the phone take the drawing context back (it does, short of
		// memory), the page shows its plain sky rather than a black hole, and
		// if the context is given back, the page starts afresh, once.
		this.on(r.domElement, 'webglcontextlost', ((e: Event) => {
			e.preventDefault();
			this.stop();
			this.live = false;
			this.onLost?.();
		}) as EventListener);
		this.on(r.domElement, 'webglcontextrestored', () => {
			try {
				if (sessionStorage.getItem('grove-restored')) return;
				sessionStorage.setItem('grove-restored', '1');
			} catch {
				return;
			}
			location.reload();
		});
		const phone = Math.min(screen.width, screen.height) < 600;
		this.dprCap = Math.min(window.devicePixelRatio || 1, 2);
		// (a phone starts at twice and may climb toward its own density)
		this.dpr = this.dprCap;
		void phone;

		this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
		this.sky.uniforms.uMoon.value.copy(this.moonDir);
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
		this.light.shadow.camera.layers.enable(SHADOW_LAYER);
		this.scene.add(this.light, this.light.target);
		this.hemi = new THREE.HemisphereLight(0xa8bddb, 0x8a6048, 0.6);
		this.scene.add(this.hemi);

		this.build();
		this.applyDay(this.dayMix);
		this.bind();
		this.resize();
	}

	// ── building ──────────────────────────────────────────────────────────
	private build() {
		const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
		// the heavy textures are drawn in workers while the rest is built
		const tb = performance.now();
		const baked = bakeTextures(aniso);
		void baked.done.then(() => log('tex', 'brick · ashlar · rock · flagstone', since(tb)));
		this.texReady = baked.done;
		const bricks = baked.tex.bricks;
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
		this.mats = { brick, copper, bark, stone: brick };
		const ashlar = baked.tex.ashlar;
		const stone = patch(
			new THREE.MeshStandardMaterial({
				map: ashlar.map,
				normalMap: ashlar.normalMap,
				roughness: 0.88,
				metalness: 0
			}),
			'stone',
			nightPatch
		);
		this.mats.stone = stone;
		const bronze = patch(
			new THREE.MeshStandardMaterial({ color: 0x6e5230, metalness: 1, roughness: 0.4 }),
			'bronze',
			nightPatch
		);
		// both sides: the horn is a sheet with no thickness, and from behind
		// it is its back that shows
		const brass = patch(
			new THREE.MeshStandardMaterial({
				color: 0xd8a650,
				metalness: 1,
				roughness: 0.26,
				side: THREE.DoubleSide
			}),
			'brass',
			nightPatchWarm
		);
		this.brass = brass;

		this.lawnTex = lawnTexture(aniso);
		this.rockTex = baked.tex.rock.map;
		this.island = buildIsland(
			{ ashlar, rock: baked.tex.rock, flags: baked.tex.flags, lawn: this.lawnTex },
			this.rand() * 10
		);
		this.world.add(this.island.group);
		this.pavilion = buildRotunda(brick, stone, bronze);
		this.world.add(this.pavilion.group);
		this.fairy = buildFairyLights(this.pavilion);
		this.world.add(this.fairy.group);
		// just under the lantern's foot, or the foot would shadow the floor
		this.lamp.position.copy(this.pavilion.lantern).setY(this.pavilion.lantern.y - 0.18);
		this.lamp.target.position.set(
			this.pavilion.lantern.x,
			this.pavilion.floorY,
			this.pavilion.lantern.z
		);
		const lan = buildLanterns(stone, bronze, this.glassMat);
		this.world.add(lan.group);
		this.lanterns = lan.lights;
		this.pavilion.lanternGlass.material = this.glassMat;
		U.uGlowMap.value = this.glow.tex;
		// Nothing under the lantern moves, so its shadow is drawn once, when
		// the scene first is, and kept (see the shadows in update).
		this.lamp.castShadow = true;
		this.lamp.shadow.mapSize.set(1024, 1024);
		this.lamp.shadow.camera.near = 0.05;
		this.lamp.shadow.bias = -0.0006;
		this.lamp.shadow.normalBias = 0.015;
		this.lamp.shadow.radius = 4;
		this.lamp.shadow.autoUpdate = false;
		this.lamp.shadow.needsUpdate = true;
		this.world.add(this.lamp, this.lamp.target);
		this.gramophone = buildGramophone(brass, woodTexture(aniso));
		// in the middle of the rotunda, under the lantern, the horn turned to
		// the door
		this.gramophone.group.position.set(0, this.pavilion.floorY, 0);
		this.gramophone.group.scale.setScalar(1.15);
		this.gramophone.group.rotation.y = 0.3;
		this.world.add(this.gramophone.group);
		// for the line round it under the pointer: the machine, and the
		// building that can stand between it and the eye
		this.gramophone.group.traverse((o) => o.layers.enable(GRAM_LAYER));
		this.pavilion.group.traverse((o) => o.layers.enable(OCCLUDER_LAYER));
		this.world.add(this.notes.points);
		this.world.add(this.petals.mesh);
	}

	/** Deal the stand: every species at least once, the rest at random. */
	/**
	 * The garden, after the old ones it remembers: two olives either side of
	 * the doorway; cypresses behind, dark against the sky; flowering shrubs
	 * along the wall where they can spill over it, roses by the steps with
	 * urns of them; and ivy over the coping, falling down the rock.
	 */
	private async plant() {
		const r = this.rand;
		const phone = Math.min(window.innerWidth, window.innerHeight) < 700;
		const opt = {
			barkMap: this.mats.bark.map!,
			barkNormal: this.mats.bark.normalMap!,
			rows: 3,
			density: phone ? 0.38 : 0.52,
			minRadius: 0.003
		};
		const seed = () => Math.floor(r() * 1e6);
		const at = (a: number, rad: number, y = 0) =>
			new THREE.Vector3(Math.sin(a) * rad, y, Math.cos(a) * rad);
		const { R, lawn: RL, wallTop } = ISLAND;

		// an olive one side of the doorway and a tree in blossom the other, a
		// little behind it
		const side = r() < 0.5 ? 1 : -1;
		const olives: PlantItem[] = [side, -side].map((sgn, i) => ({
			species: i === 0 ? OLIVE : BLOSSOM,
			seed: seed(),
			pos: at(sgn * lerp(1.32, 1.5, r()), lerp(4.3, 4.8, r())),
			rotY: r() * Math.PI * 2,
			scale: lerp(1.32, 1.45, i === 0 ? r() : 1 - r()),
			// pruned clear of the rotunda, with room for the leaves on the shoots
			avoid: (p: THREE.Vector3) => rotundaClearance(p) < 0.52
		}));
		// cypresses behind, off the axis so the dome stands clear between them
		const cypresses: PlantItem[] = [
			[2.25, 5.3],
			[-2.45, 5.5],
			[2.95, 4.9]
		].map(([a, rad], i) => ({
			species: CYPRESS,
			seed: seed(),
			pos: at(a * (side > 0 ? 1 : -1) + (r() - 0.5) * 0.15, rad),
			rotY: r() * Math.PI * 2,
			scale: lerp(0.95, 1.12, r()) * (i === 2 ? 1.1 : 1)
		}));
		// shrubs along the wall, most along the front where they are seen,
		// leaving the path clear
		const whites: PlantItem[] = [];
		const roses: PlantItem[] = [];
		let guard = 0;
		const taken: THREE.Vector3[] = [...olives, ...cypresses].map((o) => o.pos);
		while (whites.length < (phone ? 9 : 12) && guard++ < 600) {
			const front = r() < 0.72;
			const a = front
				? lerp(0.22, 1.9, r()) * (r() < 0.5 ? 1 : -1)
				: lerp(1.9, Math.PI, r()) * (r() < 0.5 ? 1 : -1);
			// close in to the wall, so they lean over it
			const p = at(a, RL - lerp(0.2, 0.42, r()));
			if (taken.some((q) => q.distanceTo(p) < 1.15)) continue;
			taken.push(p);
			whites.push({
				species: WHITE_SHRUB,
				seed: seed(),
				pos: p,
				rotY: r() * 6.28,
				scale: lerp(1.25, 1.65, r())
			});
		}
		// roses at the foot of the steps
		for (const sgn of [-1, 1]) {
			roses.push({
				species: ROSE_SHRUB,
				seed: seed(),
				pos: new THREE.Vector3(sgn * lerp(1.65, 1.95, r()), 0, lerp(2.75, 3.0, r())),
				rotY: r() * 6.28,
				scale: lerp(0.8, 0.95, r())
			});
		}
		// urns either side of the path, with roses in them
		const urnY = 0.74;
		for (const sgn of [-1, 1]) {
			const p = new THREE.Vector3(sgn * 1.12, 0, 3.55);
			this.world.add(this.urn(p));
			roses.push({
				species: ROSE_SHRUB,
				seed: seed(),
				pos: p.clone().setY(urnY),
				rotY: r() * 6.28,
				scale: 0.55
			});
		}
		// ivy over the coping, on the side that is seen
		const vines: PlantItem[] = [];
		for (let k = 0; k < (phone ? 18 : 26); k++) {
			const a = lerp(-1.75, 1.75, (k + r() * 0.8) / (phone ? 18 : 26));
			if (Math.abs(a) < 0.16) continue;
			// rooted at the foot of the wall's outer face, in its own frame
			vines.push({ species: VINE, seed: seed(), pos: at(a, R, 0), rotY: a, scale: 1 });
		}

		// each olive a stand of its own, so a touch finds the one it touched
		const groups = [[olives[0]], [olives[1]], cypresses, whites, roses, vines];
		// Grown a stand at a time, with the page given its turn between: grown
		// at a stroke it was near half a second in which nothing else ran,
		// the veil's figure standing still.
		const preps: ReturnType<typeof prepareStand>[] = [];
		for (const g of groups) {
			await pause();
			preps.push(prepareStand(g, opt.density));
		}
		const canopy = sharedCanopy(preps);
		const stands: Stand[] = [];
		for (let i = 0; i < groups.length; i++) {
			const t0 = performance.now();
			const st = buildStand(groups[i], { ...opt, canopy }, preps[i]);
			stands.push(st);
			const leaves = (st.leaves.geometry as THREE.InstancedBufferGeometry).instanceCount;
			const flowers = st.flowers
				? (st.flowers.geometry as THREE.InstancedBufferGeometry).instanceCount
				: 0;
			const n = groups[i].length;
			log(
				'grow',
				`${groups[i][0].species.name}${n > 1 ? ` ×${n}` : ''} · ${count(leaves)} leaves` +
					(flowers ? ` · ${count(flowers)} flowers` : ''),
				since(t0)
			);
			await pause();
		}
		// the garden grown: the figure takes its third dimension
		veil()?.dim?.(3);
		for (const st of stands) {
			this.world.add(st.group);
			this.growth.set(st, { g: 1, to: 1, pop: 0, popV: 0 });
		}
		this.gateShadowLayer();
		this.trees = [stands[0], stands[1]];
		for (let i = 0; i < 2; i++) this.keepOff(stands[i], preps[i].placed.worldPos);
		this.garden = stands;
		this.blooms = stands
			.filter((g) => g.blossoms.length > 0)
			.map((g) => ({ at: g.blossoms, colors: [g.items[0].species.palette.blossom] }));
		this.canopy = canopy;
		this.shadeLawn();
	}

	/**
	 * The crowns' shadows are cast by a thinned set of leaves that lives on a
	 * layer of its own, so the picture never draws it. But three's shadow
	 * pass asks the picture's camera, not the light's, which layers to draw,
	 * so on its own the set is never drawn at all. Two empty marks, first and
	 * last in the world, open that layer to the camera for the length of each
	 * shadow pass and close it again: the picture's list of what to draw is
	 * made before the shadows, so it never sees the layer.
	 */
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
		this.world.add(open, close);
		// the opening mark first of all
		this.world.children.splice(this.world.children.indexOf(open), 1);
		this.world.children.unshift(open);
	}

	/** a stone urn on a plinth, for flowers either side of the path */
	private urn(p: THREE.Vector3) {
		const prof: [number, number][] = [
			[0, 0],
			[0.2, 0],
			[0.2, 0.08],
			[0.14, 0.12],
			[0.1, 0.2],
			[0.12, 0.26],
			[0.22, 0.34],
			[0.28, 0.46],
			[0.3, 0.58],
			[0.34, 0.66],
			[0.36, 0.72],
			[0.32, 0.74],
			[0.3, 0.7],
			[0.0, 0.7]
		];
		const g = new THREE.LatheGeometry(
			prof.map(([x, y]) => new THREE.Vector2(x, y)),
			28
		);
		const m = new THREE.Mesh(g, this.mats.stone);
		m.position.copy(p);
		m.castShadow = m.receiveShadow = true;
		return m;
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

	// ── the light ─────────────────────────────────────────────────────────
	private async bakeEnvironment() {
		const pm = new THREE.PMREMGenerator(this.renderer);
		const envScene = new THREE.Scene();
		const skyMat = this.sky.mesh.material as THREE.ShaderMaterial;
		const cap = new THREE.Mesh(this.sky.mesh.geometry, skyMat);
		envScene.add(cap);
		const u = this.sky.uniforms;
		const keep = u.uMix.value;
		const keepSun = u.uSun.value.clone();
		// the day's light is taken with the sun where the day has it
		u.uSun.value.copy(moonAt(this.sunAz, SUN_EL));
		this.sky.update(this.renderer);
		// the light over the cloud, wherever down the page the eye is now
		const keepEye = u.uEye.value,
			keepMist = u.uMist.value;
		const keepUnder = u.uUnder.value;
		u.uEye.value = 1;
		u.uMist.value = 0;
		u.uUnder.value = 0;
		u.uStars.value = 0;
		u.uMix.value = 1;
		this.envDay = pm.fromScene(envScene, 0, 0.1, 100).texture;
		u.uMix.value = 0;
		this.envNight = pm.fromScene(envScene, 0, 0.1, 100).texture;
		u.uMix.value = keep;
		u.uStars.value = 1;
		u.uEye.value = keepEye;
		u.uMist.value = keepMist;
		u.uUnder.value = keepUnder;
		u.uSun.value.copy(keepSun);
		this.sky.update(this.renderer);
		this.envRoom = pm.fromScene(lampRoom(), 0, 0.05, 50).texture;
		pm.dispose();
		this.applyDay(this.dayMix);
	}

	/**
	 * The sky holds still while the view turns (see draw), so it is the island
	 * that seems to turn under it; the sun, and the sky's light in the metal,
	 * turn with the view to match, as they would over a turning island.
	 */
	private aimKey() {
		this.light.position.copy(this.keyDir).applyAxisAngle(UP, this.viewYaw).multiplyScalar(30);
		this.scene.environmentRotation.set(0, this.viewYaw, 0);
	}

	/**
	 * The moon goes out of the picture, up and away from the page, as the
	 * sun comes up: off at once, so it is seen to go before the sky pales
	 * over it. With the night it comes back the same way, but slowly, and
	 * settles into its place as the dark comes on.
	 */
	private placeMoon() {
		const [mAz, mEl] = MOON[this.layout];
		const out = this.moonK;
		this.sky.uniforms.uMoon.value.copy(moonAt(mAz + MOON_OUT[0] * out, mEl + MOON_OUT[1] * out));
	}

	private applyDay(m: number) {
		U.uNight.value = 1 - m;
		this.sky.uniforms.uMix.value = m;
		if (this.W > 1) this.sizeSky();
		// the light swings from the moon's quarter to the sun's
		// the moon is behind the island from here, so by night it is drawn in
		// its rim light, with a cool fill from the sky to keep its shape
		// the disc sinks under the cloud as the lights go down
		const k = smoothstep(0, 1, m);
		this.sky.uniforms.uSun.value.copy(moonAt(this.sunAz, lerp(SUN_SET_EL, SUN_EL, k)));
		this.placeMoon();
		// the key comes from the side the sun is on, well round from it, so
		// the island's face takes the gold and its shadows fall across it
		const key = moonAt(KEY_AZ[this.layout], KEY_EL);
		const moonLight = this.moonDir.clone().setY(Math.max(this.moonDir.y, 0.28)).normalize();
		const dir = moonLight.lerp(key, k).normalize();
		this.keyDir.copy(dir);
		this.aimKey();
		// the sun's colour is the sky's: what is left of white after the air
		const sunCol = sunLight(THREE.MathUtils.degToRad(KEY_EL), 1.5);
		sunCol.multiplyScalar(1 / Math.max(sunCol.r, sunCol.g, sunCol.b));
		const moonCol = new THREE.Color(0.74, 0.8, 0.92);
		this.light.color.copy(moonCol).lerp(sunCol, m);
		this.light.intensity = lerp(2.2, 3.4, m);
		// by night the cloud below is lit by the moon, and gives some of it back
		this.hemi.color.set(0x5b6475).lerp(new THREE.Color(0x9fbbe6), m);
		this.hemi.groundColor.set(0x3e434e).lerp(new THREE.Color(0x8e8a86), m);
		this.hemi.intensity = lerp(1.7, 0.75, m);
		U.uSunColor.value.copy(this.light.color).multiplyScalar(lerp(0.18, 1, m));
		this.exposure = lerp(0.82, 1.0, m);
		// warm lamps against cool shadows by night; by day, neutral
		this.warm = lerp(0.85, 0.2, m);
		this.renderer.toneMappingExposure = graded(this.exposure, this.warm);
		const env = m > 0.5 ? this.envDay : this.envNight;
		this.scene.environment = env;
		// Polished brass is all reflection: under the night sky alone it would
		// go dull. By night it sees what it would, the lamplit room round it.
		if (this.brass) this.brass.envMap = m > 0.5 ? null : this.envRoom;
		this.scene.environmentIntensity =
			lerp(1.2, 0.55, m) * Math.min(1, Math.abs(m - 0.5) * 4 + 0.25);
		this.windBase = lerp(0.55, 1, m);
		// the lantern: already lit at dusk, the one warm thing by night
		this.lampBase = lerp(22, 2.2, m);
		this.glassBase = lerp(2.6, 1.0, m);
		this.lamp.intensity = this.lampBase * lerp(0.12, 1, this.arrive);
		this.glassMat.emissiveIntensity = this.glassBase * lerp(0.12, 1, this.arrive);
	}

	setDay(day: boolean) {
		const to = day ? 1 : 0;
		if (to !== this.dayTo) {
			this.dayFrom = this.dayMix;
			this.dayT = this.clock;
			this.moonFrom = this.moonK;
			this.moonT = this.clock;
		}
		this.dayTo = to;
		// (the doves come with the trees, when the page has had its turn)
		this.air?.setDay(day);
		this.islet?.setDay(day);
		if (this.reduced) {
			this.dayMix = this.dayTo;
			this.moonK = this.dayTo;
			this.moonT = -1;
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
		this.scrolledAt = performance.now();
		this.stillSinceScroll = true;
		this.pageMax = Math.max(1, document.documentElement.scrollHeight - innerHeight);
		this.wake();
	}
	/** how far the page scrolls, for the length of the descent */
	private pageMax = 1;
	/** the pointer has not moved since the page last scrolled */
	private stillSinceScroll = false;
	private scrolledAt = -1e9;
	/** the page is moving, or has only just stopped */
	private get scrolling() {
		return (
			performance.now() - this.scrolledAt < 450 || Math.abs(this.scrollSmooth - this.scroll) > 0.5
		);
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
		// The screen's own density, up to a budget of pixels: a laptop's
		// Retina screen is drawn whole (drawn under it and stretched up, the
		// picture was soft, and its fine leaves shimmered), and only a large,
		// dense monitor a little under. A phone's picture is small and seen
		// close: it may go up to its own density, three, as far as its budget
		// allows; it starts at two and the governor takes it up only while the
		// frames keep time.
		this.native = Math.min(window.devicePixelRatio || 1, this.flowing ? 3 : 2);
		this.dprCap = Math.min(this.native, Math.sqrt((this.flowing ? 2.6e6 : 8.0e6) / (w * h)));
		this.dprCap = Math.max(1, Math.round(this.dprCap * 4) / 4);
		this.dpr = Math.min(this.dpr, this.dprCap);
		this.settleAt = performance.now() + 1500;
		this.renderer.setSize(w, h, false);
		this.sizeBuffers();
		this.sizeSky();
		this.camera.aspect = w / h;
		// fit the island and its trees into the part of the screen it owns
		const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
		// The whole island, from the tops of the cypresses to the point of the
		// rock: it is a thing floating, and it has to be seen whole to read so.
		// Where the words stack under it, on a narrow screen, it is the width
		// that binds, and there it is fitted to the span of its crowns rather
		// than a margin round them, or it is small, far off, and every fine
		// thing in it is under a pixel.
		const side = this.layout === 'side';
		const [fw, fh] = side ? [0.52, 0.8] : [1.0, 0.54];
		const subjectW = side ? 17 : 15.6,
			subjectH = 17.2;
		const dW = subjectW / (fw * 2 * tan * this.camera.aspect);
		const dH = subjectH / (fh * 2 * tan);
		this.dist = Math.max(dW, dH);
		// the moon keeps its size against the island: where the island has
		// to be drawn from further off to fit a narrow screen, the moon is
		// smaller with it, or on a phone it is a plate over the dome
		this.sky.uniforms.uMoonS.value = clamp(40 / this.dist, 0.45, 1);
		this.hv = 2 * this.dist * tan;
		const [fx, fy] = side ? [0.31, 0.5] : [0.5, 0.29];
		this.moonDir.copy(moonAt(...MOON[this.layout]));
		this.sunAz = SUN_AZ[this.layout];
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
		// The picture goes with the page exactly: smoothed, it trailed the
		// words on a fast swipe and went on sliding a moment after they had
		// stopped, a small second move when everything should be still.
		this.scrollSmooth = this.scroll;
		const p = this.flowing ? 0 : clamp(this.scrollSmooth / H, 0, 2.4);
		// the entrance (see begin): the turn and the drift in eased both ways,
		// the rise eased out, quick off the mark and slow into its place
		let k = 1,
			rise = 0;
		if (this.intro.t < 0) ((k = 0), (rise = 1));
		else if (this.intro.t < this.intro.dur) {
			const u = this.intro.t / this.intro.dur;
			k = easeInOut(u);
			rise = Math.pow(1 - u, 3);
		}
		const back = lerp(1.1, 1, k);
		// sinking past the island, and looking up at it as it goes by
		// Beside the words the island can linger and be looked up at as it goes;
		// over them, where they stack, it keeps ahead of the text it would cover.
		const rate = this.layout === 'side' ? 0.55 : 0.8;
		const descend = Math.min(p, 1.7) * rate * this.hv + Math.max(0, p - 1.7) * 0.15 * this.hv;
		// The camera only sinks; it does not tip. Going below the island is
		// enough to see its underside, and a level camera keeps the horizon and
		// the moon where they were, behind the page as well as the picture.
		const pitch = THREE.MathUtils.degToRad(8) + this.pitchNudge + this.pitchDrag;
		// (not on a phone, where the slow turn drags every fine edge across
		// the pixels and the picture crawls)
		const drift = this.reduced || this.flowing ? 0 : Math.sin(this.clock * 0.045) * 0.06;
		const yaw = this.yaw + drift + lerp(-0.24, 0, k);
		this.viewYaw = this.peekAt ? 0 : yaw;
		// the island comes up from a third of the picture below its place: the
		// camera, and what it looks at, go down past it instead, which with the
		// sky held still is the same thing
		const target = new THREE.Vector3(0, -0.9 - descend + rise * 0.32 * this.hv, 0);
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
			if (this.camera.near !== 0.3) {
				this.camera.near = 0.3;
				this.camera.updateProjectionMatrix();
			}
		}
		return p;
	}

	/**
	 * Going down the page is going down past the island, through the cloud,
	 * and out of the bottom of it. The sky tips away as the island rises, so
	 * the moon and the stars go up out of the picture with it and the sea of
	 * cloud comes up under the eye; the eye sinks to the tops and into them,
	 * and while it is in the white the view comes level again; then it comes
	 * out underneath, into the air under the cloud, and goes on down through
	 * it for the rest of the page.
	 */
	private descend() {
		const u = this.sky.uniforms;
		if (this.flowing) {
			// the picture goes with the page: nothing in it moves with the scroll
			this.skyTip = 0;
			u.uEye.value = 1;
			u.uMist.value = 0;
			u.uUnder.value = 0;
			return;
		}
		const all = this.scrollSmooth / this.H;
		const deg = THREE.MathUtils.degToRad;
		// down toward the sea, and then, hidden in the cloud, level again and
		// a little up, so the ceiling shows over the words
		const over = deg(-20) * smoothstep(0.05, 1.15, all);
		const under = deg(2 - (SKY_TILT[this.layout] - 8));
		this.skyTip = lerp(over, under, smoothstep(1.62, 1.82, all));
		u.uEye.value = 1 - 0.52 * smoothstep(0.45, 1.6, all);
		// in, all white for a moment, and out
		u.uMist.value = smoothstep(1.3, 1.62, all) * (1 - smoothstep(1.85, 2.3, all));
		u.uUnder.value = smoothstep(1.62, 1.82, all);
		// how far under the cloud: the whole rest of the page is the one
		// descent, however long the page is on this screen
		const rest = Math.max(1, this.pageMax / this.H - 1.8);
		u.uAlt.value = 0.12 + (Math.max(0, all - 1.8) / rest) * 5.2;
		// the folds rush by on the way through
		u.uDrift.value =
			0.2 * all + 1.1 * clamp(all - 1.3, 0, 0.7) + (this.reduced ? 0 : this.clock * 0.005);
	}

	// ── the islet, over the reading room ──────────────────────────────────
	/** The reading room's canvas, where the islet is drawn over its glass. */
	setIsletCanvas(c: HTMLCanvasElement) {
		this.isletCanvas = c;
	}

	/**
	 * A paper is open: the islet comes up on the reading room's canvas, `w`
	 * by `h` of the page's pixels, framed in the top `frameH` of it. Or, with
	 * null, the paper has closed and it goes.
	 */
	read(size: { w: number; h: number; frameH: number } | null) {
		if (size) {
			this.buildIslet(true);
			const v = this.islet;
			if (!v) return;
			// the screen's own density, up to a budget of pixels (the grove is
			// not drawn while it shows, so it has the grove's time to spend)
			const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4.5e6 / (size.w * size.h)));
			v.frame(size.w, size.h, size.frameH, Math.max(1, dpr));
			v.open();
		} else this.islet?.close();
		this.wake();
	}

	/** reading: the islet is coming, there, or going */
	private get reading() {
		return !!this.islet?.active;
	}

	/**
	 * Built once the grove has come in and the page is idle; its programs are
	 * made then too, in its own context, so the first paper opened does not
	 * wait for them. (A phone's reading room has no room for it.)
	 */
	private buildIslet(now = false) {
		if (this.islet || !this.isletCanvas || this.flowing || !this.live) return;
		// in three parts, each at an idle moment of its own, so none of them is
		// a pause the page can feel: the rock and its ground and water, then
		// the planting, then its renderer; or all at once, if a paper is
		// opened before they are done
		if (!this.isletQueue) {
			const canvas = this.isletCanvas;
			const phone = Math.min(window.innerWidth, window.innerHeight) < 700;
			let islet: Islet;
			let view: IsletView;
			this.isletQueue = [
				() =>
					(islet = new Islet(
						{
							rock: this.island.rockMat,
							rockMap: this.rockTex,
							lawn: this.lawnTex,
							bark: this.mats.bark,
							glass: this.glassMat
						},
						Math.floor(this.rand() * 1e6),
						{ phone }
					)),
				() => islet.grow(),
				() => islet.plantTree(),
				() => islet.plantShrubs(),
				() => islet.plantFlowers(),
				() => {
					view = new IsletView(canvas, islet, this.reduced);
					view.onMiss = () => this.onIsletMiss?.();
					// its gramophone plays the grove's record
					view.onGramophone = () => this.onGramophone?.();
					this.islet = view;
				},
				() => view.skies(),
				() => void view.compile().then(() => idle(() => view.warm()))
			];
		}
		const q = this.isletQueue;
		if (now) {
			// (the last step, the compiling, the first frame does instead)
			while (q.length > 1) q.shift()!();
			q.length = 0;
			return;
		}
		const next = () => {
			const f = q.shift();
			if (!f) return;
			f();
			// (frames about a step of the building are no measure of the scene)
			this.settleAt = performance.now() + 1000;
			if (q.length) idle(next);
		};
		idle(next);
	}
	private isletQueue: (() => void)[] | null = null;

	/** Debugging: look at a point from a distance, or null to let go. */
	peekAt: { x: number; y: number; z: number; d: number; yaw: number; pitch: number } | null = null;

	// ── input ─────────────────────────────────────────────────────────────
	private on(t: EventTarget, type: string, fn: EventListener, o?: AddEventListenerOptions) {
		t.addEventListener(type, fn, o);
		this.listeners.push([t, type, fn, o]);
	}

	private bind() {
		const cv = this.renderer.domElement;
		// (made at the start of the next frame, before it is drawn: a canvas
		// resized is wiped, and resized between frames it would be shown so,
		// a black frame, the canvas being opaque)
		this.on(window, 'resize', () => {
			this.pendingResize = true;
			this.wake();
		});
		this.on(document, 'visibilitychange', () => (document.hidden ? this.stop() : this.wake()));
		this.on(cv, 'pointermove', ((e: PointerEvent) => {
			this.setPointer(e);
			this.pointerOn = e.pointerType === 'mouse';
			// the machine lights its outline when a mouse comes over it
			if (e.pointerType === 'mouse' && !this.drag) {
				const over = this.pick() === 'gramophone';
				if (over !== this.overGram) {
					this.overGram = over;
					cv.style.cursor = over ? 'pointer' : '';
				}
			}
			if (this.grab && this.grab.id === e.pointerId) {
				// bending a tree by hand: the drag across the screen, as a tilt
				const g = this.grab;
				const dx = (e.clientX - g.x) / this.H,
					dy = (e.clientY - g.y) / this.H;
				if (Math.hypot(dx, dy) > 0.01) g.moved = true;
				const right = this.flatDir(
					new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion)
				);
				const fwd = this.flatDir(this.camera.getWorldDirection(new THREE.Vector3()));
				const t = right.multiplyScalar(dx * 1.6).addScaledVector(fwd, -dy * 1.1);
				const m = t.length();
				if (m > 0.32) t.multiplyScalar(0.32 / m);
				const sp = this.spring(g.tree);
				sp.tx = t.x;
				sp.tz = t.z;
			} else if (e.pointerType === 'mouse' && !this.drag && e.buttons === 0) {
				// a mouse passing through a crown pushes it along the way it goes
				const over = this.pick();
				if (over && over !== 'gramophone' && this.lastMove) {
					const dx = e.clientX - this.lastMove.x,
						dy = e.clientY - this.lastMove.y;
					const right = this.flatDir(
						new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion)
					);
					const fwd = this.flatDir(this.camera.getWorldDirection(new THREE.Vector3()));
					const sp = this.spring(over);
					const k = 0.0016;
					sp.vx += (right.x * dx - fwd.x * dy * 0.5) * k;
					sp.vz += (right.z * dx - fwd.z * dy * 0.5) * k;
				}
			}
			this.lastMove = { x: e.clientX, y: e.clientY };
			if (this.drag && this.drag.id === e.pointerId) {
				const dx = e.clientX - this.drag.x,
					dy = e.clientY - this.drag.y;
				if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
				// all the way round if you like; a drag across the page is half a turn
				this.yaw = this.drag.yaw - (dx / this.W) * 3.2;
				// and up or down, a tilt: pulled down, the island is seen from
				// higher, its lawn and its roof; pushed up, from lower, its rock.
				// Within bounds, and it goes back to rest when let go.
				this.pitchDragTo = clamp(this.drag.pitch + (dy / this.H) * 1.1, -0.12, 0.36);
				// its speed, over real time and smoothed, for the throw
				const now = performance.now();
				const dt = (now - this.spinSample.t) / 1000;
				if (dt > 0.004) {
					const v = (this.yaw - this.spinSample.yaw) / dt;
					this.yawVel = lerp(this.yawVel, clamp(v, -8, 8), Math.min(1, dt * 18));
					this.spinSample = { yaw: this.yaw, t: now };
				}
			}
			this.wake();
		}) as EventListener);
		// a hand that has not moved since the page last scrolled: the
		// pointer has not left the island, the page has slid over it
		this.on(
			window,
			'pointermove',
			((e: PointerEvent) => {
				if (e.movementX || e.movementY) this.stillSinceScroll = false;
			}) as EventListener,
			{ passive: true, capture: true }
		);
		this.on(cv, 'pointerleave', () => {
			if (this.stillSinceScroll) return;
			this.pointerOn = false;
			this.overGram = false;
			cv.style.cursor = '';
		});
		this.on(cv, 'pointerdown', ((e: PointerEvent) => {
			this.setPointer(e);
			const hit = this.pick();
			if (hit === 'gramophone') {
				// a touch has no hover: the outline flashes as it is pressed
				this.gramFlash = 1;
				// A mouse plays it at once. A finger plays it as it is lifted:
				// a browser lets a page make a sound for a touch only when the
				// touch ends, and a record asked for as it began would be
				// refused without a word.
				if (e.pointerType === 'mouse') this.onGramophone?.();
				else this.gramTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
				return;
			}
			if (hit && e.pointerType === 'mouse') {
				// the hand has hold of the tree, to bend it
				this.press(hit);
				this.grab = { tree: hit, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
				cv.setPointerCapture(e.pointerId);
				this.wake();
				return;
			}
			// a hand on a spinning island stops it
			this.yawVel = 0;
			this.spinSample = { yaw: this.yaw, t: performance.now() };
			this.drag = {
				id: e.pointerId,
				x: e.clientX,
				y: e.clientY,
				yaw: this.yaw,
				pitch: this.pitchDragTo,
				moved: false,
				t: this.clock,
				// On a touch screen the crowns are much of the island, and a
				// finger drawn over one turns and tilts the island like any
				// other; a tap, no drag, is what shakes the tree.
				tree: hit
			};
			cv.setPointerCapture(e.pointerId);
			this.wake();
		}) as EventListener);
		// A finger on the island itself has hold of it, to turn it and to tilt
		// it, up and down as well as across; anywhere else, the sky round it
		// or the words, a finger scrolls the page as it always does. It has to
		// be settled as the touch begins: a page once scrolling is not taken
		// back. (The gramophone is left alone, a tap being all it wants.)
		let held = false;
		this.on(
			cv,
			'touchstart',
			((e: TouchEvent) => {
				held = false;
				if (e.touches.length !== 1) return;
				const t = e.touches[0];
				this.pointAt(t.clientX, t.clientY);
				if (this.pick() === 'gramophone' || !this.onIsland()) return;
				held = true;
				if (e.cancelable) e.preventDefault();
			}) as EventListener,
			{ passive: false }
		);
		this.on(
			cv,
			'touchmove',
			((e: TouchEvent) => {
				if (held && e.cancelable) e.preventDefault();
			}) as EventListener,
			{ passive: false }
		);
		const up = ((e: PointerEvent) => {
			const tap = this.gramTap;
			if (tap?.id === e.pointerId) {
				this.gramTap = null;
				if (
					e.type === 'pointerup' &&
					Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 14 &&
					performance.now() - tap.t < 900
				)
					this.onGramophone?.();
			}
			if (this.drag?.id === e.pointerId) {
				if (this.drag.tree && !this.drag.moved && e.type === 'pointerup')
					this.press(this.drag.tree);
				this.drag = null;
				this.spunAt = this.clock;
				// a hand that had stopped before it let go throws nothing
				if (performance.now() - this.spinSample.t > 90 || this.reduced) this.yawVel = 0;
			}
			if (this.grab?.id === e.pointerId) {
				// let go: it springs back, and a hard bend shakes more loose
				const g = this.grab;
				const sp = this.spring(g.tree);
				const bent = Math.hypot(sp.x, sp.z);
				if (g.moved && bent > 0.06 && !this.reduced) {
					this.petals.shed(g.tree, this.touchPoint(g.tree), Math.round(bent * 60));
					rustleFrom(g.tree.crown.clone().setY(g.tree.height * 0.7), Math.min(1.4, bent * 5));
				}
				this.grab = null;
			}
			this.pressed = null;
			this.wake();
		}) as EventListener;
		this.on(cv, 'pointerup', up);
		this.on(cv, 'pointercancel', up);
	}

	/** a hand in a crown shakes it from where it went in, sets the tree
	 *  swaying away from it, and anything perched in it is off */
	private press(hit: Stand) {
		this.pressed = hit;
		const at = this.touchPoint(hit);
		rustleFrom(at, 1);
		if (!this.reduced) this.petals.shed(hit, at, 16);
		this.air.pressed(hit);
		const sp = this.spring(hit);
		const away = this.flatDir(this.camera.getWorldDirection(new THREE.Vector3()));
		sp.vx += away.x * 0.32;
		sp.vz += away.z * 0.32;
		this.wake();
	}

	private setPointer(e: PointerEvent) {
		this.pointAt(e.clientX, e.clientY);
	}

	private pointAt(x: number, y: number) {
		// from the canvas's own corner, which on a phone scrolls with the page
		const r = this.renderer.domElement.getBoundingClientRect();
		this.pointerNdc.set(((x - r.left) / this.W) * 2 - 1, -((y - r.top) / this.H) * 2 + 1);
	}

	/**
	 * Is the pointer on the island: its rock, its wall and lawn, a tree, or
	 * the rotunda? The island's own surfaces are few enough to be asked
	 * outright (this is once, as a finger comes down); a tree is its crown
	 * and its trunk; and the rotunda is taken as a drum as wide as
	 * its dome and as high as its finial.
	 */
	private onIsland() {
		this.ray.setFromCamera(this.pointerNdc, this.camera);
		if (this.ray.intersectObject(this.island.group, true).length) return true;
		const ray = this.ray.ray;
		const base = new THREE.Vector3(),
			e = new THREE.Ray();
		for (const t of this.trees) {
			// the crown, as wide as it reaches and as high as the tree: a ball
			// squashed to that, and the ray squashed with it
			const rh = t.crownR * 0.85,
				k = rh / Math.max(t.height - t.crown.y, 1);
			e.origin.subVectors(ray.origin, t.crown).setY((ray.origin.y - t.crown.y) * k);
			e.direction.set(ray.direction.x, ray.direction.y * k, ray.direction.z).normalize();
			if (e.distanceSqToPoint(base.set(0, 0, 0)) < rh * rh) return true;
			const p = t.items[0].pos;
			if (ray.distanceSqToSegment(base.set(p.x, 0.3, p.z), t.crown) < 0.45 ** 2) return true;
		}
		const { origin: o, direction: d } = ray;
		const pv = this.pavilion;
		const mid = -(o.x * d.x + o.z * d.z) / Math.max(d.x * d.x + d.z * d.z, 1e-6);
		for (let i = -20; i <= 20; i++) {
			const s = mid + i * 0.2;
			const y = o.y + d.y * s;
			if (
				y > pv.floorY - 0.4 &&
				y < pv.crown.y + 0.2 &&
				Math.hypot(o.x + d.x * s, o.z + d.z * s) < pv.dome.r + 0.3
			)
				return true;
		}
		return false;
	}

	/** What is under the pointer: the machine, a tree, or nothing. */
	private spring(t: Stand) {
		let s = this.springs.get(t);
		if (!s) this.springs.set(t, (s = { x: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0 }));
		return s;
	}

	private flatDir(v: THREE.Vector3) {
		v.y = 0;
		return v.lengthSq() > 1e-8 ? v.normalize() : v.set(0, 0, 1);
	}

	/**
	 * The trees' springs: a tree swings back through where it stood and rings
	 * down, a little under a second a swing, as a small tree does; held, it
	 * follows the hand stiffly; let go, it swings from wherever it was.
	 */
	/**
	 * A bent tree must not put its leaves through the rotunda. A leaf moves
	 * about the foot by the tilt times how much of it the tilt reaches, so
	 * the leaf that would meet the wall first sets how far the tree can lean
	 * that way. Beyond that the crown meets the building and stops.
	 */
	private keepOff(t: Stand, leaves: THREE.Vector3[]) {
		const it = t.items[0];
		const b = it.pos;
		const bl = Math.hypot(b.x, b.z);
		const nx = -b.x / bl,
			nz = -b.z / bl;
		const H = t.skeletons[0].height * it.scale;
		let max = 0.4;
		for (const p of leaves) {
			const c = rotundaClearance(p);
			if (c > 2.5) continue;
			const rl = Math.hypot(p.x, p.z);
			// how squarely a lean toward the rotunda carries this leaf at it
			const at = -(nx * p.x + nz * p.z) / Math.max(rl, 1e-3);
			if (at <= 0.05) continue;
			const h = THREE.MathUtils.clamp((p.y - b.y) / H, 0, 1.4);
			const reach = (0.35 * h + 0.65 * h * h) * (p.y - b.y) * at;
			if (reach > 1e-3) max = Math.min(max, (c - 0.1) / reach);
		}
		this.reach.set(t, { nx, nz, max: Math.max(0.02, max) });
	}

	private stepSprings(dt: number) {
		const h = Math.min(dt, 1 / 30);
		for (const [t, s] of this.springs) {
			const held = this.grab?.tree === t;
			if (!held) s.tx = s.tz = 0;
			const w = 2 * Math.PI * (held ? 2.2 : 0.8);
			const c = 2 * (held ? 0.9 : 0.16) * w;
			s.vx += (-(s.x - s.tx) * w * w - s.vx * c) * h;
			s.vz += (-(s.z - s.tz) * w * w - s.vz * c) * h;
			s.x += s.vx * h;
			s.z += s.vz * h;
			const m = Math.hypot(s.x, s.z);
			if (m > 0.4) {
				s.x *= 0.4 / m;
				s.z *= 0.4 / m;
			}
			// the crown comes up against the rotunda, and gives back a little
			const k = this.reach.get(t);
			if (k) {
				const c = s.x * k.nx + s.z * k.nz;
				if (c > k.max) {
					s.x -= (c - k.max) * k.nx;
					s.z -= (c - k.max) * k.nz;
					const v = s.vx * k.nx + s.vz * k.nz;
					if (v > 0) {
						s.vx -= 1.3 * v * k.nx;
						s.vz -= 1.3 * v * k.nz;
					}
				}
			}
			t.u.uSpring.value.set(s.x, s.z);
		}
	}

	/** where the pointer's ray passes into a crown */
	private touchPoint(t: Stand) {
		this.ray.setFromCamera(this.pointerNdc, this.camera);
		const c = t.crown.clone().setY(t.height * 0.72);
		const p = new THREE.Vector3();
		this.ray.ray.closestPointToPoint(c, p);
		return p.lerp(c, 0.25);
	}

	private pick(): Stand | 'gramophone' | null {
		this.ray.setFromCamera(this.pointerNdc, this.camera);
		const ray = this.ray.ray;
		const box = this.gramophone.hit.clone().applyMatrix4(this.gramophone.group.matrixWorld);
		const gHit = ray.intersectBox(box, new THREE.Vector3());
		let best: Stand | null = null,
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
		await this.plant();
		this.air = new Air(groveHabitat(this));
		this.air.setDay(this.dayTo > 0.5);
		this.world.add(this.air.group);
		const ts = performance.now();
		this.sky.bake(this.renderer);
		await this.texReady;
		this.sky.update(this.renderer);
		await this.bakeEnvironment();
		this.applyDay(this.dayMix);
		this.placeCamera(0);
		log('sky', 'scattering table · 2 environment maps', since(ts));
		// and, the programs being made, its fourth
		veil()?.dim?.(4);
		const tc = performance.now();
		try {
			await this.renderer.compileAsync(this.scene, this.camera);
		} catch {
			/* older engines: the first frame compiles instead */
		}
		log('gpu', `${this.renderer.info.programs?.length ?? 0} shader programs compiled`, since(tc));
		const td = performance.now();
		this.draw();
		{
			const gl = this.renderer.getContext();
			const i = this.renderer.info.render;
			log(
				'draw',
				`${gl.drawingBufferWidth}×${gl.drawingBufferHeight} · ${gl.getParameter(gl.SAMPLES)}× MSAA · ` +
					`${(i.triangles / 1e6).toFixed(2)} M tris · ${i.calls} calls`,
				since(td)
			);
			const dbg = gl.getExtension('WEBGL_debug_renderer_info');
			const name = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
			// "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, …)" → "Apple M4"
			const m = /^ANGLE \([^,]*, ([^,]*)/.exec(name);
			const gpu = (m ? m[1] : name).replace(/^.*Renderer: /, '').replace(/ Direct3D.*$/, '');
			log('gpu', gpu, 'WebGL 2');
		}
		// nothing is drawn until everything is compiled, or the first frame
		// compiles what is left while the page waits, and skips the shadows
		this.live = true;
		this.wake();
	}

	// The sky is the dearest thing in the frame, and at rest it hardly
	// changes: the cloud drifts less than a pixel a frame. So then it is
	// drawn whole every other frame, and every frame only while something
	// moves it: the page, the lights changing over, the moon going. (It was
	// once drawn half at a time instead, as a chequer; but anything that
	// moved slowly through it then stepped every other frame, pixel by
	// pixel, and shimmered.)
	skyDirty = true;
	private skyTick = 0;
	private draw() {
		this.sky.update(this.renderer);
		// Where the words stack under it, the island stands high in a tall
		// picture, looked down on, and the horizon would be the top edge: all
		// haze and no sky. So there the sky is drawn from a camera tipped up
		// a little, which puts blue over the garden and the horizon behind the
		// rock. Nothing on the island touches the horizon to give it away.
		//
		// And the sky does not turn when the view does. A hand on the page
		// turns the island, and the moon and the stars stay where they are;
		// only the scroll moves the camera the sky is drawn from: down, and
		// tipped away from the horizon (see descend).
		let cam = this.camera;
		if (!this.peekAt) {
			this.skyCam.copy(this.camera);
			this.skyCam.quaternion.setFromAxisAngle(
				RIGHT,
				THREE.MathUtils.degToRad(SKY_TILT[this.layout] - 8) + this.skyTip
			);
			this.skyCam.updateMatrixWorld();
			cam = this.skyCam;
		}
		// (and deep in the page, where the sky is all there is and it is drawn
		// only thirty times a second anyway, every time, or the cloud going by
		// steps)
		const moving =
			this.skyDirty ||
			this.scrolling ||
			!this.world.visible ||
			this.moonT >= 0 ||
			Math.abs(this.dayMix - this.dayTo) > 1e-4;
		this.skyTick ^= 1;
		if (moving || this.skyTick === 0) {
			this.sky.render(this.renderer, cam);
			this.skyDirty = false;
		}
		this.renderer.setRenderTarget(null);
		this.renderer.render(this.scene, this.camera);
		this.outline.draw(this.renderer, this.scene, this.camera, this.gramGlow);
	}

	/** The canvas at the drawing scale: the screen's own density, unless the frame rate asks for less. */
	private sizeBuffers() {
		const bw = Math.max(1, Math.round(this.W * this.dpr)),
			bh = Math.max(1, Math.round(this.H * this.dpr));
		this.renderer.setPixelRatio(this.dpr);
		this.renderer.setSize(this.W, this.H, false);
		U.uBufH.value = bh;
		this.outline.setSize(bw, bh);
	}

	/** The sky's sheet: fewer pixels by day, when it is all soft cloud, than
	 *  by night, when it carries stars a pixel across. */
	private sizeSky() {
		const px = this.W * this.dpr,
			py = this.H * this.dpr;
		// (sized for where the light is going, not for each step of the way,
		// or it is made anew every frame of the change)
		this.sky.setSize(px, py, lerp(0.7e6, 0.4e6, this.dayTo) * (this.flowing ? 0.5 : 1));
		this.skyDirty = true;
	}

	/** Begin the opening: the trees grow in, the camera settles, birds come. */
	/**
	 * The entrance. The island is there whole from the first frame, trees and
	 * all, low in the picture; as the veil lifts it floats up into its place,
	 * turning a little as it comes, and settles, and a breath of wind goes
	 * through the garden as it does. Then, by night, its lights come on: the
	 * lamp on the finial first, down the ribs of the dome and out along the
	 * swags, the lanterns, the fireflies. The sky holds still behind it.
	 */
	begin() {
		this.intro.t = this.reduced ? this.intro.dur + 4 : 0;
		this.air.begin();
		this.wake();
		if (!this.flowing) setTimeout(() => this.buildIslet(), 6500);
	}

	/** how far the island's lights have come on after its arrival, 0..1 */
	get arrive() {
		const t = this.intro.t;
		return t < 0 ? 0 : smoothstep(1.7, 3.9, t);
	}

	wake() {
		if (this.running || document.hidden || !this.live) return;
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
		// scrolled out of sight with the page: rest until it comes back
		if (this.flowing && this.scroll > this.H) {
			this.running = false;
			return;
		}
		this.raf = requestAnimationFrame(this.frame_);
		// Deep in the page there is only sky, drifting: at rest there it is
		// drawn thirty times a second, which cloud going by cannot tell from
		// sixty. Never while the page is moving, though: then the sky moves
		// with it and has to keep up.
		if (
			!this.world.visible &&
			!this.reading &&
			!this.scrolling &&
			Math.abs(this.dayMix - this.dayTo) < 1e-3 &&
			this.moonT < 0 &&
			now - this.last < 30
		)
			return;
		const dt = Math.min(0.05, (now - this.last) / 1000);
		this.last = now;
		// changes of size first, so the wiped canvas is drawn before it is seen
		if (this.pendingResize) {
			this.pendingResize = false;
			this.resize();
		}
		if (this.pendingScale) {
			this.setScale(this.pendingScale);
			this.pendingScale = 0;
		}
		const t0 = performance.now();
		this.update(dt);
		if (this.reading) {
			// Under the glass the page's picture holds still, and the glass over
			// it need not be frosted afresh each frame; it is drawn again only
			// while the light changes, now and then. Over it, the islet.
			const changing = Math.abs(this.dayMix - this.dayTo) > 1e-4 || this.moonT >= 0;
			if (changing && (this.readTick = (this.readTick + 1) % 4) === 0) this.draw();
			this.stepIslet(dt);
			return;
		}
		this.draw();
		this.adapt(performance.now() - t0, dt);
	};
	private readTick = 0;

	private stepIslet(dt: number) {
		const v = this.islet;
		if (!v) return;
		const shown = v.step(dt, {
			key: this.light,
			keyDir: this.keyDir,
			hemi: this.hemi,
			day: this.dayMix,
			exposure: this.exposure,
			warm: this.warm,
			envIntensity: this.scene.environmentIntensity,
			playing: this.playing,
			level: this.playing ? this.level() : 0
		});
		// its little lights, into the one glow map both pictures read
		if (shown) v.islet.lightUp(this.glow, 1 - this.dayMix, this.lampCol, this.flyCol);
	}

	private update(dt: number) {
		this.clock += dt;
		U.uTime.value = this.clock;
		if (this.intro.t >= 0) {
			const was = this.intro.t;
			this.intro.t += dt;
			// a breath of wind through the garden as it settles
			if (was < 1.6 && this.intro.t >= 1.6 && !this.reduced)
				rustleFrom(new THREE.Vector3(0, 2.6, 0), 0.8);
		}

		// the lights
		if (Math.abs(this.dayMix - this.dayTo) > 1e-4) {
			// eased at both ends, over two and a half seconds: the sun goes
			// down under the cloud, it is not switched off
			const k = this.dayT < 0 ? 1 : clamp((this.clock - this.dayT) / 2.4, 0, 1);
			this.dayMix = lerp(this.dayFrom, this.dayTo, easeInOut(k));
			if (k >= 1) this.dayMix = this.dayTo;
			this.applyDay(this.dayMix);
		}
		if (this.moonT >= 0) {
			// out quickly, and ahead of the light; back in over five seconds,
			// gathering way and slowing into its place
			const up = this.dayTo === 1;
			const k = clamp((this.clock - this.moonT) / (up ? 2.4 : 5), 0, 1);
			const e = up ? 1 - (1 - k) * (1 - k) : easeInOut(k);
			this.moonK = lerp(this.moonFrom, this.dayTo, e);
			if (k >= 1) this.moonT = -1;
			this.placeMoon();
		}

		// The island spins on after a throw, slowing gently over a couple of
		// seconds, as a thing with some weight to it would; left alone for a
		// while after, it drifts home on a slow spring, to the nearest whole
		// turn rather than back through every turn it was given.
		// While a record plays the island turns slowly round under the camera,
		// coming up to speed over a few seconds and running down as gently;
		// it goes home only a while after it has stopped.
		this.orbit = damp(this.orbit, this.playing && !this.reduced ? 0.09 : 0, 0.5, dt);
		if (this.orbit > 0.004) this.spunAt = this.clock;
		if (!this.drag) {
			this.yaw += (this.yawVel + this.orbit) * dt;
			const home = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2;
			if (!this.reduced && this.clock - this.spunAt > 5 && Math.abs(this.yawVel) < 0.4) {
				const w = 0.9;
				this.yawVel += (-(w * w) * (this.yaw - home) - 2 * w * this.yawVel) * dt;
			} else this.yawVel *= Math.exp(-dt * 0.9);
		}
		// the tilt a hand gave it goes back to rest when it is let go, slowly,
		// and while held follows the hand a touch behind, as a weight would
		if (!this.drag) this.pitchDragTo = damp(this.pitchDragTo, 0, this.reduced ? 20 : 0.9, dt);
		this.pitchDrag = damp(this.pitchDrag, this.pitchDragTo, 12, dt);
		// Turned, the island startles what sits on it: the birds go up and
		// circle over it until it is still. And the air goes
		// through the trees a little harder while it turns.
		const spinning = !!this.drag?.moved || Math.abs(this.yawVel) > 0.35;
		// (a hand's turn, or its throw; not the island's own slow way home)
		const byHand = !!this.drag?.moved || this.clock - this.spunAt < 1.5;
		if (
			spinning &&
			!this.wasSpinning &&
			byHand &&
			(Math.abs(this.yawVel) > 0.8 || this.drag?.moved)
		)
			this.air.startle();
		if (spinning || Math.abs(this.yawVel) < 0.2) this.wasSpinning = spinning;
		U.uWind.value = damp(
			U.uWind.value,
			this.windBase * (1 + Math.min(0.9, Math.abs(this.yawVel) * 0.3)),
			3,
			dt
		);
		// a little parallax from the pointer
		const px = this.pointerOn && !this.drag ? this.pointerNdc.x : 0;
		const py = this.pointerOn && !this.drag ? this.pointerNdc.y : 0;
		this.pitchNudge = damp(this.pitchNudge, py * 0.025, 2, dt);
		this.yaw += (px * 0.03 - 0) * dt;

		const p = this.placeCamera(dt);
		this.descend();
		this.aimKey();
		const visible = p < 1.85;
		this.world.visible = visible;
		// (the light keeps its shadow even when the island is out of sight:
		// turning it off and on changes every material's program, and each
		// change is a recompile in the middle of a scroll)
		// the shadows follow the wind a dozen times a second: a crown's soft
		// shadow on the lawn moves too slowly for the difference to show, and
		// the shadow pass, which draws every tree a second time, was the
		// largest single thing in the frame
		this.shadowTick = (this.shadowTick + 1) % 5;
		const quick = this.intro.t >= 0 && this.intro.t < this.intro.dur + 1.5;
		// and while the page scrolls nothing the sun sees moves but leaves in
		// the wind, which nobody reading can tell from still: they wait
		this.renderer.shadowMap.needsUpdate =
			visible &&
			(quick ||
				!!this.pressed ||
				!!this.grab ||
				!!this.drag ||
				Math.abs(this.yawVel) > 0.02 ||
				(this.shadowTick === 0 && (!this.scrolling || this.orbit > 0.004)));
		// the lantern's, only while the island is still arriving
		if (quick) this.lamp.shadow.needsUpdate = true;

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
				delay = 0.7 + this.trees.indexOf(t) * 0.16;
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
		}

		// the machine
		if (this.playing) {
			this.crankA += dt * 5.2;
			this.gramophone.crank.rotation.x = this.crankA;
			this.gramophone.record.rotation.y -= dt * 3.5;
		}
		this.stepSprings(dt);
		// lit up under the hand, eased in and out
		this.gramFlash = Math.max(0, this.gramFlash - dt * 1.4);
		this.gramGlow = damp(this.gramGlow, this.overGram ? 1 : this.gramFlash, 9, dt);
		// a little warmth in the brass, and the line round it
		this.gramophone.hover.value = this.gramGlow * 0.6;
		// and what comes out of it
		const g = this.gramophone.group;
		this.mouth.copy(this.gramophone.mouth).applyMatrix4(g.matrixWorld);
		this.mouthDir.copy(this.gramophone.mouthDir).transformDirection(g.matrixWorld);
		const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
		this.notes.update(
			dt,
			this.playing ? this.level() : 0,
			this.playing && !this.reduced,
			this.mouth,
			this.mouthDir,
			((this.H * this.dpr) / (2 * tan)) * 0.36
		);

		// the light's view-space direction, for leaves lit from behind
		U.uSunView.value
			.copy(this.light.position)
			.normalize()
			.transformDirection(this.camera.matrixWorldInverse);
		this.light.target.position.set(0, 0, 0);

		this.fairy.update((1 - this.dayMix) * this.arrive, this.clock, this.reduced);
		// the lamps come up with the rest after the arrival
		const up = lerp(0.12, 1, this.arrive);
		this.lamp.intensity = this.lampBase * up;
		this.glassMat.emissiveIntensity = this.glassBase * up;
		this.air.update(dt, visible, this.viewYaw, !!this.drag?.moved || Math.abs(this.yawVel) > 0.35);
		if (visible) {
			this.lightUp();
			this.petals.update(dt, this.blooms, this.reduced);
		}
	}

	/** Lay the lanterns' and the fireflies' light into the glow map. */
	private lampCol = new THREE.Color(1.0, 0.55, 0.22);
	private flyCol = new THREE.Color(0.8, 1.0, 0.45);
	private fairyCol = new THREE.Color(1.0, 0.6, 0.28);
	private lightUp() {
		const night = 1 - this.dayMix;
		const g = this.glow;
		g.begin();
		const li = lerp(0.35, 1.6, night) * lerp(0.12, 1, this.arrive);
		for (const p of this.lanterns) g.add(p, this.lampCol, li, 2.6);
		// only the soft part of its light: the spot does the rest, with shadows
		g.add(this.pavilion.lantern, this.lampCol, li * 0.3, 2.2);
		// the fairy lights, a warm wash on the brick under each swag
		// the fairy lights: on the brick round them and out into the crowns
		// either side, which is most of what makes them look lit
		if (night > 0.02)
			for (const p of this.fairy.glowAt) g.add(p, this.fairyCol, night * 0.45 * this.arrive, 2.1);
		if (night > 0.02) {
			const { pos, glow } = this.air.fireflies;
			const v = new THREE.Vector3();
			for (let i = 0; i < glow.length; i++) {
				if (pos[i * 3 + 1] < -50 || glow[i] < 0.02) continue;
				v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
				// a firefly lights the leaf it is by, not the garden
				g.add(v, this.flyCol, glow[i] * 0.07, 0.4);
			}
		}
		g.end();
	}

	/** Hold the frame rate by giving up resolution, and take it back when there is room. */
	private adapt(ms: number, dt: number) {
		const now = performance.now();
		// The opening is no measure of the scene: pictures decoding, programs
		// compiling, the islet built in the gaps. Judged on it, the picture
		// came down to half the screen's density in its first seconds and
		// stayed there. Nor are the frames after a change of size or scale.
		if (this.intro.t < this.intro.dur + 1.5 || now < this.settleAt) {
			this.frameTimes.length = 0;
			this.scrollTimes.length = 0;
			return;
		}
		// Frames while the page scrolls are the ones that matter most, and
		// the dearest: the sky is drawn every frame then, not every other. So
		// they are counted too, apart, and if they came late the scale comes
		// down once the page is still: judged only at rest it would climb back
		// to where the next scroll stutters again.
		if (this.scrolling) {
			if (this.world.visible) this.scrollTimes.push(dt * 1000);
			this.frameTimes.length = 0;
			return;
		}
		// Never changed mid-scroll (a change of resolution reallocates every
		// buffer, a hitch just where the eye follows the motion), nor deep in
		// the page, where frames are held back on purpose, nor in the first
		// seconds after a scroll, which run heavy (shadows catching up,
		// pictures decoding).
		if (!this.world.visible || now - this.scrolledAt < 2500) {
			this.frameTimes.length = 0;
			return;
		}
		if (this.scrollTimes.length >= 40) {
			const late = this.lateness(this.scrollTimes);
			this.scrollTimes.length = 0;
			if (late > 0.08 && this.dpr > 1) {
				this.lower(now);
				return;
			}
		}
		this.scrollTimes.length = 0;
		this.frameTimes.push(dt * 1000);
		if (this.frameTimes.length < 90) return;
		const s = this.frameTimes.slice().sort((a, b) => a - b);
		this.frameTimes.length = 0;
		const tick = s[Math.floor(s.length * 0.1)];
		const late = this.lateness(s);
		// A scale given up is not tried again at once, or the picture sharpens
		// and softens by turns; but not given up for good either, or one bad
		// moment (another app busy, a tab opening) left it soft all visit. It
		// is tried again after half a minute of frames that keep time, and if
		// that fails, after twice as long.
		const top =
			now - this.ceilAt > this.ceilWait ? this.dprCap : Math.min(this.dprCap, this.dprCeil);
		// (and only after two bad spells running: one alone is as often some
		// other app's moment as this one's, and a change of scale is itself a
		// hitch, every buffer made anew)
		const bad = (late > 0.12 || tick > 22) && this.dpr > 1;
		this.strikes = bad ? this.strikes + 1 : 0;
		if (this.strikes >= 2) {
			this.strikes = 0;
			this.lower(now);
		} else if (!bad && late < 0.03 && tick < 18 && ms < tick * 0.5 && this.dpr < top)
			this.pendingScale = Math.min(top, this.dpr + 0.25);
	}
	private strikes = 0;

	/** a step down in scale, and a ceiling under the one that failed */
	private lower(now: number) {
		// (back up where it failed before, and failed again: wait longer)
		if (this.dpr > this.dprCeil) this.ceilWait = Math.min(this.ceilWait * 2, 8 * 60e3);
		this.dprCeil = Math.max(1, this.dpr - 0.25);
		this.ceilAt = now;
		this.pendingScale = this.dprCeil;
	}

	/**
	 * How many frames came late. Judged against the display, not against
	 * sixty: the shortest usual interval is its refresh, 8 ms on a 120 Hz
	 * screen, and a frame that takes half again as long has missed one. A
	 * few misses are judder the eye sees the moment the page moves.
	 */
	private lateness(times: number[]) {
		const s = times.slice().sort((a, b) => a - b);
		const tick = s[Math.floor(s.length * 0.1)];
		return s.filter((d) => d > tick * 1.5).length / s.length;
	}

	private setScale(d: number) {
		this.dpr = d;
		this.settleAt = performance.now() + 1000;
		this.sizeBuffers();
		this.sizeSky();
	}

	/** the scale the picture's buffers are drawn at, for anything sized in their pixels */
	get bufferScale() {
		return this.dpr;
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
		this.outline.dispose();
		this.renderer.dispose();
	}
}

export { ISLAND };
