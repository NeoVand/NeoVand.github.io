import * as THREE from 'three';

// ─── The light inside the crowns ──────────────────────────────────────────
// A canopy is dark inside and bright at its skin, and without that a crown
// reads as one green mass however many leaves are in it. The shadow map only
// knows the sun; this is the rest of the sky. Every leaf's area is laid into
// a coarse grid over the whole island, which makes a density of leaf per
// unit volume; light coming through it falls off as Beer and Lambert said,
// e to the minus the leaf it has passed. Each leaf, each piece of bark, and
// each patch of lawn then asks how much sky it can see: straight up, where
// most of it is, and in from the four sides.
//
// Because the grid holds real area in real volume, a sparse tree and a
// dense one both come out right with no tuning per species, and one tree
// shades another standing beside it.

export class Canopy {
	readonly n: [number, number, number];
	readonly min: THREE.Vector3;
	readonly cell: number;
	private dens: Float32Array;
	private up!: Float32Array;
	private side!: Float32Array;

	constructor(min: THREE.Vector3, max: THREE.Vector3, cell: number) {
		this.cell = cell;
		this.min = min.clone();
		this.n = [
			Math.max(2, Math.ceil((max.x - min.x) / cell) + 1),
			Math.max(2, Math.ceil((max.y - min.y) / cell) + 1),
			Math.max(2, Math.ceil((max.z - min.z) / cell) + 1)
		];
		this.dens = new Float32Array(this.n[0] * this.n[1] * this.n[2]);
	}

	private idx(i: number, j: number, k: number) {
		return (k * this.n[1] + j) * this.n[0] + i;
	}

	/** lay a leaf's area into the eight cells round it */
	add(p: THREE.Vector3, area: number) {
		const c = this.cell;
		const fx = (p.x - this.min.x) / c,
			fy = (p.y - this.min.y) / c,
			fz = (p.z - this.min.z) / c;
		const i0 = Math.floor(fx),
			j0 = Math.floor(fy),
			k0 = Math.floor(fz);
		const tx = fx - i0,
			ty = fy - j0,
			tz = fz - k0;
		const perVol = area / (c * c * c);
		for (let dk = 0; dk < 2; dk++) {
			const k = k0 + dk;
			if (k < 0 || k >= this.n[2]) continue;
			const wz = dk ? tz : 1 - tz;
			for (let dj = 0; dj < 2; dj++) {
				const j = j0 + dj;
				if (j < 0 || j >= this.n[1]) continue;
				const wy = dj ? ty : 1 - ty;
				for (let di = 0; di < 2; di++) {
					const i = i0 + di;
					if (i < 0 || i >= this.n[0]) continue;
					this.dens[this.idx(i, j, k)] += perVol * (di ? tx : 1 - tx) * wy * wz;
				}
			}
		}
	}

	/** integrate: the leaf above every cell, and the leaf beside it */
	finish() {
		const [nx, ny, nz] = this.n;
		const c = this.cell;
		this.up = new Float32Array(this.dens.length);
		this.side = new Float32Array(this.dens.length);
		for (let k = 0; k < nz; k++)
			for (let i = 0; i < nx; i++) {
				let acc = 0;
				for (let j = ny - 1; j >= 0; j--) {
					const id = this.idx(i, j, k);
					this.up[id] = acc;
					acc += this.dens[id] * c;
				}
			}
		// four sideways sweeps, averaged
		const sweep = (di: number, dk: number) => {
			for (let j = 0; j < ny; j++) {
				if (di !== 0) {
					for (let k = 0; k < nz; k++) {
						let acc = 0;
						for (let s = 0; s < nx; s++) {
							const i = di > 0 ? s : nx - 1 - s;
							const id = this.idx(i, j, k);
							this.side[id] += acc * 0.25;
							acc += this.dens[id] * c;
						}
					}
				} else {
					for (let i = 0; i < nx; i++) {
						let acc = 0;
						for (let s = 0; s < nz; s++) {
							const k = dk > 0 ? s : nz - 1 - s;
							const id = this.idx(i, j, k);
							this.side[id] += acc * 0.25;
							acc += this.dens[id] * c;
						}
					}
				}
			}
		};
		sweep(1, 0);
		sweep(-1, 0);
		sweep(0, 1);
		sweep(0, -1);
	}

	private tri(f: Float32Array, p: THREE.Vector3) {
		const c = this.cell;
		const [nx, ny, nz] = this.n;
		const fx = THREE.MathUtils.clamp((p.x - this.min.x) / c, 0, nx - 1.001),
			fy = THREE.MathUtils.clamp((p.y - this.min.y) / c, 0, ny - 1.001),
			fz = THREE.MathUtils.clamp((p.z - this.min.z) / c, 0, nz - 1.001);
		const i = Math.floor(fx),
			j = Math.floor(fy),
			k = Math.floor(fz);
		const tx = fx - i,
			ty = fy - j,
			tz = fz - k;
		const L = (a: number, b: number, t: number) => a + (b - a) * t;
		const v = (ii: number, jj: number, kk: number) => f[this.idx(ii, jj, kk)];
		return L(
			L(L(v(i, j, k), v(i + 1, j, k), tx), L(v(i, j + 1, k), v(i + 1, j + 1, k), tx), ty),
			L(
				L(v(i, j, k + 1), v(i + 1, j, k + 1), tx),
				L(v(i, j + 1, k + 1), v(i + 1, j + 1, k + 1), tx),
				ty
			),
			tz
		);
	}

	/** how much sky a point sees, 0 buried .. 1 open */
	sky(p: THREE.Vector3, k = 0.62) {
		const up = Math.exp(-this.tri(this.up, p) * k);
		const side = Math.exp(-this.tri(this.side, p) * k);
		return up * 0.62 + side * 0.38;
	}

	/**
	 * The ground's view up through the leaves, as a small texture over the
	 * island's square [-half, half]², for the lawn and what grows low.
	 */
	groundTexture(half: number, size = 64, y = 0.15) {
		const data = new Uint8Array(size * size * 4);
		const p = new THREE.Vector3();
		for (let v = 0; v < size; v++)
			for (let u = 0; u < size; u++) {
				p.set(((u + 0.5) / size) * 2 * half - half, y, ((v + 0.5) / size) * 2 * half - half);
				const s = this.sky(p, 0.5);
				const o = (v * size + u) * 4;
				data[o] = data[o + 1] = data[o + 2] = Math.round(s * 255);
				data[o + 3] = 255;
			}
		const t = new THREE.DataTexture(data, size, size);
		t.magFilter = THREE.LinearFilter;
		t.minFilter = THREE.LinearFilter;
		t.needsUpdate = true;
		return t;
	}
}
