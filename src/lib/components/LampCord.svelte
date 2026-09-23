<script lang="ts">
	import { onMount } from 'svelte';
	import { lights, toggleDay } from '$lib/lights.svelte';

	// ─── The lamp pull ──────────────────────────────────────────────────────
	// A verlet cord: a chain of beads with distance constraints and a heavy
	// knob on the end, with enough slack in the solver that it stretches when
	// you haul on it. Pull the knob past the trip line and the lights change
	// over; tap it and it gives itself a tug. It hangs from the top of the
	// window beside the page, or from the top of the page where the columns
	// stack, so that it never rides down over the ends of the lines.

	let canvas: HTMLCanvasElement;
	let knob: HTMLButtonElement;
	let redraw = () => {};
	$effect(() => {
		void lights.day;
		redraw();
	});
	const W = 90,
		H = 300,
		N = 16,
		SEG = 8.5;
	const ax = W / 2,
		ay = -4;

	onMount(() => {
		const g = canvas.getContext('2d')!;
		const dpr = Math.min(2, devicePixelRatio || 1);
		canvas.width = W * dpr;
		canvas.height = H * dpr;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const x = new Float32Array(N),
			y = new Float32Array(N),
			px = new Float32Array(N),
			py = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			x[i] = px[i] = ax;
			y[i] = py[i] = ay + i * SEG;
		}
		let raf = 0,
			still = 0,
			grab: { id: number; dx: number; dy: number; moved: boolean; y0: number } | null = null;
		let tripped = false;
		const rest = ay + (N - 1) * SEG;

		function step() {
			for (let i = 1; i < N; i++) {
				const vx = (x[i] - px[i]) * 0.985,
					vy = (y[i] - py[i]) * 0.985;
				px[i] = x[i];
				py[i] = y[i];
				x[i] += vx;
				y[i] += vy + 0.32;
			}
			for (let k = 0; k < 14; k++) {
				x[0] = ax;
				y[0] = ay;
				for (let i = 0; i < N - 1; i++) {
					const dx = x[i + 1] - x[i],
						dy = y[i + 1] - y[i];
					const d = Math.hypot(dx, dy) || 1e-6;
					// a little give, so a hard pull stretches the cord
					const want = SEG * (grab ? 1.12 : 1);
					const diff = ((d - want) / d) * 0.5;
					const ox = dx * diff,
						oy = dy * diff;
					if (i > 0) {
						x[i] += ox;
						y[i] += oy;
					}
					if (!(grab && i + 1 === N - 1)) {
						x[i + 1] -= ox * (i === 0 ? 2 : 1);
						y[i + 1] -= oy * (i === 0 ? 2 : 1);
					}
				}
			}
		}

		function draw() {
			g.setTransform(dpr, 0, 0, dpr, 0, 0);
			g.clearRect(0, 0, W, H);
			const day = lights.day;
			g.lineCap = 'round';
			g.lineJoin = 'round';
			g.strokeStyle = day ? 'rgba(40,58,74,0.85)' : 'rgba(150,150,156,0.7)';
			g.lineWidth = 1.3;
			g.beginPath();
			g.moveTo(x[0], y[0]);
			for (let i = 1; i < N; i++) g.lineTo(x[i], y[i]);
			g.stroke();
			// the knob: a turned bead, brass by day and grey by night
			const kx = x[N - 1],
				ky = y[N - 1] + 7;
			const gr = g.createRadialGradient(kx - 2.5, ky - 3, 1, kx, ky, 8.5);
			if (day) {
				gr.addColorStop(0, '#fff3c4');
				gr.addColorStop(0.35, '#e7b93e');
				gr.addColorStop(1, '#8a5f12');
			} else {
				gr.addColorStop(0, '#e6e6ea');
				gr.addColorStop(0.4, '#8f9097');
				gr.addColorStop(1, '#2f3034');
			}
			g.fillStyle = gr;
			g.beginPath();
			g.ellipse(kx, ky, 6.5, 8, 0, 0, Math.PI * 2);
			g.fill();
			knob.style.transform = `translate(${kx - 22}px, ${ky - 22}px)`;
		}

		function frame() {
			step();
			draw();
			let motion = 0;
			for (let i = 0; i < N; i++) motion += Math.abs(x[i] - px[i]) + Math.abs(y[i] - py[i]);
			still = motion < 0.02 && !grab ? still + 1 : 0;
			raf = still > 30 ? 0 : requestAnimationFrame(frame);
		}
		const wake = () => {
			if (!raf) raf = requestAnimationFrame(frame);
		};

		function local(e: PointerEvent) {
			const r = canvas.getBoundingClientRect();
			return [e.clientX - r.left, e.clientY - r.top];
		}
		const down = (e: PointerEvent) => {
			const [lx, ly] = local(e);
			grab = { id: e.pointerId, dx: x[N - 1] - lx, dy: y[N - 1] - ly, moved: false, y0: e.clientY };
			tripped = false;
			knob.setPointerCapture(e.pointerId);
			wake();
			e.preventDefault();
		};
		const move = (e: PointerEvent) => {
			if (!grab || grab.id !== e.pointerId) return;
			const [lx, ly] = local(e);
			if (Math.abs(e.clientY - grab.y0) > 4) grab.moved = true;
			x[N - 1] = lx + grab.dx;
			y[N - 1] = Math.min(rest + 90, ly + grab.dy);
			if (!tripped && y[N - 1] > rest + 34) {
				tripped = true;
				click();
				toggleDay();
			}
		};
		const up = (e: PointerEvent) => {
			if (!grab || grab.id !== e.pointerId) return;
			const moved = grab.moved;
			grab = null;
			if (!moved && !tripped) tug();
			wake();
		};
		function tug() {
			// a tap: the cord gives itself a pull
			py[N - 1] -= reduced ? 0 : 9;
			click();
			toggleDay();
			wake();
		}
		const key = (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				tug();
			}
		};
		knob.addEventListener('pointerdown', down);
		knob.addEventListener('pointermove', move);
		knob.addEventListener('pointerup', up);
		knob.addEventListener('pointercancel', up);
		knob.addEventListener('keydown', key);

		let actx: AudioContext | null = null;
		function click() {
			try {
				actx ??= new AudioContext();
				const n = Math.floor(actx.sampleRate * 0.03);
				const b = actx.createBuffer(1, n, actx.sampleRate);
				const d = b.getChannelData(0);
				for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 5);
				const s = actx.createBufferSource();
				s.buffer = b;
				const f = actx.createBiquadFilter();
				f.type = 'highpass';
				f.frequency.value = 1800;
				const gn = actx.createGain();
				gn.gain.value = 0.18;
				s.connect(f).connect(gn).connect(actx.destination);
				s.start();
			} catch {
				/* no audio */
			}
		}

		// give it a small swing on arrival
		setTimeout(() => {
			px[N - 1] -= reduced ? 0 : 6;
			wake();
		}, 1800);
		redraw = draw;
		draw();
		wake();
		return () => {
			cancelAnimationFrame(raf);
			redraw = () => {};
			actx?.close();
		};
	});
</script>

<div class="lamp" aria-hidden="false">
	<canvas bind:this={canvas} style="width:{W}px;height:{H}px" aria-hidden="true"></canvas>
	<button
		class="knob"
		type="button"
		bind:this={knob}
		aria-label={lights.day ? 'Turn the lights off' : 'Turn the lights on'}
		aria-pressed={lights.day}
		title="Pull for {lights.day ? 'night' : 'day'} (L)"
	></button>
</div>

<style>
	.lamp {
		position: fixed;
		top: 0;
		right: max(22px, calc(env(safe-area-inset-right, 0px) + 10px));
		width: 90px;
		height: 300px;
		z-index: 20;
		pointer-events: none;
	}
	canvas {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.knob {
		position: absolute;
		left: 0;
		top: 0;
		width: 44px;
		height: 44px;
		border: 0;
		background: transparent;
		border-radius: 50%;
		cursor: grab;
		pointer-events: auto;
		touch-action: none;
	}
	.knob:active {
		cursor: grabbing;
	}
	@media (max-width: 899px), (max-aspect-ratio: 21/20) {
		.lamp {
			position: absolute;
			height: 220px;
			right: max(10px, calc(env(safe-area-inset-right, 0px) + 4px));
		}
	}
</style>
