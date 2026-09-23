import * as THREE from 'three';
import { hash } from './rng';
import {
	vnoise,
	canvas,
	normalFromHeight,
	brickCanvases,
	ashlarCanvases,
	rockCanvases,
	flagCanvases
} from './texgen';

export { BRICK, TILE, ASHLAR, FLAGS } from './texgen';

// ─── The textures ─────────────────────────────────────────────────────────
// The heaviest are drawn by texgen.ts, in a worker where one can be had
// (bakeTextures, below); the light ones here, as they are wanted.

function finish(tex: THREE.Texture, srgb: boolean, aniso: number) {
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.anisotropy = aniso;
	tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	tex.generateMipmaps = true;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.needsUpdate = true;
	return tex;
}

type Pair = { color: TexImageSource | OffscreenCanvas; normal: TexImageSource | OffscreenCanvas };
function pair(p: Pair, aniso: number) {
	return {
		map: finish(new THREE.Texture(p.color as TexImageSource), true, aniso),
		normalMap: finish(new THREE.Texture(p.normal as TexImageSource), false, aniso)
	};
}

export const brickTextures = (aniso: number) => pair(brickCanvases(), aniso);
export const ashlarTextures = (aniso: number) => pair(ashlarCanvases(), aniso);
export const rockTextures = (aniso: number) => pair(rockCanvases(), aniso);
export const flagTextures = (aniso: number) => pair(flagCanvases(), aniso);

const HEAVY = {
	bricks: brickCanvases,
	ashlar: ashlarCanvases,
	rock: rockCanvases,
	flags: flagCanvases
};
type Heavy = keyof typeof HEAVY;
export type TexturePair = ReturnType<typeof pair>;

/**
 * The four heavy textures, as textures to build with at once and a promise
 * that they have their pixels. Drawn in two workers where the browser has
 * them, in parallel with everything else the page is building; otherwise
 * here, before the promise is even returned.
 */
export function bakeTextures(aniso: number) {
	const keys = Object.keys(HEAVY) as Heavy[];
	const tex = {} as Record<Heavy, TexturePair>;
	const canWork = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
	if (!canWork) {
		for (const k of keys) tex[k] = pair(HEAVY[k](), aniso);
		return { tex, done: Promise.resolve() };
	}
	// raw pixels, filled in when they come
	const blank = () => {
		const t = new THREE.DataTexture(new Uint8Array(4), 1, 1);
		t.magFilter = THREE.LinearFilter;
		return t;
	};
	for (const k of keys) {
		const map = finish(blank(), true, aniso),
			normalMap = finish(blank(), false, aniso);
		// nothing to upload until the pixels come
		map.needsUpdate = normalMap.needsUpdate = false;
		tex[k] = { map, normalMap };
	}
	const got = new Set<Heavy>();
	const fill = (k: Heavy, color: ImageData, normal: ImageData) => {
		if (got.has(k)) return;
		got.add(k);
		const t = tex[k];
		for (const [m, img] of [
			[t.map, color],
			[t.normalMap, normal]
		] as const) {
			m.image = { data: new Uint8Array(img.data.buffer), width: img.width, height: img.height };
			// the way up a canvas has when three uploads it
			m.flipY = true;
			m.needsUpdate = true;
		}
	};
	const read = (cv: HTMLCanvasElement | OffscreenCanvas) =>
		cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height) as ImageData;
	// what a worker did not deliver is drawn here after all
	const rest = () => {
		for (const k of keys)
			if (!got.has(k)) {
				const c = HEAVY[k]();
				fill(k, read(c.color), read(c.normal));
			}
	};
	const done = new Promise<void>((resolve) => {
		const parts: Heavy[][] =
			(navigator.hardwareConcurrency || 2) >= 4
				? [
						['rock', 'flags'],
						['bricks', 'ashlar']
					]
				: [keys];
		let open = parts.length;
		const finishPart = (w: Worker | null) => {
			w?.terminate();
			if (--open === 0) {
				rest();
				resolve();
			}
		};
		for (const part of parts) {
			let w: Worker | null = null;
			try {
				w = new Worker(new URL('./texworker.ts', import.meta.url), { type: 'module' });
			} catch {
				finishPart(null);
				continue;
			}
			let left = part.length;
			const worker = w;
			const timer = setTimeout(() => finishPart(worker), 10000);
			w.onmessage = (e: MessageEvent<{ k: Heavy; color: ImageData; normal: ImageData }>) => {
				fill(e.data.k, e.data.color, e.data.normal);
				if (--left === 0) {
					clearTimeout(timer);
					finishPart(worker);
				}
			};
			w.onerror = () => {
				clearTimeout(timer);
				finishPart(worker);
			};
			w.postMessage(part);
		}
	});
	return { tex, done };
}
// ─── The lawn ─────────────────────────────────────────────────────────────
// Short grass with clover in it, darker where it grows thick. Tiles every
// two metres; the variation that keeps the tiling from showing comes from a
// second, much larger noise laid over it in the shader (see island.ts).
export function lawnTexture(aniso: number) {
	const S = 512;
	const c = canvas(S, S);
	const g = c.getContext('2d')!;
	const img = g.createImageData(S, S);
	const d = img.data;
	for (let y = 0; y < S; y++)
		for (let x = 0; x < S; x++) {
			const n1 = vnoise(x / 40, y / 40, S / 40, 21);
			const n2 = vnoise(x / 9, y / 9, Math.round(S / 9), 23);
			const n3 = hash(x + y * S, 29);
			const t = n1 * 0.55 + n2 * 0.35 + n3 * 0.1;
			const i = (y * S + x) * 4;
			d[i] = (0.2 + t * 0.12) * 255;
			d[i + 1] = (0.3 + t * 0.16) * 255;
			d[i + 2] = (0.12 + t * 0.06) * 255;
			d[i + 3] = 255;
		}
	g.putImageData(img, 0, 0);
	// blades: short strokes in a few greens, leaning every which way
	for (let i = 0; i < 9000; i++) {
		const x = hash(i, 31) * S,
			y = hash(i, 37) * S;
		const a = -Math.PI / 2 + (hash(i, 41) - 0.5) * 1.2;
		const l = 3 + hash(i, 43) * 6;
		const v = hash(i, 47);
		g.strokeStyle = `rgba(${40 + v * 60},${70 + v * 70},${25 + v * 25},${0.35 + hash(i, 53) * 0.4})`;
		g.lineWidth = 0.8 + hash(i, 59);
		for (const [ox, oy] of [
			[0, 0],
			[S, 0],
			[-S, 0],
			[0, S],
			[0, -S]
		]) {
			g.beginPath();
			g.moveTo(x + ox, y + oy);
			g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
			g.stroke();
		}
	}
	return finish(new THREE.CanvasTexture(c), true, aniso);
}

