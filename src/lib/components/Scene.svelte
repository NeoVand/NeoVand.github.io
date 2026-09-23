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

	async function toggleMusic() {
		if (lights.playing) {
			music.pause();
			lights.playing = false;
		} else {
			lights.playing = await music.play(lights.day);
		}
	}

	onMount(() => {
		let disposed = false;
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
					onGramophone: toggleMusic
				});
				await g.ready();
				if (disposed) return;
				grove = g;
				(window as unknown as { __grove3d: Grove }).__grove3d = g;
				g.setScroll(window.scrollY);
				g.wake();
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
		if (e.key === 'l' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement))
			setDay(!lights.day);
	}
</script>

<svelte:window onkeydown={onKey} />

<canvas bind:this={canvas} class="scene" class:failed aria-hidden="true"></canvas>

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
	.scene.failed {
		background: linear-gradient(#5d7aa8, #f3c9a3);
	}
	:global(html:not(.day)) .scene.failed {
		background: #000;
	}
</style>
