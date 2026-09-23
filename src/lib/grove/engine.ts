import * as THREE from 'three';
import { U } from './shared';
import { createSky, sunLight } from './sky';
import {
	BloomEffect,
	Effect,
	BlendFunction,
	EffectComposer,
	EffectPass,
	FXAAEffect,
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
import { buildRotunda, rotundaClearance, type RotundaParts } from './rotunda';
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
import { OLIVE, BLOSSOM, CYPRESS, WHITE_SHRUB, ROSE_SHRUB, VINE } from './flora/species';
import { rustleFrom } from './flora/wind';
import { Petals } from './flora/petals';
import { patch, nightPatch, nightPatchWarm } from './shared';
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
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
/** how far the sky is tipped up behind the island, in degrees, by layout */
const SKY_TILT = { side: 0, stack: 9 };

/**
 * The rotunda by lamplight, as the gramophone would see it from the floor:
 * warm flags below, six open bays of night between lit brick piers, a dim
 * vault, and the lantern overhead. Baked once into an environment for the
 * brass, which by night has nothing but this to be shiny with.
 */
function lampRoom() {
	const scene = new THREE.Scene();
	const mat = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		vertexShader: /* glsl */ `
			varying vec3 vD;
			void main() {
				vD = position;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			varying vec3 vD;
			void main() {
				vec3 d = normalize(vD);
				float az = atan(d.x, d.z);
				float e = d.y;
				// the floor, brightest under the lamp
				vec3 floorC = vec3(0.62, 0.4, 0.22) * mix(0.25, 0.9, smoothstep(-0.2, -0.9, e));
				// the bays, open to the night, and the piers between them
				float bay = smoothstep(-0.1, 0.35, cos(az * 6.0));
				vec3 wall = mix(vec3(0.5, 0.22, 0.1) * 0.5, vec3(0.02, 0.03, 0.07), bay);
				vec3 vault = vec3(0.3, 0.17, 0.08) * 0.35;
				vec3 c = mix(e < 0.6 ? wall : vault, floorC, 1.0 - smoothstep(-0.08, 0.0, e));
				// the lantern: up, and a little toward the back of the room
				vec3 L = normalize(vec3(-0.1, 1.0, -0.4));
				float a = acos(clamp(dot(d, L), -1.0, 1.0));
				c += vec3(1.0, 0.66, 0.34) * (60.0 * (1.0 - smoothstep(0.06, 0.09, a)) + 2.5 * exp(-a * 7.0));
				gl_FragColor = vec4(c, 1.0);
			}`
	});
	scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat));
	return scene;
}

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
	private fxaa!: EffectPass;
	private mainPass!: EffectPass;
	private bloom: BloomEffect;
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
	// the lantern in the arch, shining down on the gramophone: a spot, so
	// that it can throw the machine's shadow, wide enough to light the room
	private lamp = new THREE.SpotLight(0xffa04a, 0, 7, 1.18, 0.85, 2);
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
		this.dprCap = Math.min(window.devicePixelRatio || 1, 2);
		this.dpr = this.dprCap;
		void phone;

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
		// the pass that picks out what is bright enough to bloom runs at the
		// screen's full size by default, and only feeds a blur that starts at
		// half of it: at half size itself it costs a quarter
		const bloomSize = this.bloom.setSize.bind(this.bloom);
		this.bloom.setSize = (w: number, h: number) => {
			bloomSize(w, h);
			this.bloom.luminancePass.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
		};
		const pass = new EffectPass(
			this.camera,
			this.bloom,
			new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
			this.grade
		);
		pass.dithering = true;
		this.composer.addPass(pass);
		// on a dense screen, a cheap edge filter in place of multisampling
		this.fxaa = new EffectPass(this.camera, new FXAAEffect());
		this.composer.addPass(this.fxaa);
		this.composer.autoRenderToScreen = false;
		this.mainPass = pass;
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
			nightPatchWarm
		);
		this.brass = brass;

		this.island = buildIsland(
			{ ashlar, rock: rockTextures(aniso), flags: flagTextures(aniso), lawn: lawnTexture(aniso) },
			this.rand() * 10
		);
		this.world.add(this.island.group);
		this.pavilion = buildRotunda(brick, stone, bronze);
		this.world.add(this.pavilion.group);
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
			avoid: (p: THREE.Vector3) => rotundaClearance(p) < 0.42
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
		this.gateShadowLayer();
		this.trees = [stands[0], stands[1]];
		for (let i = 0; i < 2; i++) this.keepOff(stands[i], preps[i].placed.worldPos);
		this.garden = stands;
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
		u.uStars.value = 0;
		u.uMix.value = 1;
		this.envDay = pm.fromScene(envScene, 0, 0.1, 100).texture;
		u.uMix.value = 0;
		this.envNight = pm.fromScene(envScene, 0, 0.1, 100).texture;
		u.uMix.value = keep;
		u.uStars.value = 1;
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
		// and the moon goes out of the picture, up and away from the page, as
		// the sun comes up; with the night it comes back in the same way
		const [mAz, mEl] = MOON[this.layout];
		const out = Math.sqrt(clamp(m, 0, 1));
		this.sky.uniforms.uMoon.value.copy(moonAt(mAz + MOON_OUT[0] * out, mEl + MOON_OUT[1] * out));
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
		// Polished brass is all reflection: under the night sky alone it would
		// go dull. By night it sees what it would, the lamplit room round it.
		if (this.brass) this.brass.envMap = m > 0.5 ? null : this.envRoom;
		this.scene.environmentIntensity =
			lerp(1.2, 0.55, m) * Math.min(1, Math.abs(m - 0.5) * 4 + 0.25);
		U.uWind.value = lerp(0.55, 1, m);
		// the lantern: already lit at dusk, the one warm thing by night
		this.lamp.intensity = lerp(22, 2.2, m);
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
		this.scrolledAt = performance.now();
		this.wake();
	}
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
		// a budget of pixels, not a ratio: a large, dense screen is drawn a
		// little under its own density, which with the multisampling is still
		// sharp, and holds the frame rate where a ratio would not
		this.dprCap = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.4e6 / (w * h)));
		this.dprCap = Math.max(1, Math.round(this.dprCap * 4) / 4);
		this.dpr = Math.min(this.dpr, this.dprCap);
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
		this.viewYaw = this.peekAt ? 0 : yaw;
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

	// The sky is drawn whole every frame. (It was once drawn half at a time
	// while the view held still, as a chequer; but anything that moved slowly
	// through it — the far edge of the cloud as the camera drifts, the moon's
	// rim — then stepped every other frame, pixel by pixel, and shimmered.)
	skyDirty = true;
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
		// only the scroll's sinking, which is no turn at all, moves the
		// camera the sky is drawn from.
		let cam = this.camera;
		if (!this.peekAt) {
			this.skyCam.copy(this.camera);
			this.skyCam.quaternion.setFromAxisAngle(
				RIGHT,
				THREE.MathUtils.degToRad(SKY_TILT[this.layout] - 8)
			);
			this.skyCam.updateMatrixWorld();
			cam = this.skyCam;
		}
		this.sky.render(this.renderer, cam);
		this.composer.render();
	}

	/** Where pixels are small, an edge filter does what multisampling does,
	 *  for a fraction of what it costs; where they are large, four samples. */
	private setSamples() {
		const dense = this.dpr >= 1.25;
		const n = dense ? 0 : Math.min(2, this.renderer.capabilities.maxSamples);
		if (this.composer.multisampling !== n) this.composer.multisampling = n;
		if (this.fxaa) {
			// whichever pass is last draws to the screen
			this.fxaa.enabled = dense;
			this.fxaa.renderToScreen = dense;
			this.mainPass.renderToScreen = !dense;
		}
	}

	/** The sky's sheet: fewer pixels by day, when it is all soft cloud, than
	 *  by night, when it carries stars a pixel across. */
	private sizeSky() {
		const px = this.W * this.dpr,
			py = this.H * this.dpr;
		this.sky.setSize(px, py, lerp(0.8e6, 0.55e6, this.dayMix));
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
		// over it has to blur it again each time it changes: at rest there it
		// is drawn twenty times a second, which the cloud cannot tell from
		// sixty. Never while the page is moving, though: then the sky moves
		// with it and has to keep up.
		if (
			!this.world.visible &&
			!this.scrolling &&
			Math.abs(this.dayMix - this.dayTo) < 1e-3 &&
			now - this.last < 48
		)
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
		this.aimKey();
		const visible = p < 1.85;
		this.world.visible = visible;
		// (the light keeps its shadow even when the island is out of sight:
		// turning it off and on changes every material's program, and each
		// change is a recompile in the middle of a scroll)
		// the shadows follow the wind at half the rate the picture does: a
		// crown's shadow on the lawn moves too slowly for the difference to show,
		// and the shadow pass draws every tree a second time
		this.shadowTick = (this.shadowTick + 1) % 2;
		const quick = this.intro.t >= 0 && this.intro.t < this.intro.dur + 1.5;
		// and while the page scrolls nothing the sun sees moves but leaves in
		// the wind, which nobody reading can tell from still: they wait
		this.renderer.shadowMap.needsUpdate =
			visible &&
			(quick || !!this.pressed || !!this.grab || (this.shadowTick === 0 && !this.scrolling));
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
			((this.H * this.dpr) / (2 * tan)) * 0.36
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
		// only the soft part of its light: the spot does the rest, with shadows
		g.add(this.pavilion.lantern, this.lampCol, li * 0.3, 2.2);
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
		// never mid-scroll: a change of resolution reallocates every buffer,
		// and that is a hitch just where the eye is following the motion
		// and not deep in the page, where the frames are held back on purpose
		if (this.scrolling || !this.world.visible) {
			this.frameTimes.length = 0;
			return;
		}
		this.frameTimes.push(dt * 1000);
		if (this.frameTimes.length < 90) return;
		// Judged against the display, not against sixty: the shortest usual
		// interval is its refresh, 8 ms on a 120 Hz screen, and a frame that
		// takes half again as long has missed one. A few misses are judder
		// the eye sees the moment the page moves.
		const s = this.frameTimes.slice().sort((a, b) => a - b);
		this.frameTimes.length = 0;
		const tick = s[Math.floor(s.length * 0.1)];
		const late = s.filter((d) => d > tick * 1.5).length / s.length;
		let next = this.dpr;
		if ((late > 0.12 || tick > 22) && this.dpr > 1) next = Math.max(1, this.dpr - 0.25);
		else if (late < 0.03 && tick < 18 && ms < tick * 0.5 && this.dpr < this.dprCap)
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
