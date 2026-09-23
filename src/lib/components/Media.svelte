<script lang="ts">
	import { media } from '$lib/data/content';
</script>

<section class="section" id="media" aria-labelledby="media-title">
	<div class="wrap">
		<div class="section-head">
			<h2 class="section-title" id="media-title">Media</h2>
		</div>
		<div class="tiles">
			{#each media as m (m.href)}
				<a
					class="tile glass card-ring"
					href={m.href}
					target="_blank"
					rel="noopener"
					title={m.title}
				>
					<div class="thumb">
						<img src={m.img} alt="" loading="lazy" decoding="async" />
						{#if m.video}
							<span class="play" aria-hidden="true"
								><svg viewBox="0 0 12 12"><path d="M3 1.8v8.4L10 6z" /></svg></span
							>
						{/if}
					</div>
					<div class="body">
						<span class="src">{m.source}</span>
						<span class="t">{m.short}</span>
					</div>
				</a>
			{/each}
		</div>
	</div>
</section>

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 16px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		border-radius: 14px;
		overflow: hidden;
		text-decoration: none;
	}
	.thumb {
		position: relative;
		aspect-ratio: 2 / 1;
		overflow: hidden;
		background: var(--pane);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.play {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 34px;
		height: 34px;
		margin: -17px 0 0 -17px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: rgba(10, 14, 18, 0.72);
		border: 1px solid rgba(255, 255, 255, 0.4);
	}
	.play svg {
		width: 12px;
		height: 12px;
		margin-left: 2px;
		fill: #fff;
	}
	.body {
		padding: 10px 12px 12px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.src {
		font-size: 12px;
		color: var(--muted);
		font-feature-settings: 'tnum';
	}
	.t {
		font-size: 13.5px;
		line-height: 1.35;
		font-weight: calc(550 + var(--wn));
		color: var(--title);
	}
	@media (max-width: 700px) {
		.tiles {
			grid-template-columns: 1fr 1fr;
			gap: 12px;
		}
	}
</style>
