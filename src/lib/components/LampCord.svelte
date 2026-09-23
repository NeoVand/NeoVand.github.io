<script lang="ts">
	import { onMount } from 'svelte';
	import { lights, toggleDay } from '$lib/lights.svelte';
	import { lampClick as click } from '$lib/music';

	// ─── The lamp pull ──────────────────────────────────────────────────────
	// A verlet cord: a chain of beads with distance constraints and a heavy
	// knob on the end. It comes out of a fitting above the window on a spring,
	// the way a real pull switch does: haul on the knob and the cord slides
	// down out of the fitting rather than stretching, and past the trip line
	// the switch clicks and the lights change over; let go and the spring takes
	// it back up. A tap does the same pull by itself. It hangs from the top of
	// the window beside the page, or from the top of the page where the columns
	// stack, so that it never rides down over the ends of the lines.

	let canvas: HTMLCanvasElement;
	let knob: HTMLButtonElement;
	let redraw = () => {};
	// how far between night (0) and day (1) the cord's colours are: they
	// change over on the page's own curve and time, not at once
	let tone = lights.day ? 1 : 0;
	let toneRaf = 0;
	$effect(() => {
		const to = lights.day ? 1 : 0;
		const from = tone,
			t0 = performance.now();
		cancelAnimationFrame(toneRaf);
		const step = (now: number) => {
			const k = Math.min(1, (now - t0) / 2400);
			const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
			tone = from + (to - from) * e;
			redraw();
			if (k < 1) toneRaf = requestAnimationFrame(step);
		};
		toneRaf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(toneRaf);
	});
	const mixRGBA = (a: number[], b: number[], k: number) =>
		`rgba(${a.map((v, i) => (i < 3 ? Math.round(v + (b[i] - v) * k) : (v + (b[i] - v) * k).toFixed(3))).join(',')})`;
	// the sheet the cord is drawn on is wide, so a swing is never cut off by
	// its edge; it runs to the edge of the window, and the cord hangs from a
	// point as far in from that edge as it always has
	const W = 280,
		H = 320,
		SEG = 8.5;
	let ax = W - 67;
	const ay = -4;
	/** how far the cord has to come out of the fitting to click */
	const TRIP = 20;
	/** and how far it can come out at all */
	const TRAVEL = 34;

	onMount(() => {
		// shorter where the page stacks, so it hangs clear of the island's crowns
		const stacked = matchMedia('(max-width: 899px), (max-aspect-ratio: 21/20)').matches;
		const N = stacked ? 8 : 16;
		ax = W - (stacked ? 55 : 67);
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
		const L = (N - 1) * SEG;
		const rest = ay + L;
		// how far the cord is out of the fitting, and how fast it is moving
		let out = 0,
			outV = 0;
		let raf = 0,
			still = 0,
			grab: {
				id: number;
				dx: number;
				dy: number;
				x0: number;
				y0: number;
				t0: number;
				moved: boolean;
				tripped: boolean;
			} | null = null;

		function step() {
			// the spring in the fitting
			if (!grab) {
				outV += (-out * 0.09 - outV * 0.32) * 1;
				out = Math.max(0, out + outV);
				if (out === 0 && outV < 0) outV = 0;
			}
			const top = ay + out;
			for (let i = 1; i < N; i++) {
				const vx = (x[i] - px[i]) * 0.975,
					vy = (y[i] - py[i]) * 0.975;
				px[i] = x[i];
				py[i] = y[i];
				x[i] += vx;
				y[i] += vy + 0.32;
			}
			for (let k = 0; k < 14; k++) {
				x[0] = ax;
				y[0] = top;
				for (let i = 0; i < N - 1; i++) {
					const dx = x[i + 1] - x[i],
						dy = y[i + 1] - y[i];
					const d = Math.hypot(dx, dy) || 1e-6;
					const diff = ((d - SEG) / d) * 0.5;
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
				// a braided cord has a little stiffness: no bead comes nearer
				// the one two along than most of two lengths, so it curves and
				// never folds into a zigzag
				for (let i = 0; i < N - 2; i++) {
					const dx = x[i + 2] - x[i],
						dy = y[i + 2] - y[i];
					const d = Math.hypot(dx, dy) || 1e-6;
					const min = SEG * 1.86;
					if (d >= min) continue;
					const diff = ((d - min) / d) * 0.25;
					if (i > 0) {
						x[i] += dx * diff;
						y[i] += dy * diff;
					}
					if (!(grab && i + 2 === N - 1)) {
						x[i + 2] -= dx * diff;
						y[i + 2] -= dy * diff;
					}
				}
			}
			// a hand on the knob clicks the switch once per pull
			if (grab && !grab.tripped && out > TRIP) {
				grab.tripped = true;
				click();
				toggleDay();
			}
		}

		function draw() {
			g.setTransform(dpr, 0, 0, dpr, 0, 0);
			g.clearRect(0, 0, W, H);
			const k = tone;
			g.lineCap = 'round';
			g.lineJoin = 'round';
			g.strokeStyle = mixRGBA([170, 170, 178, 0.72], [40, 58, 74, 0.85], k);
			g.lineWidth = 1.3;
			g.beginPath();
			// the cord that has come out of the fitting hangs straight from it
			g.moveTo(ax, -10);
			for (let i = 0; i < N; i++) g.lineTo(x[i], y[i]);
			g.stroke();
			// the knob: a turned bead, brass by day and pewter by night
			const kx = x[N - 1],
				ky = y[N - 1] + 7;
			const gr = g.createRadialGradient(kx - 2.5, ky - 3, 1, kx, ky, 8.5);
			// pewter #f1ece0 · #a79f8e · #3a362f, brass #fff3c4 · #e7b93e · #8a5f12
			gr.addColorStop(0, mixRGBA([241, 236, 224, 1], [255, 243, 196, 1], k));
			gr.addColorStop(0.38, mixRGBA([167, 159, 142, 1], [231, 185, 62, 1], k));
			gr.addColorStop(1, mixRGBA([58, 54, 47, 1], [138, 95, 18, 1], k));
			g.fillStyle = gr;
			g.beginPath();
			g.ellipse(kx, ky, 6.5, 8, 0, 0, Math.PI * 2);
			g.fill();
			knob.style.transform = `translate(${kx - 22}px, ${ky - 22}px)`;
		}

		function frame() {
			step();
			draw();
			let motion = Math.abs(outV) + out * 0.1;
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
			if (grab) return;
			const [lx, ly] = local(e);
			grab = {
				id: e.pointerId,
				dx: x[N - 1] - lx,
				dy: y[N - 1] - ly,
				x0: e.clientX,
				y0: e.clientY,
				t0: performance.now(),
				moved: false,
				tripped: false
			};
			try {
				knob.setPointerCapture(e.pointerId);
			} catch {
				/* a pointer the browser has already let go of */
			}
			wake();
			e.preventDefault();
		};
		const move = (e: PointerEvent) => {
			if (!grab || grab.id !== e.pointerId) return;
			const [lx, ly] = local(e);
			// a tap is a tap however much the finger wobbles; a drag is a drag in
			// any direction
			if (Math.hypot(e.clientX - grab.x0, e.clientY - grab.y0) > 9) grab.moved = true;
			// Only a pull down draws the cord out of the fitting; a hand moving
			// the knob sideways swings it on its arc, as a real cord does, and
			// never clicks the switch by accident.
			const kx = Math.max(10, Math.min(W - 6, lx + grab.dx));
			const ky = ly + grab.dy;
			out = Math.max(0, Math.min(TRAVEL, ky - (ay + L)));
			outV = 0;
			const len = L + out;
			const dx = Math.max(-len * 0.5, Math.min(len * 0.5, kx - ax));
			x[N - 1] = ax + dx;
			y[N - 1] = Math.min(ky, ay + out + Math.sqrt(Math.max(0, len * len - dx * dx)));
		};
		const release = (e: PointerEvent, cancelled: boolean) => {
			if (!grab || grab.id !== e.pointerId) return;
			const g0 = grab;
			grab = null;
			// let go, it swings from where it was, no faster than a hand could
			// have thrown it: the last jerk of a pointer is not a throw
			const i = N - 1;
			const vx = x[i] - px[i],
				vy = y[i] - py[i];
			const v = Math.hypot(vx, vy),
				vmax = 5;
			if (v > vmax) {
				px[i] = x[i] - (vx / v) * vmax;
				py[i] = y[i] - (vy / v) * vmax;
			}
			const tap = !g0.moved && performance.now() - g0.t0 < 600;
			// a cancelled touch was never a tap
			if (tap && !cancelled && !g0.tripped) tug();
			wake();
		};
		function tug() {
			// a tap is one click, however quickly they come; the cord is drawn
			// down out of the fitting and springs back
			click();
			toggleDay();
			if (reduced) return;
			outV = Math.max(outV, 0) + 9;
			wake();
		}
		const key = (e: KeyboardEvent) => {
			if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
				e.preventDefault();
				tug();
			}
		};
		const up = (e: PointerEvent) => release(e, false);
		const cancel = (e: PointerEvent) => release(e, true);
		knob.addEventListener('pointerdown', down);
		knob.addEventListener('pointermove', move);
		knob.addEventListener('pointerup', up);
		knob.addEventListener('pointercancel', cancel);
		knob.addEventListener('lostpointercapture', cancel);
		knob.addEventListener('keydown', key);

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
		/* the cord hangs 67px in from the window's right edge, as it did */
		right: max(0px, calc(env(safe-area-inset-right, 0px) - 12px));
		width: 280px;
		height: 320px;
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
			height: 240px;
			right: max(0px, calc(env(safe-area-inset-right, 0px) - 6px));
		}
	}
</style>
