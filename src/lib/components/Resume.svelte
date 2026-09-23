<script lang="ts">
	import { resume } from '$lib/data/content';
	import type { ResumeEntry } from '$lib/data/types';
	import { tick } from 'svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	let section: HTMLElement;
	let openPost = $state<Record<string, boolean>>({});

	// Both disclosures — the section, and each post in it — are one trick: a
	// grid row taken from 0fr to 1fr. The browser interpolates the content's
	// own height, so nothing is measured in script and the closed section
	// costs the document nothing. Shut, it is inert: out of the tab order and
	// unread, while still laid out, which is what lets it animate at all.
	// Shut from its own corner, or with Escape while reading in it: focus
	// goes back to the button that opened it, and a reader who had gone down
	// into it is brought back up to that button rather than left somewhere
	// further down a page that has just closed up under them.
	function close() {
		open = false;
		const toggle = document.querySelector<HTMLElement>('.cv-toggle');
		toggle?.focus({ preventScroll: true });
		if (section.getBoundingClientRect().top < 0)
			toggle?.scrollIntoView({
				block: 'center',
				behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
			});
	}
	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape' && section.contains(document.activeElement)) close();
	}

	$effect(() => {
		if (open)
			tick().then(() => {
				const top = section.getBoundingClientRect().top;
				if (top > innerHeight * 0.6)
					window.scrollBy({ top: top - innerHeight * 0.18, behavior: 'smooth' });
			});
	});
</script>

