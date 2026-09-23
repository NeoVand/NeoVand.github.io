import * as THREE from 'three';

// ─── The little lights ────────────────────────────────────────────────────
// A firefly lights the leaf it is under; a lantern on the wall lights the
// stone and the flowers round it. Forward shading pays for every lamp on
// every pixel, so these are not lamps: each frame their light is laid, on
// the CPU, into a small map over the island seen from above — colour in rgb,
// and in alpha the height it is coming from — and every lit surface reads it
// once, with a falloff for how far above or below the light it is. Two dozen
// fireflies and half a dozen lanterns cost one texture read a pixel.

export const GLOW = { half: 8.8, size: 64, maxI: 4, maxY: 9, minY: -1.5 };

export class Glow {
	tex: THREE.DataTexture;
	private rgb = new Float32Array(GLOW.size * GLOW.size * 3);
	private wy = new Float32Array(GLOW.size * GLOW.size);
	private w = new Float32Array(GLOW.size * GLOW.size);
	private data = new Uint8Array(GLOW.size * GLOW.size * 4);

	constructor() {
		this.tex = new THREE.DataTexture(this.data, GLOW.size, GLOW.size);
		this.tex.magFilter = THREE.LinearFilter;
		this.tex.minFilter = THREE.LinearFilter;
		this.tex.needsUpdate = true;
	}

	begin() {
		this.rgb.fill(0);
		this.wy.fill(0);
		this.w.fill(0);
	}

	/** light of colour c and strength i at p, reaching about r metres */
	add(p: THREE.Vector3, c: THREE.Color, i: number, r: number) {
		if (i <= 0) return;
		const { half, size } = GLOW;
		const px = ((p.x + half) / (2 * half)) * size - 0.5,
			pz = ((p.z + half) / (2 * half)) * size - 0.5;
		const rt = (r / (2 * half)) * size;
		const x0 = Math.max(0, Math.floor(px - rt * 1.6)),
			x1 = Math.min(size - 1, Math.ceil(px + rt * 1.6));
		const z0 = Math.max(0, Math.floor(pz - rt * 1.6)),
			z1 = Math.min(size - 1, Math.ceil(pz + rt * 1.6));
		const inv = 1 / (rt * rt);
		for (let z = z0; z <= z1; z++)
			for (let x = x0; x <= x1; x++) {
				const d2 = ((x - px) * (x - px) + (z - pz) * (z - pz)) * inv;
				if (d2 > 2.6) continue;
				// a soft core and a long skirt, as a small light has
				const f = i * (Math.exp(-d2 * 2.2) * 0.7 + 0.3 / (1 + d2 * 6));
				const k = z * size + x;
				this.rgb[k * 3] += c.r * f;
				this.rgb[k * 3 + 1] += c.g * f;
				this.rgb[k * 3 + 2] += c.b * f;
				this.wy[k] += p.y * f;
				this.w[k] += f;
			}
	}

	end() {
		const { maxI, maxY, minY } = GLOW;
		const n = GLOW.size * GLOW.size;
		for (let k = 0; k < n; k++) {
			const o = k * 4;
			this.data[o] = Math.min(255, (this.rgb[k * 3] / maxI) * 255);
			this.data[o + 1] = Math.min(255, (this.rgb[k * 3 + 1] / maxI) * 255);
			this.data[o + 2] = Math.min(255, (this.rgb[k * 3 + 2] / maxI) * 255);
			const y = this.w[k] > 1e-4 ? this.wy[k] / this.w[k] : 0;
			this.data[o + 3] = Math.round(THREE.MathUtils.clamp((y - minY) / (maxY - minY), 0, 1) * 255);
		}
		this.tex.needsUpdate = true;
	}
}

/** the surface's share of the little lights, for any lit material */
export const GLOW_GLSL = /* glsl */ `
uniform sampler2D uGlowMap;
uniform float uGlowOn;
vec3 glowAt(vec3 wp) {
	vec2 uv = (wp.xz + ${GLOW.half.toFixed(2)}) / ${(2 * GLOW.half).toFixed(2)};
	if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
	vec4 g = texture2D(uGlowMap, uv);
	float y = mix(${GLOW.minY.toFixed(2)}, ${GLOW.maxY.toFixed(2)}, g.a);
	float dy = (wp.y - y) / 1.6;
	return g.rgb * ${GLOW.maxI.toFixed(1)} * exp(-dy * dy) * uGlowOn;
}
`;
