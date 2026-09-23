import * as THREE from 'three';
import { U } from './shared';
import { createSky, sunLight } from './sky';
import {
	BloomEffect,
	Effect,
	BlendFunction,
	EffectComposer,
	EffectPass,
	RenderPass,
	ToneMappingEffect,
	ToneMappingMode
} from 'postprocessing';
import {
	brickTextures,
	lawnTexture,
	barkTextures,
	woodTexture,
	ashlarTextures,
	rockTextures,
	flagTextures
} from './textures';
import { buildIsland, buildLanterns, ISLAND, type IslandParts } from './island';
import { Glow } from './glow';
import { buildRotunda, type RotundaParts } from './rotunda';
import { buildGramophone, type Gramophone } from './gramophone';
import {
	buildStand,
	prepareStand,
	sharedCanopy,
	SHADOW_LAYER,
	type Stand,
	type PlantItem
} from './flora/plants';
import type { Canopy } from './flora/canopy';
import { OLIVE, CYPRESS, WHITE_SHRUB, ROSE_SHRUB, VINE } from './flora/species';
import { rustleFrom } from './flora/wind';
import { Petals } from './flora/petals';
import { patch, nightPatch } from './shared';
import { rng, clamp, damp, easeInOut, lerp, smoothstep } from './rng';
import { Air } from './air';
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
const MOON_DIR = moonAt(12, 4.6);
const SUN_AZ = { side: -20, stack: -12 };
// an afternoon sun, above the top of the picture: the sky blue overhead and
// only the air round the sun warm
const SUN_EL = 10;
/** where the disc goes when the lights go down: under the cloud */
const SUN_SET_EL = -7;
const KEY_EL = 32;

/** The grade, after the tone map and in display terms: a little more
 *  saturation than AgX leaves, a gentle S for contrast, warm lights and cool
 *  shadows. Then every pixel opaque, whatever wrote alpha before it. */
class Grade extends Effect {
	constructor() {
		super(
			'Grade',
			`uniform float uSat;
			uniform float uCon;
			uniform float uWarm;
			void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
				vec3 c = pow(max(inputColor.rgb, 0.0), vec3(1.0 / 2.2));
				float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
				c = mix(vec3(l), c, uSat);
				c = mix(c, c * c * (3.0 - 2.0 * c), uCon);
				c *= mix(vec3(0.97, 0.99, 1.05), vec3(1.04, 1.0, 0.95), smoothstep(0.15, 0.85, l) * uWarm + (1.0 - uWarm) * 0.5);
				outputColor = vec4(pow(max(c, 0.0), vec3(2.2)), 1.0);
			}`,
			{
				blendFunction: BlendFunction.SET,
				uniforms: new Map([
					['uSat', new THREE.Uniform(1.18)],
					['uCon', new THREE.Uniform(0.34)],
					['uWarm', new THREE.Uniform(1.0)]
				])
			}
		);
	}
}

export class Grove {
	renderer: THREE.WebGLRenderer;
	scene = new THREE.Scene();
	camera: THREE.PerspectiveCamera;
	sky = createSky();
	private composer: EffectComposer;
	private grade = new Grade();
	private bloom: BloomEffect;
	private sunAz = SUN_AZ.side;
	private light: THREE.DirectionalLight;
	private hemi: THREE.HemisphereLight;
	private envDay: THREE.Texture | null = null;
	private envNight: THREE.Texture | null = null;
	private moonDir = MOON_DIR.clone();
	private world = new THREE.Group();
	island!: IslandParts;
	pavilion!: RotundaParts;
	private glow = new Glow();
	private petals = new Petals();
	private lanterns: THREE.Vector3[] = [];
	private glassMat = new THREE.MeshStandardMaterial({
		color: 0x2a2014,
		emissive: new THREE.Color(1.0, 0.5, 0.17),
		emissiveIntensity: 0,
		roughness: 0.3
	});
	/** the lantern in the rotunda: warm, lit at dusk, brighter by night */
	private lamp = new THREE.PointLight(0xffa04a, 0, 9, 2);
	gramophone!: Gramophone;
	trees: Stand[] = [];
	/** every stand on the island, and the light inside them all */
	garden: Stand[] = [];
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
	private pressed: Stand | null = null;
	private growth = new Map<Stand, { g: number; to: number; pop: number; popV: number }>();
	private intro = { t: -1, dur: 3.4 };
	private dpr = 1;
	private dprCap = 2;
	private frameTimes: number[] = [];
	private ray = new THREE.Raycaster();
	private playing = false;
	/** a tree in the hand, and every tree's spring */
	private grab: { tree: Stand; id: number; x: number; y: number; moved: boolean } | null = null;
	private springs = new Map<
		Stand,
		{ x: number; z: number; vx: number; vz: number; tx: number; tz: number }
	>();
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
	private level: () => number;
	private notes = new Notes();
	private mouth = new THREE.Vector3();
	private mouthDir = new THREE.Vector3();