{#snippet list(items: ResumeEntry[], base: number)}
	<ol class="posts">
		{#each items as it, i (it.org + it.when)}
			{@const key = it.id ?? it.org}
			<li class="post" style="--d:{base + i * 46}ms">
				{#if it.body}
					<button
						class="post-head"
						type="button"
						aria-expanded={!!openPost[key]}
						aria-controls="cv-{key}"
						onclick={() => (openPost[key] = !openPost[key])}
					>
						<span class="top"
							><span class="org">{it.org}</span><span class="when">{it.when}</span><svg
								class="caret"
								aria-hidden="true"><use href="#icon-caret" /></svg
							></span
						>
						{#each it.roles as r (r)}<span class="role">{r}</span>{/each}
					</button>
					<div class="post-body" class:open={openPost[key]} id="cv-{key}" inert={!openPost[key]}>
						<div>{@html it.body}</div>
					</div>
				{:else}
					<div class="post-head plain">
						<span class="top"
							><span class="org">{it.org}</span><span class="when">{it.when}</span></span
						>
						{#each it.roles as r (r)}<span class="role">{r}</span>{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ol>
{/snippet}

<svelte:window onkeydown={onKey} />

<section id="cv" class="cv" class:open aria-label="Résumé" bind:this={section} inert={!open}>
	<div class="clip">
		<div class="wrap inner">
			<!-- a sheet of glass, since the island may still be passing behind it -->
			<div class="sheet glass">
				<button
					class="close pill glass"
					type="button"
					aria-label="Close the résumé"
					title="Close"
					onclick={close}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg
					>
				</button>
				<div class="tools">
					<a class="pill glass" href={resume.pdf} download="Neo-Mohsenvand-Resume.pdf">
						<svg aria-hidden="true"><use href="#icon-download" /></svg>
						Download résumé PDF
					</a>
				</div>
				<div class="grid">
					<div class="col">
						<h2 class="head">
							<svg aria-hidden="true"><use href="#icon-cv-work" /></svg>Experience
						</h2>
						{@render list(resume.experience, 60)}
						<h2 class="head">
							<svg aria-hidden="true"><use href="#icon-cv-school" /></svg>Education
						</h2>
						{@render list(resume.education, 200)}
						<h2 class="head">
							<svg aria-hidden="true"><use href="#icon-cv-honour" /></svg>Honours
						</h2>
						<ul class="awards">
							{#each resume.honours as h (h.html)}
								<li><span>{@html h.html}</span><time>{h.year}</time></li>
							{/each}
						</ul>
					</div>
					<div class="col">
						<h2 class="head"><svg aria-hidden="true"><use href="#icon-cv-skill" /></svg>Skills</h2>
						<dl class="skills">
							{#each resume.skills as s (s.label)}
								<div>
									<dt><svg aria-hidden="true"><use href="#{s.icon}" /></svg>{s.label}</dt>
									<dd>{s.text}</dd>
								</div>
							{/each}
						</dl>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.cv {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 700ms var(--ease);
	}
	.cv.open {
		grid-template-rows: 1fr;
	}
	.clip {
		overflow: hidden;
		min-height: 0;
	}
	.inner {
		padding-top: 40px;
		padding-bottom: 56px;
		opacity: 0;
		transform: translateY(-8px);
		/* hidden outright once shut, so its frosted sheet is never drawn */
		visibility: hidden;
		transition:
			opacity 500ms var(--ease),
			transform 700ms var(--ease),
			visibility 0s linear 700ms;
	}
	.open .inner {
		opacity: 1;
		transform: none;
		visibility: visible;
		transition-delay: 120ms, 120ms, 0s;
	}
	.sheet {
		position: relative;
		border-radius: 24px;
		padding: 34px 40px 44px;
		/* denser than a card: this is a page of reading, not a glimpse */
		--pane: var(--sheet);
		-webkit-backdrop-filter: blur(22px) saturate(var(--frost-sat));
		backdrop-filter: blur(22px) saturate(var(--frost-sat));
	}
	.tools {
		margin-bottom: 28px;
	}
	/* a round button in the sheet's top corner, of a piece with the pills */
	.close {
		position: absolute;
		/* on the line of the download button, in from the corner as far */
		top: 34px;
		right: 40px;
		width: 38px;
		padding: 0;
		justify-content: center;
	}
	.close svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}
	.grid {
		display: grid;
		grid-template-columns: 1.25fr 1fr;
		gap: 56px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		font-family: var(--serif);
		font-weight: 400;
		font-size: 24px;
		color: var(--title);
		margin: 0 0 16px;
	}
	.head:not(:first-child) {
		margin-top: 40px;
	}
	.head svg {
		width: 28px;
		height: 28px;
		flex: none;
	}
	/* a hairline down each list, with a bud at every post */
	.posts {
		list-style: none;
		border-left: 1px solid var(--hair);
		margin-left: 13px;
	}
	.post {
		position: relative;
		padding: 0 0 4px 22px;
	}
	.post::before {
		content: '';
		position: absolute;
		left: -3.5px;
		top: 15px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--muted);
	}
	.post-head {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: 0;
		padding: 8px 0;
		cursor: pointer;
	}
	.post-head.plain {
		cursor: default;
	}
	.top {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.org {
		font-size: 16px;
		font-weight: 610;
		color: var(--title);
	}
	.when {
		font-size: 13px;
		color: var(--muted);
		font-feature-settings: 'tnum';
	}
	.caret {
		width: 9px;
		height: 9px;
		align-self: center;
		color: var(--muted);
		transition: transform 300ms var(--ease);
	}
	[aria-expanded='true'] .caret {
		transform: rotate(180deg);
	}
	.role {
		display: block;
		font-size: 14px;
		color: var(--muted);
	}
	.post-body {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 420ms var(--ease);
	}
	.post-body.open {
		grid-template-rows: 1fr;
	}
	.post-body > div {
		overflow: hidden;
		min-height: 0;
		font-size: 14px;
		line-height: 1.62;
		color: var(--text);
	}
	.post-body :global(h3) {
		font-size: 14px;
		font-weight: 610;
		color: var(--title);
		margin: 10px 0 4px;
	}
	.post-body :global(h3) :global(.when) {
		display: block;
		font-weight: 410;
		font-size: 12.5px;
		color: var(--muted);
	}
	.post-body :global(ul) {
		padding: 0 0 10px 18px;
	}
	.post-body :global(li) {
		margin: 4px 0;
	}
	.post-body :global(a) {
		text-underline-offset: 3px;
		text-decoration-color: var(--hair);
	}
	.awards {
		list-style: none;
	}
	.awards li {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 8px 0;
		border-bottom: 1px solid var(--hair);
		font-size: 14px;
		color: var(--text);
	}
	.awards time {
		color: var(--muted);
		font-feature-settings: 'tnum';
	}
	.skills > div {
		padding: 10px 0;
		border-bottom: 1px solid var(--hair);
	}
	.skills dt {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 14px;
		font-weight: 610;
		color: var(--title);
	}
	.skills dt svg {
		width: 15px;
		height: 15px;
		color: var(--muted);
	}
	.skills dd {
		font-size: 14px;
		color: var(--muted);
		padding-left: 24px;
	}
	@media (max-width: 760px) {
		.grid {
			grid-template-columns: 1fr;
			gap: 8px;
		}
		.sheet {
			border-radius: 18px;
			padding: 22px 18px 28px;
		}
		.close {
			top: 22px;
			right: 18px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cv,
		.post-body,
		.inner {
			transition: none;
		}
	}
</style>
