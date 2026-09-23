<script lang="ts">
	import { onMount } from 'svelte';
	import { bio, links, meta } from '$lib/data/content';

	let { cvOpen = $bindable(false) }: { cvOpen?: boolean } = $props();

	let bioEl: HTMLParagraphElement;
	let caret: HTMLSpanElement;
	let shown = $state(false);
	let typing = $state(false);

	// The bio writes itself over the finished paragraph rather than into it:
	// the text is all there from the first frame, laid out once, and the part
	// not yet typed is painted with no colour through a CSS custom highlight.
	// Typing by truncating the text re-broke the lines on every frame under
	// text-wrap: pretty, which on a twenty-line column read as the paragraph
	// shivering. Browsers without the Highlight API get a plain fade.
	onMount(() => {
		const veil = (window as unknown as { __veil?: { lifted: Promise<void> } }).__veil;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const H = (globalThis as { Highlight?: typeof Highlight }).Highlight;
		const canType = !!H && typeof CSS !== 'undefined' && 'highlights' in CSS && !reduced;
		let raf = 0;
		let stopped = false;

		const nodes: Text[] = [];
		const walk = document.createTreeWalker(bioEl, NodeFilter.SHOW_TEXT);
		for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n as Text);
		const total = nodes.reduce((s, n) => s + n.length, 0);
		const range = document.createRange();
		let hl: Highlight | null = null;
		if (canType) {
			range.setStart(nodes[0], 0);
			range.setEndAfter(bioEl.lastChild!);
			hl = new H!(range);
			CSS.highlights.set('untyped', hl);
			typing = true;
		}

		function at(count: number): [Text, number] {
			let c = Math.max(0, Math.min(total, count));
			for (const n of nodes) {
				if (c <= n.length) return [n, c];
				c -= n.length;
			}
			const last = nodes[nodes.length - 1];
			return [last, last.length];
		}

		function type(t0: number, dur: number) {
			const step = (now: number) => {
				if (stopped) return;
				const p = Math.max(0, Math.min(1, (now - t0) / dur));
				const [node, off] = at(Math.round(total * p));
				range.setStart(node, off);
				// the caret rides the end of what is written
				const r = document.createRange();
				r.setStart(node, off);
				r.setEnd(node, off);
				const box = r.getClientRects()[0] ?? r.getBoundingClientRect();
				const host = bioEl.getBoundingClientRect();
				caret.style.transform = `translate(${box.left - host.left}px, ${box.top - host.top}px)`;
				caret.style.height = `${box.height || 20}px`;
				if (p < 1) raf = requestAnimationFrame(step);
				else finish();
			};
			raf = requestAnimationFrame(step);
		}

		function finish() {
			stopped = true;
			cancelAnimationFrame(raf);
			CSS.highlights?.delete('untyped');
			typing = false;
		}

		(veil?.lifted ?? Promise.resolve()).then(() => {
			shown = true;
			if (canType) setTimeout(() => type(performance.now(), 2800), 450);
		});
		// scrolling, a click or Escape lands the opening at once
		const skip = () => typing && finish();
		addEventListener('wheel', skip, { passive: true });
		addEventListener('keydown', skip);
		return () => {
			finish();
			removeEventListener('wheel', skip);
			removeEventListener('keydown', skip);
		};
	});
</script>

<header class="hero" class:shown>
	<h1 class="visually-hidden">{meta.h1}</h1>
	<div class="copy">
		<p class="name" aria-hidden="true">{meta.name}</p>
		<div class="bio-wrap">
			<p class="bio" bind:this={bioEl}>{@html bio}</p>
			<span class="caret" class:on={typing} bind:this={caret} aria-hidden="true"></span>
		</div>
		<nav class="links" aria-label="Elsewhere">
			{#each links as l (l.href)}
				<a class="pill glass" href={l.href} target="_blank" rel="noopener">
					<svg aria-hidden="true"><use href="#{l.icon}" /></svg>
					{#if l.label === 'Google Scholar'}<span
							><span class="wide-only">Google&nbsp;</span>Scholar</span
						>{:else}{l.label}{/if}
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
				Résumé
			</button>
		</nav>
	</div>
</header>

<style>
	.hero {
		position: relative;
		z-index: 1;
		min-height: 100svh;
		/* the island is behind this, on the canvas; the empty part of the hero
		   lets a hand through to it */
		pointer-events: none;
	}
	.copy {
		pointer-events: auto;
		position: absolute;
		left: 58vw;
		top: 50%;
		width: min(35rem, 36vw);
		transform: translateY(-50%);
	}
	.name {
		font-family: var(--serif);
		font-size: clamp(44px, 4.6vw, 74px);
		line-height: 1;
		letter-spacing: -0.012em;
		color: var(--title);
		margin-bottom: 26px;
		text-wrap: balance;
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
		font-weight: calc(560 + var(--wn));
	}
	:global(::highlight(untyped)) {
		color: transparent;
	}
	.caret {
		position: absolute;
		left: 0;
		top: 0;
		width: 2px;
		background: var(--title);
		border-radius: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.caret.on {
		opacity: 0.8;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 28px;
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
	.shown .bio-wrap {
		opacity: 1;
		transform: none;
		transition-delay: 380ms;
	}
	.shown .links {
		opacity: 1;
		transform: none;
		transition-delay: 1400ms;
	}
	:global(html:not(.veiled)) .hero:not(.shown) .name,
	:global(html:not(.veiled)) .hero:not(.shown) .bio-wrap,
	:global(html:not(.veiled)) .hero:not(.shown) .links {
		transition-duration: 0ms;
	}

	/* Stacked: the island takes the top of the screen and the words come
	   under it, the width of the screen. The same rule as the renderer's. */
	@media (max-width: 899px), (max-aspect-ratio: 21/20) {
		.copy {
			position: relative;
			left: auto;
			top: auto;
			transform: none;
			width: auto;
			max-width: 40rem;
			margin: 0 auto;
			padding: 57svh calc(var(--gutter-r) + 4px) 32px calc(var(--gutter) + 4px);
		}
		.name {
			font-size: clamp(38px, 10vw, 56px);
			margin-bottom: 18px;
		}
		.bio {
			font-size: 15.5px;
		}
		.links {
			gap: 8px;
		}
		.links .pill {
			height: 36px;
			padding: 0 13px;
			font-size: 13px;
			flex: none;
		}
		.wide-only {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.name,
		.bio-wrap,
		.links {
			transform: none;
			transition: opacity 400ms linear;
		}
	}
</style>