	constructor(opts: GroveOptions) {
		this.reduced = opts.reduced;
		this.dayMix = this.dayTo = opts.day ? 1 : 0;
		this.onGramophone = opts.onGramophone;
		this.level = opts.level ?? (() => 0);
		this.rand = rng(opts.seed ?? Date.now() & 0xffff);
		const r = new THREE.WebGLRenderer({
			canvas: opts.canvas,
			// the frame is drawn off screen, multisampled, and tone-mapped on
			// the way out; the canvas itself needs neither
			antialias: false,
			depth: false,
			alpha: false,
			powerPreference: 'high-performance',
			stencil: false
		});
		r.outputColorSpace = THREE.SRGBColorSpace;
		r.toneMapping = THREE.NoToneMapping;
		// read by the tone-mapping pass, which is where exposure lives now
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
		this.sky.uniforms.uMoon.value.copy(this.moonDir);
		this.scene.add(this.sky.backdrop);

		// The frame: drawn in linear light into a half-float, multisampled
		// buffer, then one pass that blooms what is brighter than white, tone
		// maps the lot with AgX, dithers, and seals the alpha (a browser that
		// composites a canvas's alpha, as WebKit does even when asked not to,
		// would otherwise show the page through every leaf's edge).
		this.composer = new EffectComposer(r, {
			frameBufferType: THREE.HalfFloatType,
			multisampling: Math.min(4, r.capabilities.maxSamples)
		});
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.bloom = new BloomEffect({
			mipmapBlur: true,
			levels: 6,
			// only lamps, fireflies and the sun bloom: a lit cloud blooming
			// is a veil over everything
			luminanceThreshold: 2.6,
			luminanceSmoothing: 0.12,
			intensity: 0.45,
			radius: 0.7
		});
		const pass = new EffectPass(
			this.camera,
			this.bloom,
			new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
			this.grade
		);
		pass.dithering = true;
		this.composer.addPass(pass);
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
		this.mats = { brick, copper, bark, stone: brick };
		const ashlar = ashlarTextures(aniso);
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
		const brass = patch(
			new THREE.MeshStandardMaterial({ color: 0xd8a650, metalness: 1, roughness: 0.26 }),
			'brass',
			nightPatch
		);

		this.island = buildIsland(
			{ ashlar, rock: rockTextures(aniso), flags: flagTextures(aniso), lawn: lawnTexture(aniso) },
			this.rand() * 10
		);
		this.world.add(this.island.group);
		this.pavilion = buildRotunda(brick, stone, bronze);
		this.world.add(this.pavilion.group);
		this.lamp.position.copy(this.pavilion.lantern);
		const lan = buildLanterns(stone, bronze, this.glassMat);
		this.world.add(lan.group);
		this.lanterns = lan.lights;
		this.pavilion.lanternGlass.material = this.glassMat;
		U.uGlowMap.value = this.glow.tex;
		this.lamp.castShadow = false;
		this.world.add(this.lamp);
		this.gramophone = buildGramophone(brass, woodTexture(aniso));
		// on the floor just inside the front arch, the horn turned to the door
		this.gramophone.group.position.set(0.12, this.pavilion.floorY, 0.4);
		this.gramophone.group.scale.setScalar(1.15);
		this.gramophone.group.rotation.y = 0.3;
		this.world.add(this.gramophone.group);
		this.world.add(this.notes.points);
		this.world.add(this.petals.mesh);

		this.plant();
	}

