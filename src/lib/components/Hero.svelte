<script lang="ts">
	import { onMount } from 'svelte';
	import { bio, links, meta } from '$lib/data/content';

	let { cvOpen = $bindable(false) }: { cvOpen?: boolean } = $props();

	let shown = $state(false);

	// The opening is the styles' (below): it begins once the veil has lifted.
	onMount(() => {
		const veil = (window as unknown as { __veil?: { lifted: Promise<void> } }).__veil;
		(veil?.lifted ?? Promise.resolve()).then(() => (shown = true));
	});
</script>

<header class={['hero', { shown }]}>
	<h1 class="visually-hidden">{meta.h1}</h1>
	<div class="copy">
		<p class="name" aria-hidden="true">{meta.name}</p>
		<div class="bio-wrap">
			<p class="bio">{@html bio}</p>
		</div>
		<nav class="links" aria-label="Elsewhere">
			{#each links as l (l.href)}
				<a class="pill glass" href={l.href} target="_blank" rel="noopener">
					<svg aria-hidden="true"><use href="#{l.icon}" /></svg>
					<span>{l.label}</span>
				</a>
			{/each}
			<button
				class="pill glass cv-toggle"
				type="button"
				aria-expanded={cvOpen}
				aria-controls="cv"
				onclick={() => (cvOpen = !cvOpen)}
			>
				<svg aria-hidden="true"><use href="#icon-leaf" /></svg>
				<span>Résumé</span>
			</button>
		</nav>
	</div>
</header>

<style>
	.hero {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		min-height: 100svh;
		padding-block: 48px;
		/* the island is behind this, on the canvas; the empty part of the hero
		   lets a hand through to it */
		pointer-events: none;
	}
	.copy {
		pointer-events: auto;
		position: relative;
		flex-shrink: 0;
		margin-left: 58vw;
		width: min(35rem, 36vw);
		/* In flow so a long bio or wrapped links can grow the hero rather
		   than clipping above the viewport or overlapping the work below. */
		/* the links below are sized to it */
		container-type: inline-size;
	}
	.name {
		font-family: var(--serif);
		/* one line: the name is 8.3em wide in this face, so it is sized to the
		   column it sits in rather than wrapped */
		font-size: clamp(34px, 4.25vw, 64px);
		white-space: nowrap;
		line-height: 1;
		letter-spacing: -0.012em;
		color: var(--title);
		margin-bottom: 26px;
	}
	.bio-wrap {
		position: relative;
	}
	.bio {
		font-size: 16px;
		line-height: 1.66;
		color: var(--muted);
		text-wrap: pretty;
		max-width: 36em;
	}
	.bio :global(strong) {
		color: var(--title);
		font-weight: 570;
	}
	/* Keep the labels and touch targets at a readable size. The links find
	   another row when needed, then settle into pairs in a narrow column. */
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 28px;
		max-width: 100%;
	}
	.links .pill {
		min-width: 0;
		max-width: 100%;
		min-height: 44px;
		height: auto;
		padding: 10px 14px;
		gap: 8px;
		font-size: 13px;
		line-height: 1.35;
		text-align: left;
		white-space: normal;
	}
	.links .pill svg {
		width: 16px;
		height: 16px;
	}
	.links .pill span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.links .pill:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 3px;
	}
	.links .cv-toggle[aria-expanded='true'] {
		background: var(--pane-2);
		box-shadow: inset 0 0 0 1px var(--ring);
	}
	@container (max-width: 420px) {
		.links {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.links .pill {
			padding-inline: 12px;
			border-radius: 16px;
		}
		.links .cv-toggle {
			grid-column: 1 / -1;
			justify-content: center;
		}
	}

	/* the opening: one orchestrated moment, after the veil */
	.name,
	.bio-wrap,
	.links {
		opacity: 0;
		transform: translateY(10px);
		transition:
			opacity 900ms var(--ease),
			transform 1200ms var(--ease-out);
	}
	.shown .name {
		opacity: 1;
		transform: none;
		transition-delay: 150ms;
	}
	/* The bio comes in in the order it is read: as it rises into place a
	   soft edge of light goes down it, and its lines appear from the top to
	   the bottom in a little over a second. (Where a browser cannot animate
	   the edge, the paragraph simply fades in.) */
	.bio-wrap {
		--reveal: -20%;
		-webkit-mask-image: linear-gradient(#000 var(--reveal), transparent calc(var(--reveal) + 20%));
		mask-image: linear-gradient(#000 var(--reveal), transparent calc(var(--reveal) + 20%));
	}
	.shown .bio-wrap {
		--reveal: 100%;
		opacity: 1;
		transform: none;
		transition:
			opacity 700ms var(--ease) 380ms,
			transform 1100ms var(--ease-out) 380ms,
			--reveal 1300ms cubic-bezier(0.3, 0, 0.2, 1) 380ms;
	}
	.shown .links {
		opacity: 1;
		transform: none;
		transition-delay: 1250ms;
	}
	:global(html:not(.veiled)) .hero:not(.shown) .name,
	:global(html:not(.veiled)) .hero:not(.shown) .bio-wrap,
	:global(html:not(.veiled)) .hero:not(.shown) .links {
		transition-duration: 0ms;
	}

	/* Stacked: the island takes the top of the screen and the words come
	   under it, the width of the screen. The same rule as the renderer's. */
	@media (max-width: 899px), (max-aspect-ratio: 21/20) {
		.hero {
			display: block;
			padding-block: 0;
		}
		.copy {
			width: auto;
			max-width: 40rem;
			margin: 0 auto;
			padding: 57svh calc(var(--gutter-r) + 4px) 32px calc(var(--gutter) + 4px);
			/* its top is the island's: a finger there is for the island (to
			   turn it, to play the record, to shake a tree), not for the
			   words below it */
			pointer-events: none;
		}
		.copy > * {
			pointer-events: auto;
		}
		.name {
			font-size: min(56px, calc((100vw - 60px) / 8.4));
			margin-bottom: 18px;
		}
		/* a phone's column is narrow and the paragraph long: set smaller, it
		   reads in fewer lines and a shorter scroll */
		.bio {
			font-size: 14px;
			line-height: 1.62;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.name,
		.bio-wrap,
		.links,
		.shown .bio-wrap {
			--reveal: 100%;
			transform: none;
			transition: opacity 400ms linear;
		}
	}
</style>
