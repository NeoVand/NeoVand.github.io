import * as THREE from 'three';
import { hash, clamp } from './rng';

// ─── One brick ────────────────────────────────────────────────────────────
// Everything built in the grove is cut to one brick, and it is baked here
// once: a tile of eight courses in running bond, four bricks to a course,
// out of the same three kilns the flat grove used — the common red, a sandy
// buff, and one fired too hard — kept under about sixty per cent lightness,
// because a brick paler than that stops reading as fired clay. Every surface
// maps it in world units (see BRICK), so a brick on the pavilion's dome is
// the same brick as one on the island's rim, by construction.

/** World size of one brick pitch (length incl. head joint) and one course. */
export const BRICK = { length: 0.3, course: 0.11, perTileX: 4, perTileY: 8 };
export const TILE = { w: BRICK.length * BRICK.perTileX, h: BRICK.course * BRICK.perTileY };

const TW = 1024;
const TH = 768;

function hsl(h: number, s: number, l: number): [number, number, number] {
	h /= 360;
	s /= 100;
	l /= 100;
	const k = (n: number) => (n + h * 12) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0), f(8), f(4)];
}

function clay(k: number) {
	const a = hash(k, 17),
		s = hash(k, 53),
		pick = hash(k, 91);
	// the flat grove's three kilns, drawn closer together: lit and shaded in
	// three dimensions, the full spread read as a patchwork
	if (pick < 0.1) return hsl(22 + a * 8, 26 + s * 8, 44 + a * 5);
	if (pick > 0.9) return hsl(8 + a * 6, 32 + s * 8, 34 + a * 5);
	return hsl(12 + a * 8, 38 + s * 10, 39 + s * 6);
}

/** Smooth value noise on an integer lattice, tiling with period p. */
function vnoise(x: number, y: number, p: number, salt: number) {
	const xi = Math.floor(x),
		yi = Math.floor(y);
	const fx = x - xi,
		fy = y - yi;
	const ux = fx * fx * (3 - 2 * fx),
		uy = fy * fy * (3 - 2 * fy);
	const h = (i: number, j: number) => hash((((i % p) + p) % p) + (((j % p) + p) % p) * 4099, salt);
	const a = h(xi, yi),
		b = h(xi + 1, yi),
		c = h(xi, yi + 1),
		d = h(xi + 1, yi + 1);
	return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function canvas(w: number, h: number) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
}

