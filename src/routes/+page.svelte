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
<!-- in the corner opposite the lamp: how this page is made -->
<a
	class="source"
	href="https://github.com/NeoVand/NeoVand.github.io"
	target="_blank"
	rel="noopener"
	aria-label="The source of this page, on GitHub"
	title="The source of this page"
>
	<svg aria-hidden="true"><use href="#icon-github-cat" /></svg>
</a>

<main>
	<Hero bind:cvOpen />
	<Resume bind:open={cvOpen} />
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
	.source {
		position: absolute;
		top: max(14px, env(safe-area-inset-top, 0px));
		left: calc(var(--gutter) - 6px);
		z-index: 20;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		color: var(--muted);
		transition:
			color 200ms var(--ease),
			opacity 900ms var(--ease);
	}
	.source:hover {
		color: var(--title);
	}
	.source svg {
		width: 22px;
		height: 22px;
	}
	:global(html.veiled) .source {
		opacity: 0;
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
