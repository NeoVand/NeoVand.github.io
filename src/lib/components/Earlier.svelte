<script lang="ts">
	import { earlier } from '$lib/data/content';
	import type { EarlierDetail } from '$lib/data/types';

	// The older projects have no page of their own to link to, so the
	// write-up and the figures live here, in a panel over the page.
	let detail = $state.raw<EarlierDetail | null>(null);
	let dialog: HTMLDialogElement;
	let opener: HTMLElement | null = null;

	function show(d: EarlierDetail, e: MouseEvent) {
		opener = e.currentTarget as HTMLElement;
		detail = d;
		dialog.showModal();
		document.documentElement.style.overflow = 'hidden';
	}
	function hide() {
		dialog.close();
	}
	function closed() {
		document.documentElement.style.overflow = '';
		opener?.focus({ preventScroll: true });
		detail = null;
	}
</script>

<section class="section" id="earlier" aria-labelledby="earlier-title">
	<div class="wrap">
		<div class="section-head">
			<h2 class="section-title" id="earlier-title">Earlier work</h2>
		</div>
		<div class="tiles">
			{#each earlier as it (it.title)}
				{#if it.detail}
					{@const d = it.detail}
					<button class="tile glass card-ring" type="button" onclick={(e) => show(d, e)}>
						<div class="thumb" class:grey={it.grey}>
							<img src={it.img} alt="" loading="lazy" decoding="async" />
						</div>
						<div class="body">
							<span class="t">{it.title}</span>
							<span class="d">{@html it.desc}</span>
						</div>
					</button>
				{:else}
					<a class="tile glass card-ring" href={it.href} target="_blank" rel="noopener">
						<div class="thumb" class:grey={it.grey}>
							<img src={it.img} alt="" loading="lazy" decoding="async" />
						</div>
						<div class="body">
							<span class="t">{it.title}</span>
							<span class="d">{@html it.desc}</span>
						</div>
					</a>
				{/if}
			{/each}
		</div>
	</div>
</section>

<dialog
	class="panel glass"
	bind:this={dialog}
	onclose={closed}
	onclick={(e) => e.target === dialog && hide()}
	aria-labelledby="modal-title"
>
	{#if detail}
		<button class="x" type="button" aria-label="Close" onclick={hide}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
		<h3 id="modal-title">{detail.title}</h3>
		<p class="year">{detail.year}</p>
		<div class="text">
			{#each detail.body as para, i (i)}<p>{@html para}</p>{/each}
		</div>
		{#if detail.link}
			<a class="pill glass" href={detail.link.href} target="_blank" rel="noopener"
				>{detail.link.label}</a
			>
		{/if}
		{#if detail.images.length}
			<div class="figs">
				{#each detail.images as src (src)}<img
						{src}
						alt=""
						loading="lazy"
						decoding="async"
					/>{/each}
			</div>
		{/if}
	{/if}
</dialog>

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
		gap: 16px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		border: 0;
		border-radius: 14px;
		overflow: hidden;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.thumb {
		aspect-ratio: 16 / 10;
		overflow: hidden;
		background: #fff;
	}
	.thumb.grey {
		background: #e9e9e9;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.body {
		padding: 11px 13px 14px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.t {
		font-size: 14px;
		line-height: 1.3;
		font-weight: calc(600 + var(--wn));
		color: var(--title);
	}
	.d {
		font-size: 13px;
		line-height: 1.5;
		color: var(--muted);
	}

	.panel {
		margin: auto;
		width: min(780px, calc(100vw - 32px));
		max-height: calc(100svh - 64px);
		overflow-y: auto;
		overscroll-behavior: contain;
		border: 0;
		border-radius: 18px;
		padding: 32px 36px 36px;
		color: var(--text);
		background: var(--sheet-2);
		-webkit-backdrop-filter: blur(24px) saturate(var(--frost-sat));
		backdrop-filter: blur(24px) saturate(var(--frost-sat));
	}
	.panel[open] {
		animation: rise 260ms var(--ease-out);
	}
	.panel::backdrop {
		background: rgba(0, 0, 0, 0.55);
		-webkit-backdrop-filter: blur(3px);
		backdrop-filter: blur(3px);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
	}
	.x {
		position: absolute;
		top: 14px;
		right: 14px;
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		background: none;
		border: 0;
		border-radius: 10px;
		color: var(--muted);
		cursor: pointer;
	}
	.x:hover {
		color: var(--title);
	}
	.x svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}
	h3 {
		font-family: var(--serif);
		font-weight: 400;
		font-size: 25px;
		line-height: 1.25;
		color: var(--title);
		margin-right: 40px;
	}
	.year {
		font-size: 13px;
		color: var(--muted);
		margin: 6px 0 18px;
	}
	.text p {
		font-size: 14.5px;
		line-height: 1.7;
		margin-bottom: 14px;
	}
	.text :global(a) {
		color: var(--title);
		text-underline-offset: 3px;
	}
	.figs {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 26px;
	}
	.figs img {
		width: 100%;
		height: auto;
		background: #fff;
		border-radius: 8px;
	}
	@media (max-width: 600px) {
		.panel {
			width: 100vw;
			max-width: 100vw;
			max-height: 100svh;
			height: 100svh;
			border-radius: 0;
			padding: calc(28px + env(safe-area-inset-top, 0px)) 20px
				calc(32px + env(safe-area-inset-bottom, 0px));
		}
		.tiles {
			grid-template-columns: 1fr 1fr;
			gap: 12px;
		}
	}
</style>
