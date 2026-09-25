import * as THREE from 'three';

// ─── The line round the gramophone ────────────────────────────────────────
// Under the pointer the machine is ringed, to say it can be clicked: a crisp
// line just outside its silhouette, with a fainter one beyond it so the line
// has a little light round it. It is read from a mask of the machine, drawn
// only while the line shows: the solid things that can stand in front of it
// first, into depth alone, so that a pier or a trunk hides the line too, then
// the machine in white. Laid over the finished picture, on either canvas.

/** the layers the mask is drawn from: the machine, and what can stand in front of it */
export const GRAM_LAYER = 3,
	OCCLUDER_LAYER = 4;

export class GramOutline {
	private mask = new THREE.WebGLRenderTarget(2, 2);
	private white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
	private depth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
	private flat = new THREE.Camera();
	private scene = new THREE.Scene();
	private mat = new THREE.ShaderMaterial({
		uniforms: {
			uMask: { value: this.mask.texture as THREE.Texture },
			uTexel: { value: new THREE.Vector2(1, 1) },
			uColor: { value: new THREE.Color(1.0, 0.86, 0.62) },
			uOn: { value: 0 }
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = position.xy * 0.5 + 0.5;
				gl_Position = vec4(position.xy, 0.0, 1.0);
			}`,
		fragmentShader: /* glsl */ `
			uniform sampler2D uMask;
			uniform vec2 uTexel;
			uniform vec3 uColor;
			uniform float uOn;
			varying vec2 vUv;
			float ring(vec2 uv, float r) {
				float m = 0.0;
				for (int i = 0; i < 12; i++) {
					float a = float(i) * 0.5236;
					m = max(m, texture2D(uMask, uv + vec2(cos(a), sin(a)) * uTexel * r).r);
				}
				return m;
			}
			void main() {
				float inside = texture2D(uMask, vUv).r;
				float line = clamp(ring(vUv, 1.7) - inside, 0.0, 1.0);
				float halo = clamp(ring(vUv, 3.4) - inside, 0.0, 1.0) * 0.35;
				float a = max(line, halo) * uOn;
				if (a < 0.003) discard;
				gl_FragColor = vec4(uColor, 1.0);
				#include <colorspace_fragment>
				gl_FragColor = vec4(gl_FragColor.rgb * a, a);
			}`,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		toneMapped: false,
		premultipliedAlpha: true
	});

	constructor() {
		const tri = new THREE.BufferGeometry().setAttribute(
			'position',
			new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
		);
		const mesh = new THREE.Mesh(tri, this.mat);
		mesh.frustumCulled = false;
		this.scene.add(mesh);
	}

	/** the size of the picture it is laid over, in its buffer's pixels (the line is sized in them) */
	setSize(bw: number, bh: number) {
		this.mask.setSize(bw, bh);
		this.mat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
	}

	/** Over the picture just drawn to the screen, the line, as strong as `on` (0..1). */
	draw(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, on: number) {
		this.mat.uniforms.uOn.value = on;
		if (on < 0.002) return;
		const keep = {
			layers: cam.layers.mask,
			shadows: r.shadowMap.needsUpdate,
			override: scene.overrideMaterial,
			autoClear: r.autoClear,
			clear: r.getClearColor(new THREE.Color()),
			alpha: r.getClearAlpha()
		};
		// (and no shadows drawn in passing, from a camera that sees only this)
		r.shadowMap.needsUpdate = false;
		r.setRenderTarget(this.mask);
		r.setClearColor(0x000000, 1);
		r.clear();
		r.autoClear = false;
		cam.layers.set(OCCLUDER_LAYER);
		scene.overrideMaterial = this.depth;
		r.render(scene, cam);
		cam.layers.set(GRAM_LAYER);
		scene.overrideMaterial = this.white;
		r.render(scene, cam);
		cam.layers.mask = keep.layers;
		scene.overrideMaterial = keep.override;
		r.setRenderTarget(null);
		r.render(this.scene, this.flat);
		r.autoClear = keep.autoClear;
		r.setClearColor(keep.clear, keep.alpha);
		r.shadowMap.needsUpdate = keep.shadows;
	}

	dispose() {
		this.mask.dispose();
		this.mat.dispose();
		this.white.dispose();
		this.depth.dispose();
	}
}