// ─── Bark ─────────────────────────────────────────────────────────────────
// Fissured and fibrous, running along the branch. Grey-brown by design, so
// every species can take its own tint over it.
export function barkTextures(aniso: number) {
	const W = 256,
		H = 512;
	const c = canvas(W, H);
	const g = c.getContext('2d')!;
	const img = g.createImageData(W, H);
	const d = img.data;
	const hgt = new Float32Array(W * H);
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			const warp = vnoise(x / 30, y / 60, Math.round(W / 30), 61) * 18;
			const ridge = Math.abs(Math.sin(((x + warp) / W) * Math.PI * 9));
			const fib = vnoise(x / 3, y / 40, Math.round(W / 3), 67);
			const pit = vnoise(x / 14, y / 20, Math.round(W / 14), 71);
			const h = Math.pow(ridge, 0.6) * 0.7 + fib * 0.2 + pit * 0.1;
			const i = (y * W + x) * 4;
			const v = 0.62 + h * 0.5;
			d[i] = 0.5 * v * 255;
			d[i + 1] = 0.45 * v * 255;
			d[i + 2] = 0.4 * v * 255;
			d[i + 3] = 255;
			hgt[y * W + x] = h;
		}
	g.putImageData(img, 0, 0);
	return {
		map: finish(new THREE.CanvasTexture(c), true, aniso),
		normalMap: finish(new THREE.CanvasTexture(normalFromHeight(hgt, W, H, 5)), false, aniso)
	};
}

// ─── Walnut, for the gramophone's cabinet ─────────────────────────────────
export function woodTexture(aniso: number) {
	const W = 256,
		H = 256;
	const c = canvas(W, H);
	const g = c.getContext('2d')!;
	const img = g.createImageData(W, H);
	const d = img.data;
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++) {
			const w = vnoise(x / 60, y / 10, Math.round(W / 60), 81) * 6;
			const ring = 0.5 + 0.5 * Math.sin((y + w * 3) * 0.35 + vnoise(x / 20, y / 5, 13, 83) * 2);
			const t = 0.75 + ring * 0.25 + (hash(x + y * W, 87) - 0.5) * 0.05;
			const i = (y * W + x) * 4;
			d[i] = 0.34 * t * 255;
			d[i + 1] = 0.19 * t * 255;
			d[i + 2] = 0.1 * t * 255;
			d[i + 3] = 255;
		}
	g.putImageData(img, 0, 0);
	return finish(new THREE.CanvasTexture(c), true, aniso);
}

// ─── A soft round spark, for fireflies and the moon's glow ────────────────
export function sparkTexture() {
	const S = 64;
	const c = canvas(S, S);
	const g = c.getContext('2d')!;
	const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
	gr.addColorStop(0, 'rgba(255,255,255,1)');
	gr.addColorStop(0.12, 'rgba(255,255,255,0.8)');
	gr.addColorStop(0.35, 'rgba(255,255,255,0.18)');
	gr.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = gr;
	g.fillRect(0, 0, S, S);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

// ─── Stone ────────────────────────────────────────────────────────────────
// Three stones for the island, all pale limestone: the ashlar of the wall
// round the lip, the crag the island is broken from, and the flags of the
// path. Each is drawn once into a tileable sheet with a height map beside it
// for its normals.

/** worley distances on a lattice that wraps with period p: nearest, second */
