<script lang="ts">
	import { filters, projects } from '$lib/data/content';
	import type { Project } from '$lib/data/types';

	let active = $state('all');
	let strip: HTMLDivElement;
	const labels = Object.fromEntries(filters.map((f) => [f.key, f.label]));
	const shown = $derived(
		active === 'all' ? projects : projects.filter((p) => p.tags.includes(active))
	);

	function pick(key: string, e: MouseEvent) {
		active = key;
		// on a phone the chips are one strip that scrolls; bring the one you
		// tapped to the middle of it
		const b = e.currentTarget as HTMLElement;
		if (strip.scrollWidth > strip.clientWidth)
			strip.scrollTo({
				left: b.offsetLeft - strip.clientWidth / 2 + b.offsetWidth / 2,
				behavior: 'smooth'
			});
	}

	// Clips play under a hand on a wide screen, and are only fetched then.
	function clip(node: HTMLVideoElement, p: Project) {
		const card = node.closest('article')!;
		const hover = matchMedia('(hover: hover)').matches;
		if (!hover || !p.video) return;
		const enter = () => {
			// not for a card the page has slid under a still pointer
			if (document.documentElement.classList.contains('scroll-still')) return;
			if (!node.src) node.src = p.video!;
			if (node.paused) node.play().catch(() => {});
		};
		const leave = () => node.pause();
		card.addEventListener('pointerenter', enter);
		card.addEventListener('pointermove', enter);
		card.addEventListener('pointerleave', leave);
		return {
			destroy() {
				card.removeEventListener('pointerenter', enter);
				card.removeEventListener('pointermove', enter);
				card.removeEventListener('pointerleave', leave);
			}
		};
	}
</script>

<section class="section" id="work" aria-labelledby="work-title">
	<div class="wrap">
		<div class="section-head">
			<h2 class="section-title" id="work-title">Work</h2>
			<p class="section-note">{shown.length} of {projects.length}</p>
		</div>
		<div class="chips" bind:this={strip} role="group" aria-label="Show only">
			{#each filters as f (f.key)}
				<button
					class="chip glass"
					class:on={active === f.key}
					type="button"
					aria-pressed={active === f.key}
					onclick={(e) => pick(f.key, e)}
				>
					<svg aria-hidden="true"><use href="#tag-{f.key}" /></svg>{f.label}
				</button>
			{/each}
		</div>

		<div class="grid">
			{#each shown as p (p.href)}
				<article class="card glass card-ring" style="--accent:{p.accent ?? 'var(--title)'}">
					<a class="cover" href={p.href} target="_blank" rel="noopener" aria-label="Open {p.title}"
					></a>
					<div class="thumb" style="background:{p.ground ?? 'var(--pane)'}">
						<img
							src={p.img}
							alt=""
							loading="lazy"
							decoding="async"
							onload={(e) => (e.currentTarget as HTMLImageElement).classList.add('in')}
						/>
						{#if p.video}
							<video
								muted
								loop
								playsinline
								preload="none"
								poster={p.img}
								use:clip={p}
								aria-hidden="true"
							></video>
						{/if}
					</div>
					<div class="body">
						<div class="row">
							<h3 class="title">{p.title}</h3>
							{#if p.repo}
								<a
									class="repo"
									href={p.repo}
									target="_blank"
									rel="noopener"
									aria-label="{p.title} source on GitHub"
									><svg aria-hidden="true"><use href="#icon-github" /></svg></a
								>
							{/if}
						</div>
						<p class="desc">{@html p.desc}</p>
						<div class="tags">
							{#each p.tags as t (t)}
								<span class="tag" title={labels[t]}
									><svg aria-hidden="true"><use href="#tag-{t}" /></svg><span
										class="visually-hidden">{labels[t]}</span
									></span
								>
							{/each}
						</div>
					</div>
				</article>
			{/each}
		</div>
	</div>
</section>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 26px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 34px;
		padding: 0 14px;
		border: 0;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 510;
		color: var(--muted);
		cursor: pointer;
		transition:
			color 200ms var(--ease),
			background-color 200ms var(--ease);
	}
	.chip svg {
		width: 14px;
		height: 14px;
	}
	.chip:hover {
		color: var(--title);
	}
	.chip.on {
		color: var(--bg);
		background: var(--title);
	}
	.chip.on::before {
		display: none;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(262px, 1fr));
		gap: 20px;
	}
	.card {
		border-radius: 16px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.cover {
		position: absolute;
		inset: 0;
		z-index: 1;
		border-radius: inherit;
	}
	.thumb {
		position: relative;
		aspect-ratio: 16 / 10;
		overflow: hidden;
	}
	.thumb img,
	.thumb video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.thumb img {
		opacity: 0;
		transition:
			opacity 500ms var(--ease),
			transform 900ms var(--ease-out);
	}
	.thumb img:global(.in) {
		opacity: 1;
	}
	.thumb video {
		opacity: 0;
		transition:
			opacity 300ms var(--ease),
			transform 900ms var(--ease-out);
	}
	.card:hover .thumb video {
		opacity: 1;
	}
	.body {
		padding: 14px 16px 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.title {
		font-size: 15.5px;
		font-weight: 610;
		letter-spacing: -0.01em;
		color: var(--title);
	}
	.repo {
		position: relative;
		z-index: 2;
		color: var(--muted);
		padding: 4px;
		margin: -4px;
		border-radius: 6px;
	}
	.repo:hover {
		color: var(--title);
	}
	.repo svg {
		width: 16px;
		height: 16px;
	}
	.desc {
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--muted);
		flex: 1;
	}
	.tags {
		display: flex;
		gap: 10px;
		margin-top: 4px;
		color: var(--faint);
	}
	.tag svg {
		width: 14px;
		height: 14px;
	}
	@media (max-width: 700px) {
		.chips {
			flex-wrap: nowrap;
			overflow-x: auto;
			scrollbar-width: none;
			margin: 0 calc(-1 * var(--gutter)) 22px;
			padding: 2px var(--gutter);
		}
		.chip {
			flex: none;
		}
		.grid {
			grid-template-columns: 1fr;
			gap: 14px;
		}
	}
	@media (min-width: 520px) and (max-width: 700px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
	}
	/* a phone: each card a row, the still beside the words, so thirty-odd of
	   them are a gallery to browse rather than a scroll to endure */
	@media (max-width: 519px) {
		.card {
			flex-direction: row;
			border-radius: 14px;
		}
		.thumb {
			flex: 0 0 38%;
			aspect-ratio: auto;
			min-height: 112px;
		}
		.body {
			padding: 11px 12px 12px;
			gap: 4px;
			min-width: 0;
		}
		.title {
			font-size: 15px;
		}
		.desc {
			font-size: 13px;
			line-height: 1.45;
			display: -webkit-box;
			-webkit-line-clamp: 3;
			line-clamp: 3;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}
		.tags {
			gap: 8px;
		}
	}
</style>
