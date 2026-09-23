<script lang="ts">
	import { onMount } from 'svelte';
	import { readLights } from '$lib/lights.svelte';
	import { meta } from '$lib/data/content';
	import Scene from '$lib/components/Scene.svelte';
	import Hero from '$lib/components/Hero.svelte';
	import Resume from '$lib/components/Resume.svelte';
	import Work from '$lib/components/Work.svelte';
	import Papers from '$lib/components/Papers.svelte';
	import Media from '$lib/components/Media.svelte';
	import Earlier from '$lib/components/Earlier.svelte';
	import LampCord from '$lib/components/LampCord.svelte';
	import ReadingRoom from '$lib/components/ReadingRoom.svelte';

	let cvOpen = $state(false);
	let room: ReadingRoom;
	onMount(readLights);
</script>

<Scene />
<LampCord />

<main>
	<Hero bind:cvOpen />
	<Resume open={cvOpen} />
	<Work />
	<Papers onopen={(p, deck) => room.open(p, deck)} />
	<Media />
	<Earlier />
</main>

<footer class="wrap">
	<p>{meta.footer.replace('2025', String(new Date().getFullYear()))}</p>
	<a href="/archive/">The first site</a>
</footer>

<ReadingRoom bind:this={room} />

<style>
	main {
		position: relative;
		z-index: 1;
		/* the page lies over the scene; where it has nothing, a hand goes
		   through to the island */
		pointer-events: none;
	}
	main > :global(*) {
		pointer-events: auto;
	}
	footer {
		position: relative;
		z-index: 1;
		display: flex;
		justify-content: space-between;
		gap: 20px;
		padding-top: 96px;
		padding-bottom: calc(40px + env(safe-area-inset-bottom, 0px));
		font-size: 13px;
		color: var(--muted);
	}
	footer a {
		color: var(--muted);
		text-underline-offset: 3px;
	}
	footer a:hover {
		color: var(--title);
	}
</style>
