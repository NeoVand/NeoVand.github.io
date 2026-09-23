<script lang="ts">
	import { onMount } from 'svelte';
	import { lights, setDay } from '$lib/lights.svelte';
	import * as music from '$lib/music';
	import type { Grove } from '$lib/grove/engine';

	// The renderer behind the whole page. It is fetched after the page itself
	// (three.js is most of the weight), built behind the veil, and the veil is
	// lifted once it has drawn its first frame.

	let canvas: HTMLCanvasElement;
	let grove = $state.raw<Grove | null>(null);
	let failed = $state(false);
	// ?hud: frame rate and resolution in a corner, for looking at a real phone
	let hud = $state('');

	async function toggleMusic() {
		music.gramClick(!lights.playing);
		if (lights.playing) {
			music.pause();
			lights.playing = false;
			return;
		}
		// playing from the moment it is asked for, so a pull on the lamp while
		// the record is still starting changes records rather than missing it
		lights.playing = true;
		const ok = await music.play(lights.day);
		if (!ok) lights.playing = false;
	}

	onMount(() => {
		let disposed = false;
		music.onStop(() => (lights.playing = false));
		let g: Grove | null = null;
		const veil = (window as unknown as { __veil?: { open(): void; lifted: Promise<void> } }).__veil;
		(async () => {
			try {
				const { Grove } = await import('$lib/grove/engine');
				if (disposed) return;
				const q = new URLSearchParams(location.search);
				g = new Grove({
					canvas,
					day: lights.day,
					reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
					seed: q.has('seed') ? +q.get('seed')! : undefined,
					onGramophone: toggleMusic,
					level: music.level
				});
				await g.ready();
				if (disposed) return;
				grove = g;
				(window as unknown as { __grove3d: Grove }).__grove3d = g;
				g.setScroll(window.scrollY);
				g.wake();
				if (q.has('hud')) {
					let n = 0,
						t0 = performance.now(),
						worst = 0,
						last = t0;
					const tick = (now: number) => {
						if (disposed) return;
						worst = Math.max(worst, now - last);
						last = now;
						n++;
						if (now - t0 > 500) {
							const s = g!.stats;
							hud = `${((n * 1000) / (now - t0)).toFixed(0)} fps · worst ${worst.toFixed(0)} ms · dpr ${s.dpr}`;
							n = 0;
							t0 = now;
							worst = 0;
						}
						requestAnimationFrame(tick);
					};
					requestAnimationFrame(tick);
				}
			} catch (e) {
				console.warn('grove:', e);
				failed = true;
			}
			veil?.open();
			await veil?.lifted;
			g?.begin();
		})();
		const onScroll = () => g?.setScroll(window.scrollY);
		addEventListener('scroll', onScroll, { passive: true });
		return () => {
			disposed = true;
			removeEventListener('scroll', onScroll);
			g?.dispose();
		};
	});

	let wasDay = lights.day;
	$effect(() => {
		const day = lights.day;
		grove?.setDay(day);
		if (day !== wasDay && lights.playing) music.changeover(day);
		wasDay = day;
	});
	$effect(() => {
		grove?.setPlaying(lights.playing);
	});

	// the keyboard's way to the lamp: L
	function onKey(e: KeyboardEvent) {
		if (
			e.key === 'l' &&
			!e.repeat &&
			!e.metaKey &&
			!e.ctrlKey &&
			!(e.target instanceof HTMLInputElement)
		)
			setDay(!lights.day);
	}
</script>

<svelte:window onkeydown={onKey} />

<canvas bind:this={canvas} class="scene" class:failed aria-hidden="true"></canvas>
{#if hud}<div class="hud">{hud}</div>{/if}

<style>
	.scene {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		height: 100lvh;
		z-index: 0;
		display: block;
		/* horizontal drags turn the island; vertical ones scroll the page */
		touch-action: pan-y;
		-webkit-tap-highlight-color: transparent;
		background: var(--bg);
	}
	.hud {
		position: fixed;
		left: 8px;
		bottom: calc(8px + env(safe-area-inset-bottom, 0px));
		z-index: 50;
		padding: 4px 8px;
		border-radius: 6px;
		font:
			12px/1.3 ui-monospace,
			monospace;
		color: #fff;
		background: rgba(0, 0, 0, 0.55);
		pointer-events: none;
	}
	.scene.failed {
		background: linear-gradient(#6f93c4, #b9cde4 60%, #e8dccb);
	}
	:global(html:not(.day)) .scene.failed {
		background: linear-gradient(#0a1128, #1a2548 60%, #28335a);
	}
</style>
