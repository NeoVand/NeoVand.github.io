import { hash, clamp } from './rng';

// ─── The textures' pixels ─────────────────────────────────────────────────
// Everything here is plain arithmetic on canvases, with nothing of three.js
// in it, so that the four heaviest — brick, ashlar, rock and flags, the
// better part of a second between them — can be drawn in a worker while the
// page builds the rest of the scene (see texworker.ts and textures.ts).

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

export function hsl(h: number, s: number, l: number): [number, number, number] {
	h /= 360;
	s /= 100;
	l /= 100;
	const k = (n: number) => (n + h * 12) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0), f(8), f(4)];
}

export function clay(k: number) {
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
export function vnoise(x: number, y: number, p: number, salt: number) {
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

/** a canvas, on the page or, in a worker, off it */
export function canvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
	if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
}

export function normalFromHeight(hgt: Float32Array, w: number, h: number, strength: number) {
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

export function brickCanvases() {
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
	return { color: color, normal: normal };
}

export function worley(x: number, y: number, p: number, salt: number): [number, number, number] {
	const xi = Math.floor(x),
		yi = Math.floor(y);
	let d1 = 9,
		d2 = 9,
		id = 0;
	for (let j = -1; j <= 1; j++)
		for (let i = -1; i <= 1; i++) {
			const cx = xi + i,
				cy = yi + j;
			const wx = ((cx % p) + p) % p,
				wy = ((cy % p) + p) % p;
			const k = wx + wy * 7919;
			const px = cx + 0.15 + hash(k, salt) * 0.7,
				py = cy + 0.15 + hash(k, salt + 1) * 0.7;
			const d = Math.hypot(px - x, py - y);
			if (d < d1) {
				d2 = d1;
				d1 = d;
				id = k;
			} else if (d < d2) d2 = d;
		}
	return [d1, d2, id];
}

export function fbm(x: number, y: number, p: number, salt: number, oct = 4) {
	let s = 0,
		a = 0.5,
		f = 1;
	for (let o = 0; o < oct; o++) {
		s += vnoise(x * f, y * f, p * f, salt + o * 7) * a;
		f *= 2;
		a *= 0.5;
	}
	return s / (1 - Math.pow(0.5, oct));
}

/** limestone ashlar: 2.4 m by 1.2 m, four courses of dressed blocks */

export const ASHLAR = { w: 2.4, h: 1.2 };
export function ashlarCanvases() {
	const W = 1024,
		H = 512,
		ch = 128,
		joint = 5;
	const color = canvas(W, H);
	const g = color.getContext('2d')!;
	const img = g.createImageData(W, H);
	const d = img.data;
	const hgt = new Float32Array(W * H);
	// each course cut into blocks of its own lengths, wrapping round the tile
	const cuts: number[][] = [];
	for (let c = 0; c < H / ch; c++) {
		const row = [0];
		let x = hash(c, 5) * 120;
		row[0] = x;
		while (x < W + row[0] - 150) {
			x += 170 + hash(c * 31 + row.length, 9) * 220;
			row.push(x);
		}
		row[row.length - 1] = W + row[0];
		cuts.push(row);
	}
	for (let y = 0; y < H; y++) {
		const c = Math.floor(y / ch),
			ly = y - c * ch;
		const row = cuts[c];
		for (let x = 0; x < W; x++) {
			let xx = x;
			if (xx < row[0]) xx += W;
			let b = 0;
			while (b < row.length - 2 && xx >= row[b + 1]) b++;
			const x0 = row[b],
				x1 = row[b + 1];
			const k = c * 97 + b * 13 + 3;
			// edges a little broken: the arris is chipped, not ruled
			const chip = (vnoise(x / 6, y / 6, Math.round(W / 6), 17) - 0.5) * 4;
			const hx = Math.min(xx - x0, x1 - xx) - joint / 2 + chip;
			const hy = Math.min(ly, ch - ly) - joint / 2 + chip * 0.7;
			const sd = Math.min(hx, hy);
			const n1 = fbm(x / 64, y / 64, W / 64, 3, 4);
			const pit = hash(x + y * W, 71);
			const i = (y * W + x) * 4;
			let r: number, gg: number, bb: number, hh: number;
			if (sd > 0) {
				const [cr, cg, cb] = hsl(34 + hash(k, 1) * 12, 16 + hash(k, 2) * 12, 66 + hash(k, 3) * 12);
				// the weather: streaks run down from the top of each block
				const streak = vnoise(x / 11, 0.5 + c * 3.1, Math.round(W / 11), 23);
				const stain = (1 - ly / ch) * 0.1 * streak + (n1 - 0.5) * 0.14;
				const edge = clamp(sd / 6, 0, 1);
				const shade = 1 - stain - (1 - edge) * 0.12 + (pit < 0.05 ? -0.12 : 0);
				r = cr * shade;
				gg = cg * shade;
				bb = cb * shade * 0.98;
				hh = 0.6 + 0.4 * Math.sqrt(edge) + (n1 - 0.5) * 0.12 + (pit < 0.04 ? -0.12 : 0);
			} else {
				const ao = clamp(1 + sd / 4, 0, 1);
				const m = 0.62 + 0.3 * (1 - ao) + (n1 - 0.5) * 0.1;
				r = 0.62 * m;
				gg = 0.6 * m;
				bb = 0.55 * m;
				hh = 0.15;
			}
			d[i] = clamp(r, 0, 1) * 255;
			d[i + 1] = clamp(gg, 0, 1) * 255;
			d[i + 2] = clamp(bb, 0, 1) * 255;
			d[i + 3] = 255;
			hgt[y * W + x] = hh;
		}
	}
	g.putImageData(img, 0, 0);
	return { color: color, normal: normalFromHeight(hgt, W, H, 7) };
}

/** the crag: limestone broken in plates and cracks, pitted, with lichen */

export function rockCanvases() {
	const S = 512;
	const color = canvas(S, S);
	const g = color.getContext('2d')!;
	const img = g.createImageData(S, S);
	const d = img.data;
	const hgt = new Float32Array(S * S);
	for (let y = 0; y < S; y++)
		for (let x = 0; x < S; x++) {
			// cracks are veins, not cells: the ridges of a folded noise
			const v1 = fbm(x / 90, y / 90, S / 90, 31, 4);
			const v2 = fbm(x / 34, y / 34, Math.round(S / 34), 41, 3);
			const crack = Math.pow(1 - Math.min(1, Math.abs(v1 * 2 - 1) * 5), 3);
			const fine = Math.pow(1 - Math.min(1, Math.abs(v2 * 2 - 1) * 9), 3);
			const n = fbm(x / 48, y / 48, S / 48, 51, 5);
			const m = fbm(x / 16, y / 16, S / 16, 61, 3);
			const pit = hash(x + y * S, 81);
			const lich = fbm(x / 20 + 7, y / 20, S / 20, 91, 3);
			const i = (y * S + x) * 4;
			// beds of the stone, and broad stains, over the cracks
			const bedN = vnoise(x / 512, y / 26, 1, 71);
			let l =
				0.62 +
				(n - 0.5) * 0.34 +
				(m - 0.5) * 0.1 +
				(bedN - 0.5) * 0.12 -
				crack * 0.16 -
				fine * 0.05 -
				(pit < 0.04 ? 0.08 : 0);
			let r = l * 1.02,
				gg = l * 0.97,
				bb = l * 0.9;
			// crusts of lichen, grey-green and ochre, where the stone is open
			if (lich > 0.62 && crack < 0.4) {
				const t = clamp((lich - 0.62) * 6, 0, 1) * 0.55;
				const warm = hash(Math.floor(x / 40) + Math.floor(y / 40) * 99, 3) < 0.4;
				r = r * (1 - t) + (warm ? 0.72 : 0.56) * t;
				gg = gg * (1 - t) + (warm ? 0.6 : 0.6) * t;
				bb = bb * (1 - t) + (warm ? 0.36 : 0.46) * t;
			}
			d[i] = clamp(r, 0, 1) * 255;
			d[i + 1] = clamp(gg, 0, 1) * 255;
			d[i + 2] = clamp(bb, 0, 1) * 255;
			d[i + 3] = 255;
			hgt[y * S + x] = 0.6 + (n - 0.5) * 0.5 + (m - 0.5) * 0.2 - crack * 0.5 - fine * 0.15;
		}
	g.putImageData(img, 0, 0);
	return { color: color, normal: normalFromHeight(hgt, S, S, 6) };
}

/** flags: irregular slabs of the same stone, with grass and soil between */

export const FLAGS = 1.8;
export function flagCanvases() {
	const S = 512;
	const color = canvas(S, S);
	const g = color.getContext('2d')!;
	const img = g.createImageData(S, S);
	const d = img.data;
	const hgt = new Float32Array(S * S);
	const P = 5;
	for (let y = 0; y < S; y++)
		for (let x = 0; x < S; x++) {
			const wx = x / (S / P) + (vnoise(x / 20, y / 20, S / 20, 5) - 0.5) * 0.18,
				wy = y / (S / P) + (vnoise(x / 20 + 9, y / 20, S / 20, 6) - 0.5) * 0.18;
			const [d1, d2, id] = worley(wx, wy, P, 71);
			const gap = (d2 - d1) * (S / P);
			const n = fbm(x / 40, y / 40, S / 40, 13, 4);
			const i = (y * S + x) * 4;
			let r: number, gg: number, bb: number, hh: number;
			if (gap > 4) {
				const [cr, cg, cb] = hsl(
					30 + hash(id, 1) * 14,
					12 + hash(id, 2) * 10,
					60 + hash(id, 3) * 14
				);
				const edge = clamp((gap - 4) / 7, 0, 1);
				const shade = 1 + (n - 0.5) * 0.2 - (1 - edge) * 0.12;
				r = cr * shade;
				gg = cg * shade;
				bb = cb * shade;
				hh = 0.6 + 0.4 * Math.sqrt(edge) + (n - 0.5) * 0.1;
			} else {
				// between the stones: moss and soil
				const moss = vnoise(x / 7, y / 7, Math.round(S / 7), 9);
				r = 0.2 + moss * 0.06;
				gg = 0.24 + moss * 0.12;
				bb = 0.12;
				hh = 0.1;
			}
			d[i] = clamp(r, 0, 1) * 255;
			d[i + 1] = clamp(gg, 0, 1) * 255;
			d[i + 2] = clamp(bb, 0, 1) * 255;
			d[i + 3] = 255;
			hgt[y * S + x] = hh;
		}
	g.putImageData(img, 0, 0);
	return { color: color, normal: normalFromHeight(hgt, S, S, 6) };
}
