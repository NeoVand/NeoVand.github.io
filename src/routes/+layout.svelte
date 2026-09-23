<script lang="ts">
	import '../app.css';
	import sprite from '$lib/data/sprite.html?raw';
	import { meta } from '$lib/data/content';

	let { children } = $props();
</script>

<svelte:head>
	<title>{meta.title}</title>
	<meta name="description" content={meta.description} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://neovand.github.io/" />
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:image" content="https://neovand.github.io/media/og.jpg" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={meta.title} />
	<meta name="twitter:description" content={meta.description} />
	<meta name="twitter:image" content="https://neovand.github.io/media/og.jpg" />
</svelte:head>

<!-- Hugeicons, Stroke Rounded (free, MIT): the handful of marks the page uses, inlined -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">{@html sprite}</svg>

{@render children()}
