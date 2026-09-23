import * as THREE from 'three';
import { Pass } from 'postprocessing';

// ─── The last pass: onto the screen ───────────────────────────────────────
// The picture is drawn at whatever scale holds the frame rate, usually under
// the screen's density, and the browser stretches the canvas up to fit with
// a plain bilinear filter, which is what makes a picture look soft. This
// pass sharpens it first, against its four neighbours and held to their
// range so that it cannot ring, which undoes most of that softening; then
// the display's encoding and a dither. (Filling a canvas of the screen's
// own size instead costs more than it gives: mostly in the browser, which
// then blurs every pane of frosted glass over a far larger picture.)

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = position.xy * 0.5 + 0.5;
	gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D tIn;
uniform vec2 uSize;
uniform float uSharp;
varying vec2 vUv;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
	vec3 c = texture2D(tIn, vUv).rgb;
	// sharpen against the four neighbours a picture-pixel away, in a
	// perceptual space so the darks do not halo, and never past them
	vec2 d = 1.0 / uSize;
	vec3 n = sqrt(texture2D(tIn, vUv + vec2(0.0, d.y)).rgb);
	vec3 s = sqrt(texture2D(tIn, vUv - vec2(0.0, d.y)).rgb);
	vec3 e = sqrt(texture2D(tIn, vUv + vec2(d.x, 0.0)).rgb);
	vec3 w = sqrt(texture2D(tIn, vUv - vec2(d.x, 0.0)).rgb);
	vec3 g = sqrt(c);
	vec3 lo = min(min(min(n, s), min(e, w)), g);
	vec3 hi = max(max(max(n, s), max(e, w)), g);
	g = clamp(g + (g - (n + s + e + w) * 0.25) * uSharp, lo, hi);
	gl_FragColor = vec4(g * g, 1.0);
	#include <colorspace_fragment>
	// and a dither, now that the picture comes down to eight bits a channel
	gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
}
`;

export class PresentPass extends Pass {
	private mat: THREE.ShaderMaterial;

	constructor() {
		super('PresentPass');
		this.mat = new THREE.ShaderMaterial({
			uniforms: {
				tIn: { value: null },
				uSize: { value: new THREE.Vector2(1, 1) },
				uSharp: { value: 0.45 }
			},
			vertexShader: VERT,
			fragmentShader: FRAG,
			depthTest: false,
			depthWrite: false,
			toneMapped: false
		});
		this.fullscreenMaterial = this.mat;
		this.needsSwap = false;
		this.renderToScreen = true;
	}

	/** how hard to sharpen: none when the picture is drawn at the screen's own density */
	set sharpness(k: number) {
		this.mat.uniforms.uSharp.value = k;
	}

	render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget | null) {
		this.mat.uniforms.tIn.value = inputBuffer?.texture ?? null;
		renderer.setRenderTarget(null);
		renderer.render(this.scene, this.camera);
	}

	setSize(width: number, height: number) {
		this.mat.uniforms.uSize.value.set(width, height);
	}
}
