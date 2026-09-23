<script lang="ts">
	import { papers } from '$lib/data/content';
	import type { Paper } from '$lib/data/types';
	import ReadingRoom from './ReadingRoom.svelte';

	let room: ReadingRoom;

	function open(e: MouseEvent, p: Paper) {
		// a modified click means "the PDF, please", as the link says
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
		e.preventDefault();
		room.open(p, e.currentTarget as HTMLElement);
	}
</script>

<section class="section" id="papers" aria-labelledby="papers-title">
	<div class="wrap">
		<div class="section-head">
			<h2 class="section-title" id="papers-title">Selected publications</h2>
		</div>
		<div class="decks">
			{#each papers as p (p.slug)}
				<a class="deck" href={p.pdf} target="_blank" rel="noopener" onclick={(e) => open(e, p)}>
					<div class="fan">
						{#each [4, 3, 2, 1, 0] as i (i)}
							<img
								class="page"
								style="--i:{i}"
								src="/media/papers/{p.slug}-{i + 1}.jpg"
								alt={i === 0 ? 'First page of the paper' : ''}
								loading="lazy"
								decoding="async"
							/>
						{/each}
					</div>
					<div class="meta">
						<span class="title">{p.title}</span>
						<span class="venue">{p.venue}</span>
					</div>
				</a>
			{/each}
		</div>
	</div>
</section>

<ReadingRoom bind:this={room} />

<style>
	.decks {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 34px 30px;
	}
	.deck {
		display: block;
		text-decoration: none;
		color: inherit;
		border-radius: 14px;
	}
	/* Five pages held in a hand: every one pivots about the bottom of the
	   middle page, so opening the fan wider under a pointer reads as a thumb
	   running down the deck. */
	.fan {
		position: relative;
		width: 100%;
		aspect-ratio: 1 / 0.838;
		margin-bottom: 18px;
	}
	.page {
		position: absolute;
		left: 24%;
		bottom: 10.6%;
		width: 52%;
		aspect-ratio: 1 / 1.35;
		object-fit: cover;
		object-position: top center;
		background: #fff;
		border-radius: 6px;
		--sh: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.55)) drop-shadow(0 12px 22px rgba(0, 0, 0, 0.45));
		transform-origin: 50% 100%;
		transform: rotate(calc((var(--i) - 2) * var(--fan, 5.5deg)));
		/* by night the paper is dimmed rather than a slab of white; the figures
		   keep their colour */
		filter: invert(0.87) hue-rotate(180deg) contrast(0.88) brightness(calc(1 - var(--i) * 0.06))
			var(--sh);
		transition:
			transform 420ms var(--ease),
			filter 480ms var(--ease);
	}
	:global(.day) .page {
		--sh: drop-shadow(0 1px 2px rgba(30, 30, 50, 0.22))
			drop-shadow(0 10px 18px rgba(30, 30, 50, 0.2));
		filter: brightness(calc(1 - var(--i) * 0.04)) var(--sh);
	}
	.deck:hover .fan,
	.deck:focus-visible .fan {
		--fan: 10deg;
	}
	.deck:global(.no-hover):hover .fan {
		--fan: 5.5deg;
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 6px;
		text-align: center;
	}
	.title {
		font-family: var(--serif);
		font-size: 16.5px;
		line-height: 1.32;
		color: var(--title);
		text-wrap: balance;
	}
	.venue {
		font-size: 13px;
		color: var(--muted);
		text-wrap: balance;
	}
	@media (max-width: 900px) {
		.decks {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 560px) {
		.decks {
			grid-template-columns: 1fr;
			justify-items: center;
		}
		.deck {
			width: 100%;
			max-width: 340px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.page {
			transition: none;
		}
	}
</style>