	/** Deal the stand: every species at least once, the rest at random. */
	/**
	 * The garden, after the old ones it remembers: two olives either side of
	 * the doorway; cypresses behind, dark against the sky; flowering shrubs
	 * along the wall where they can spill over it, roses by the steps with
	 * urns of them; and ivy over the coping, falling down the rock.
	 */
	private plant() {
		const r = this.rand;
		const phone = Math.min(window.innerWidth, window.innerHeight) < 700;
		const opt = {
			barkMap: this.mats.bark.map!,
			barkNormal: this.mats.bark.normalMap!,
			rows: 3,
			density: phone ? 0.5 : 0.8,
			minRadius: phone ? 0.017 : 0.012
		};
		const seed = () => Math.floor(r() * 1e6);
		const at = (a: number, rad: number, y = 0) =>
			new THREE.Vector3(Math.sin(a) * rad, y, Math.cos(a) * rad);
		const { R, lawn: RL, wallTop } = ISLAND;

		// olives either side of the doorway, a little behind it
		const side = r() < 0.5 ? 1 : -1;
		const olives: PlantItem[] = [side, -side].map((sgn, i) => ({
			species: OLIVE,
			seed: seed(),
			pos: at(sgn * lerp(1.32, 1.5, r()), lerp(4.3, 4.8, r())),
			rotY: r() * Math.PI * 2,
			scale: lerp(1.32, 1.45, i === 0 ? r() : 1 - r())
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
		const preps = groups.map((g) => prepareStand(g, opt.density));
		const canopy = sharedCanopy(preps);
		const stands = preps.map((p, i) => buildStand(groups[i], { ...opt, canopy }, p));
		for (const st of stands) {
			this.world.add(st.group);
			this.growth.set(st, { g: 1, to: 1, pop: 0, popV: 0 });
		}
		this.trees = [stands[0], stands[1]];
		this.garden = stands;
		this.canopy = canopy;
		this.shadeLawn();
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
		u.uStars.value = 0;
		u.uMix.value = 1;
		this.envDay = pm.fromScene(envScene, 0, 0.1, 100).texture;
		u.uMix.value = 0;
		this.envNight = pm.fromScene(envScene, 0, 0.1, 100).texture;
		u.uMix.value = keep;
		u.uStars.value = 1;
		u.uSun.value.copy(keepSun);
		this.sky.update(this.renderer);
		pm.dispose();
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
		// the key comes from the side the sun is on, well round from it, so
		// the island's face takes the gold and its shadows fall across it
		const key = moonAt(this.sunAz - 40, KEY_EL);
		const moonLight = this.moonDir.clone().setY(Math.max(this.moonDir.y, 0.28)).normalize();
		const dir = moonLight.lerp(key, k).normalize();
		this.light.position.copy(dir).multiplyScalar(30);
		// the sun's colour is the sky's: what is left of white after the air
		const sunCol = sunLight(THREE.MathUtils.degToRad(KEY_EL), 1.5);
		sunCol.multiplyScalar(1 / Math.max(sunCol.r, sunCol.g, sunCol.b));
		const moonCol = new THREE.Color(0.7, 0.8, 1.0);
		this.light.color.copy(moonCol).lerp(sunCol, m);
		this.light.intensity = lerp(2.2, 3.4, m);
		// by night the cloud below is lit by the moon, and gives some of it back
		this.hemi.color.set(0x55688c).lerp(new THREE.Color(0x9fbbe6), m);
		this.hemi.groundColor.set(0x3a465e).lerp(new THREE.Color(0x8e8a86), m);
		this.hemi.intensity = lerp(1.7, 0.75, m);
		U.uSunColor.value.copy(this.light.color).multiplyScalar(lerp(0.18, 1, m));
		this.renderer.toneMappingExposure = lerp(0.82, 1.0, m);
		// warm lamps against cool shadows by night; by day, neutral
		this.grade.uniforms.get('uWarm')!.value = lerp(0.85, 0.2, m);
		const env = m > 0.5 ? this.envDay : this.envNight;
		this.scene.environment = env;
		this.scene.environmentIntensity =
			lerp(1.2, 0.55, m) * Math.min(1, Math.abs(m - 0.5) * 4 + 0.25);
		U.uWind.value = lerp(0.55, 1, m);
		// the lantern: already lit at dusk, the one warm thing by night
		this.lamp.intensity = lerp(14, 2.2, m);
		this.glassMat.emissiveIntensity = lerp(4.5, 1.3, m);
	}

	setDay(day: boolean) {
		const to = day ? 1 : 0;
		if (to !== this.dayTo) {
			this.dayFrom = this.dayMix;
			this.dayT = this.clock;
		}
		this.dayTo = to;
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
		this.setSamples();
		this.composer.setSize(w, h, false);
		this.sizeSky();
		this.camera.aspect = w / h;
		// fit the island and its trees into the part of the screen it owns
		const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
		const [fw, fh] = this.layout === 'side' ? [0.52, 0.8] : [0.86, 0.44];
		// the whole island, from the tops of the cypresses to the point of the
		// rock: it is a thing floating, and it has to be seen whole to read so
		const subjectW = 17,
			subjectH = 17.2;
		const dW = subjectW / (fw * 2 * tan * this.camera.aspect);
		const dH = subjectH / (fh * 2 * tan);
		this.dist = Math.max(dW, dH);
		this.hv = 2 * this.dist * tan;
		const [fx, fy] = this.layout === 'side' ? [0.31, 0.5] : [0.5, 0.27];
		this.moonDir.copy(this.layout === 'side' ? MOON_DIR : moonAt(3.5, 7.5));
		this.sunAz = SUN_AZ[this.layout];
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
		const pitch = THREE.MathUtils.degToRad(8 + lift) + this.pitchNudge;
		const drift = this.reduced ? 0 : Math.sin(this.clock * 0.045) * 0.06;
		const yaw = this.yaw + drift + lerp(-0.35, 0, k);
		const target = new THREE.Vector3(0, -0.9 - descend, 0);
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
				const dx = e.clientX - this.drag.x;
				if (Math.abs(dx) > 4) this.drag.moved = true;
				const was = this.yaw;
				this.yaw = clamp(this.drag.yaw - (dx / this.W) * 2.4, -0.75, 0.75);
				this.yawVel = (this.yaw - was) * 60;
			}
			this.wake();
		}) as EventListener);
		this.on(cv, 'pointerleave', () => {
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
				this.onGramophone?.();
				return;
			}
			if (hit) {
				// a touch shakes the crown from where the hand went in, sets
				// the tree swaying away from it, and anything perched in it is
				// off; and the hand has hold of it, to bend it
				this.pressed = hit;
				const at = this.touchPoint(hit);
				rustleFrom(at, 1);
				if (!this.reduced) this.petals.shed(hit, at, 16);
				this.air.pressed(hit);
				const sp = this.spring(hit);
				const away = this.flatDir(this.camera.getWorldDirection(new THREE.Vector3()));
				sp.vx += away.x * 0.32;
				sp.vz += away.z * 0.32;
				this.grab = { tree: hit, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
				cv.setPointerCapture(e.pointerId);
				this.wake();
				return;
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

	private setPointer(e: PointerEvent) {
		this.pointerNdc.set((e.clientX / this.W) * 2 - 1, -(e.clientY / this.H) * 2 + 1);
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
		this.sky.bake(this.renderer);
		this.sky.update(this.renderer);
		await this.bakeEnvironment();
		this.applyDay(this.dayMix);
		this.placeCamera(0);
		try {
			await this.renderer.compileAsync(this.scene, this.camera);
		} catch {
			/* older engines: the first frame compiles instead */
		}
		this.draw();
		// nothing is drawn until everything is compiled, or the first frame
		// compiles what is left while the page waits, and skips the shadows
		this.live = true;
		this.wake();
	}

	// While the camera holds still (its idle drift is a sixth of a pixel a
	// frame, and the cloud crawls) the sheet of sky is redrawn half at a
	// time, as a chequer, so every frame carries the same half of its cost;
	// when anything that would show it moves, all of it, every frame.
	private skyQ = new THREE.Quaternion(0, 0, 0, 0);
	private skyTick = 0;
	skyDirty = true;
	private draw() {
		this.sky.update(this.renderer);
		this.skyTick ^= 1;
		// the half not drawn is a frame old: fine unless the view has turned
		// more than a pixel or so since the last frame
		const turned = this.skyQ.angleTo(this.camera.quaternion) > 5e-4;
		this.skyQ.copy(this.camera.quaternion);
		const full = turned || this.skyDirty || Math.abs(this.dayMix - this.dayTo) > 1e-4;
		this.sky.render(this.renderer, this.camera, full ? -1 : this.skyTick);
		this.skyDirty = false;
		this.composer.render();
	}

	/** Where pixels are small, two samples smooth an edge as well as four. */
	private setSamples() {
		const n = Math.min(this.dpr >= 1.4 ? 2 : 4, this.renderer.capabilities.maxSamples);
		if (this.composer.multisampling !== n) this.composer.multisampling = n;
	}

	/** The sky's sheet: fewer pixels by day, when it is all soft cloud, than
	 *  by night, when it carries stars a pixel across. */
	private sizeSky() {
		const px = this.W * this.dpr,
			py = this.H * this.dpr;
		this.sky.setSize(px, py, lerp(1.25e6, 0.75e6, this.dayMix));
		this.skyDirty = true;
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
			// eased at both ends, over two and a half seconds: the sun goes
			// down under the cloud, it is not switched off
			const k = this.dayT < 0 ? 1 : clamp((this.clock - this.dayT) / 2.4, 0, 1);
			this.dayMix = lerp(this.dayFrom, this.dayTo, easeInOut(k));
			if (k >= 1) this.dayMix = this.dayTo;
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
		this.gramophone.hover.value = this.gramGlow;
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
			((this.H * this.dpr) / (2 * tan)) * 0.62
		);

		// the light's view-space direction, for leaves lit from behind
		U.uSunView.value
			.copy(this.light.position)
			.normalize()
			.transformDirection(this.camera.matrixWorldInverse);
		this.light.target.position.set(0, 0, 0);

		this.air.update(dt, visible);
		if (visible) {
			this.lightUp();
			this.petals.update(
				dt,
				this.garden.filter((g) => g.blossoms.length > 0),
				this.reduced
			);
		}
	}

	/** Lay the lanterns' and the fireflies' light into the glow map. */
	private lampCol = new THREE.Color(1.0, 0.62, 0.3);
	private flyCol = new THREE.Color(0.8, 1.0, 0.45);
	private lightUp() {
		const night = 1 - this.dayMix;
		const g = this.glow;
		g.begin();
		const li = lerp(0.35, 1.6, night);
		for (const p of this.lanterns) g.add(p, this.lampCol, li, 2.6);
		g.add(this.pavilion.lantern, this.lampCol, li * 0.5, 2.2);
		if (night > 0.02) {
			const { pos, glow } = this.air.fireflies;
			const v = new THREE.Vector3();
			for (let i = 0; i < glow.length; i++) {
				if (pos[i * 3 + 1] < -50 || glow[i] < 0.02) continue;
				v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
				g.add(v, this.flyCol, glow[i] * 0.3, 0.9);
			}
		}
		g.end();
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
			this.setSamples();
			this.composer.setSize(this.W, this.H, false);
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
		this.composer.dispose();
		this.renderer.dispose();
	}
}

export { ISLAND };