function normalFromHeight(hgt: Float32Array, w: number, h: number, strength: number) {
	const c = canvas(w, h);
	const g = c.getContext('2d')!;
	const img = g.createImageData(w, h);
	const d = img.data;
	for (let y = 0; y < h; y++) {
		const y0 = ((y - 1 + h) % h) * w,
			y1 = ((y + 1) % h) * w,
			yc = y * w;
		for (let x = 0; x < w; x++) {
			const x0 = (x - 1 + w) % w,
				x1 = (x + 1) % w;
			// canvas rows run down; texture v runs up (flipY), hence the sign on ny
			const dx = (hgt[yc + x1] - hgt[yc + x0]) * 0.5 * strength;
			const dy = (hgt[y1 + x] - hgt[y0 + x]) * 0.5 * strength;
			const nx = -dx,
				ny = dy,
				nz = 1;
			const l = Math.hypot(nx, ny, nz);
			const i = (yc + x) * 4;
			d[i] = ((nx / l) * 0.5 + 0.5) * 255;
			d[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
			d[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
			d[i + 3] = 255;
		}
	}
	g.putImageData(img, 0, 0);
	return c;
}

function finish(tex: THREE.Texture, srgb: boolean, aniso: number) {
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.anisotropy = aniso;
	tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	tex.generateMipmaps = true;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.needsUpdate = true;
	return tex;
}

export function brickTextures(aniso: number) {
	const cw = TW / BRICK.perTileX; // 256 px a brick pitch
	const ch = TH / BRICK.perTileY; // 96 px a course
	const joint = 11; // mortar, px
	const color = canvas(TW, TH);
	const g = color.getContext('2d')!;
	const img = g.createImageData(TW, TH);
	const d = img.data;
	const hgt = new Float32Array(TW * TH);
	const mortar = [0.43, 0.39, 0.35];

	for (let y = 0; y < TH; y++) {
		const course = Math.floor(y / ch);
		const ly = y - course * ch;
		const off = (course % 2) * (cw / 2);
		for (let x = 0; x < TW; x++) {
			const xx = (x + off) % TW;
			const bi = Math.floor(xx / cw);
			const lx = xx - bi * cw;
			const k = course * 13 + bi * 7 + 1;
			// each brick sits a little differently in its slot
			const jx = (hash(k, 23) - 0.5) * 3,
				jy = (hash(k, 41) - 0.5) * 2;
			const hx = cw / 2 - joint / 2 - Math.abs(lx - cw / 2 - jx);
			const hy = ch / 2 - joint / 2 - Math.abs(ly - ch / 2 - jy);
			// rounded-rectangle distance, inside positive
			const r = 5 + hash(k, 7) * 4;
			const qx = r - hx,
				qy = r - hy;
			const sd = qx > 0 && qy > 0 ? r - Math.hypot(qx, qy) : Math.min(hx, hy);
			const n1 = vnoise(x / 9, y / 9, TW / 9, 3);
			const n2 = vnoise(x / 2.3, y / 2.3, Math.round(TW / 2.3), 5);
			const grit = hash(x + y * TW, 77);
			const i = (y * TW + x) * 4;
			let rr: number, gg: number, bb: number, hh: number;
			if (sd > 0) {
				const [cr, cg, cb] = clay(k);
				// firing blotches and a grain, so the face reads as a body of clay
				const bl = (vnoise(x / 38 + k * 3.1, y / 30, 997, 11) - 0.5) * 0.22;
				const gr = (grit < 0.08 ? -0.16 : grit > 0.95 ? 0.1 : 0) + (n2 - 0.5) * 0.08;
				const edge = clamp(sd / 7, 0, 1); // bevel
				const shade = 1 + bl + gr - (1 - edge) * 0.1;
				rr = cr * shade;
				gg = cg * shade;
				bb = cb * shade;
				hh = 0.55 + 0.45 * Math.sqrt(edge) + (n1 - 0.5) * 0.05 + (grit < 0.06 ? -0.08 : 0);
			} else {
				// recessed joint: darker the deeper into the gap
				const ao = clamp(1 + sd / 6, 0, 1);
				const m = 0.72 + 0.28 * (1 - ao) + (n2 - 0.5) * 0.18;
				rr = mortar[0] * m;
				gg = mortar[1] * m;
				bb = mortar[2] * m;
				hh = 0.12 + (n2 - 0.5) * 0.08;
			}
			d[i] = clamp(rr, 0, 1) * 255;
			d[i + 1] = clamp(gg, 0, 1) * 255;
			d[i + 2] = clamp(bb, 0, 1) * 255;
			d[i + 3] = 255;
			hgt[y * TW + x] = hh;
		}
	}
	g.putImageData(img, 0, 0);
	const normal = normalFromHeight(hgt, TW, TH, 9);
	return {
		map: finish(new THREE.CanvasTexture(color), true, aniso),
		normalMap: finish(new THREE.CanvasTexture(normal), false, aniso)
	};
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

// ─── Foliage ──────────────────────────────────────────────────────────────
// A crown is not two thousand separate leaves, each one a polygon lit on
// its own — that read as paper cut-outs. It is a few hundred cards, each
// painted with a spray of small leaves at every shade between the deep
// inside of a canopy and its sunlit skin, cut out by their alpha. The
// colours are bled into the transparent pixels round every leaf, so the
// mipmaps do not pull a dark rim in from nothing as the cards recede.
export type FoliageKind = 'leaf' | 'narrow' | 'blossom';

const toSRGB = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function foliageTexture(kind: FoliageKind, rgb: [number, number, number], seed: number) {
	const S = 256;
	const c = canvas(S, S);
	const g = c.getContext('2d')!;
	let k = seed * 131;
	const r = () => hash(k++, 97);
	const shade = (t: number, base = rgb) => {
		const f = 0.45 + t * 0.75;
		const warm = t > 0.7 ? (t - 0.7) * 0.25 : 0;
		const cr = toSRGB(Math.min(1, base[0] * f + warm * 0.6)),
			cg = toSRGB(Math.min(1, base[1] * f + warm * 0.4)),
			cb = toSRGB(Math.min(1, base[2] * f));
		return `rgb(${(cr * 255) | 0},${(cg * 255) | 0},${(cb * 255) | 0})`;
	};
	const leaf = (
		x: number,
		y: number,
		a: number,
		len: number,
		wide: number,
		t: number,
		base: [number, number, number] = rgb
	) => {
		g.save();
		g.translate(x, y);
		g.rotate(a);
		g.fillStyle = shade(t, base);
		g.beginPath();
		g.moveTo(0, 0);
		g.quadraticCurveTo(len * 0.5, -wide, len, 0);
		g.quadraticCurveTo(len * 0.5, wide, 0, 0);
		g.fill();
		g.strokeStyle = shade(t * 0.6, base);
		g.lineWidth = Math.max(0.6, wide * 0.18);
		g.beginPath();
		g.moveTo(len * 0.05, 0);
		g.lineTo(len * 0.85, 0);
		g.stroke();
		g.restore();
	};
	// a spray: denser toward the middle, darker underneath and inside
	const n = kind === 'blossom' ? 40 : kind === 'narrow' ? 84 : 72;
	for (let i = 0; i < n; i++) {
		const rr = Math.sqrt(r()) * S * 0.36;
		const th = r() * Math.PI * 2;
		const x = S / 2 + Math.cos(th) * rr,
			y = S / 2 + Math.sin(th) * rr;
		const t = Math.min(1, Math.max(0, 0.25 + 0.55 * r() + ((S / 2 - y) / S) * 0.5));
		const a = th + (r() - 0.5) * 1.4;
		if (kind === 'narrow') leaf(x, y, a, 30 + r() * 16, 3.2 + r() * 1.5, t);
		else if (kind === 'blossom' && i % 3 !== 0) {
			// five petals, pale, about a yellow eye
			const pr = 7 + r() * 4;
			for (let p = 0; p < 5; p++) {
				const pa = (p / 5) * Math.PI * 2 + a;
				g.fillStyle = shade(0.55 + 0.45 * r());
				g.beginPath();
				g.ellipse(
					x + Math.cos(pa) * pr * 0.55,
					y + Math.sin(pa) * pr * 0.55,
					pr * 0.55,
					pr * 0.38,
					pa,
					0,
					Math.PI * 2
				);
				g.fill();
			}
			g.fillStyle = 'rgb(236,196,120)';
			g.beginPath();
			g.arc(x, y, pr * 0.22, 0, Math.PI * 2);
			g.fill();
		} else if (kind === 'blossom')
			leaf(x, y, a, 18 + r() * 8, 5.5, 0.35 + r() * 0.4, [0.16, 0.3, 0.12]);
		else leaf(x, y, a, 22 + r() * 12, 7 + r() * 4, t);
	}
	const img = g.getImageData(0, 0, S, S);
	const d = img.data;
	// bleed colour outward into the clear pixels, a few rings deep
	for (let pass = 0; pass < 6; pass++) {
		const src = new Uint8ClampedArray(d);
		for (let y = 0; y < S; y++)
			for (let x = 0; x < S; x++) {
				const i = (y * S + x) * 4;
				if (src[i + 3] > 0 || src[i] + src[i + 1] + src[i + 2] > 0) continue;
				let rs = 0,
					gs = 0,
					bs = 0,
					m = 0;
				for (const [dx, dy] of [
					[1, 0],
					[-1, 0],
					[0, 1],
					[0, -1]
				]) {
					const xx = x + dx,
						yy = y + dy;
					if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
					const j = (yy * S + xx) * 4;
					if (src[j] + src[j + 1] + src[j + 2] === 0) continue;
					rs += src[j];
					gs += src[j + 1];
					bs += src[j + 2];
					m++;
				}
				if (m) {
					d[i] = rs / m;
					d[i + 1] = gs / m;
					d[i + 2] = bs / m;
				}
			}
	}
	const tex = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), S, S, THREE.RGBAFormat);
	tex.flipY = true;
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.generateMipmaps = true;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.magFilter = THREE.LinearFilter;
	tex.needsUpdate = true;
	return tex;
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
