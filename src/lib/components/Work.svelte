<script lang="ts">
	import { projectSections, projects } from '$lib/data/content';
	import type { Project } from '$lib/data/types';

	let query = $state('');
	let searchInput: HTMLInputElement | undefined;

	function normalize(value: string) {
		return value
			.replace(/<[^>]*>/g, ' ')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
	}

	function highlightSegments(description: string, highlights: readonly string[] = []) {
		const ranges: { start: number; end: number }[] = [];
		for (const highlight of highlights) {
			if (!highlight) continue;
			let start = description.indexOf(highlight);
			while (start !== -1) {
				ranges.push({ start, end: start + highlight.length });
				start = description.indexOf(highlight, start + highlight.length);
			}
		}
		ranges.sort((a, b) => a.start - b.start || b.end - a.end);
		const merged: typeof ranges = [];
		for (const range of ranges) {
			const previous = merged.at(-1);
			if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
			else merged.push({ ...range });
		}
		const segments: { start: number; text: string; emphasis: boolean }[] = [];
		let cursor = 0;
		for (const range of merged) {
			if (range.start > cursor) {
				segments.push({
					start: cursor,
					text: description.slice(cursor, range.start),
					emphasis: false
				});
			}
			segments.push({
				start: range.start,
				text: description.slice(range.start, range.end),
				emphasis: true
			});
			cursor = range.end;
		}
		if (cursor < description.length) {
			segments.push({ start: cursor, text: description.slice(cursor), emphasis: false });
		}
		return segments;
	}

	function resourceType(label: string) {
		if (/\b(paper|manuscript)\b/i.test(label)) return 'paper';
		if (/\bmodels?\b/i.test(label)) return 'model';
		return null;
	}

	const catalog = projectSections.map((section) => ({
		...section,
		projects: projects
			.filter((project) => project.section === section.id)
			.map((project) => ({
				...project,
				descriptionSegments: highlightSegments(project.desc, project.highlights),
				searchText: normalize(
					`${project.title} ${project.desc} ${project.tags.join(' ')} ${section.title} ${section.description} ${project.repo ?? ''} ${project.href}`
				)
			}))
	}));
	const terms = $derived(normalize(query).split(' ').filter(Boolean));
	const groups = $derived(
		catalog
			.map((section) => ({
				...section,
				projects: section.projects.filter((project) =>
					terms.every((term) => project.searchText.includes(term))
				)
			}))
			.filter((section) => section.projects.length > 0)
	);
	const resultCount = $derived(
		groups.reduce((count, section) => count + section.projects.length, 0)
	);

	function projectAction(project: Project) {
		if (project.href === project.repo) return 'View on GitHub';
		if (project.href.startsWith('https://chromewebstore.google.com/')) return 'View extension';
		return 'Explore project';
	}

	function clearSearch() {
		query = '';
		searchInput?.focus();
	}

	// Share observers across the directory. Clips only load near the viewport
	// and play in sight; reduced-motion and data-saving readers see the stills.
	let near: IntersectionObserver | undefined, sight: IntersectionObserver | undefined;
	const sources = new WeakMap<Element, string>();
	function load(video: HTMLVideoElement) {
		if (video.src) return;
		const source = sources.get(video);
		if (!source) return;
		video.preload = 'auto';
		video.src = source;
	}

	function clip(project: Project) {
		return (node: HTMLVideoElement) => {
			const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
				.connection;
			if (
				!project.video ||
				matchMedia('(prefers-reduced-motion: reduce)').matches ||
				connection?.saveData
			)
				return;
			sources.set(node, project.video);
			near ??= new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (!entry.isIntersecting) continue;
						load(entry.target as HTMLVideoElement);
						near!.unobserve(entry.target);
					}
				},
				{ rootMargin: '60% 0px' }
			);
			sight ??= new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						const video = entry.target as HTMLVideoElement;
						if (entry.isIntersecting) {
							load(video);
							video.play().catch(() => {});
						} else video.pause();
					}
				},
				{ threshold: 0.5 }
			);
			const showPoster = () => {
				// Removing a failed source restores the native poster, including
				// its intrinsic proportions, without an overlapping image layer.
				sources.delete(node);
				node.removeAttribute('src');
				node.preload = 'none';
				node.load();
			};
			node.addEventListener('error', showPoster);
			near.observe(node);
			sight.observe(node);
			return () => {
				node.removeEventListener('error', showPoster);
				near?.unobserve(node);
				sight?.unobserve(node);
				node.pause();
			};
		};
	}
</script>

<section class="section work" id="work" aria-labelledby="work-title">
	<div class="wrap">
		<div class="directory-head">
			<div>
				<h2 class="section-title" id="work-title">Projects</h2>
				<p class="directory-intro">Research, tools, and things to learn by exploring.</p>
			</div>
			<div class="search-area">
				<div class="search-field glass" role="search">
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<circle cx="10.5" cy="10.5" r="6.5" />
						<path d="m16 16 4.5 4.5" />
					</svg>
					<input
						{@attach (node) => {
							searchInput = node;
							return () => {
								searchInput = undefined;
							};
						}}
						bind:value={query}
						type="search"
						aria-label="Search projects"
						placeholder="Search projects or ideas"
						autocomplete="off"
						spellcheck="false"
						onkeydown={(event) => {
							if (event.key === 'Escape') clearSearch();
						}}
					/>
					{#if query}
						<button
							class="clear-search"
							type="button"
							onclick={clearSearch}
							aria-label="Clear search"
						>
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path d="m7 7 10 10M7 17 17 7" />
							</svg>
						</button>
					{/if}
				</div>
				<p class="search-summary" role="status" aria-live="polite" aria-atomic="true">
					{#if terms.length}
						{resultCount} {resultCount === 1 ? 'project' : 'projects'} found
					{:else}
						{projects.length} projects across {projectSections.length} fields
					{/if}
				</p>
			</div>
		</div>

		<div class="directory">
			<div class="project-groups">
				{#each groups as group (group.id)}
					<section class="project-group" id={group.id} aria-labelledby="{group.id}-title">
						<header class="group-head">
							<h3 id="{group.id}-title" tabindex="-1">{group.title}</h3>
							<p>{group.description}</p>
						</header>
						<div class="project-list glass">
							{#each group.projects as project (project.href)}
								<article class="project-row">
									<a
										class="thumb"
										href={project.href}
										target="_blank"
										rel="noopener"
										tabindex="-1"
										aria-hidden="true"
										style:background={project.ground ?? 'var(--pane-2)'}
									>
										{#if project.video}
											<video
												muted
												loop
												playsinline
												preload="none"
												poster={project.img ?? undefined}
												{@attach clip(project)}
												aria-hidden="true"
											></video>
										{:else if project.img}
											<img src={project.img} alt="" loading="lazy" decoding="async" />
										{:else}
											<svg
												class="project-placeholder"
												viewBox="0 0 120 80"
												fill="none"
												aria-hidden="true"
											>
												<path d="M21 29h78M21 40h78M21 51h78" />
												<path d="M48 49V20l31-6v29M48 27l31-6" />
												<ellipse cx="42" cy="51" rx="6" ry="4" /><ellipse
													cx="73"
													cy="45"
													rx="6"
													ry="4"
												/>
											</svg>
										{/if}
									</a>
									<div class="project-copy">
										<div class="project-heading">
											<h4>
												<a href={project.href} target="_blank" rel="noopener">{project.title}</a>
											</h4>
											{#if project.status}<span class="project-status">{project.status}</span>{/if}
										</div>
										<div class="project-details">
											<p class="project-description">
												{#each project.descriptionSegments as segment (segment.start)}{#if segment.emphasis}<strong
															>{segment.text}</strong
														>{:else}{segment.text}{/if}{/each}
											</p>
											<div class="project-links">
												<a
													class="primary-link"
													href={project.href}
													target="_blank"
													rel="noopener"
													aria-label="{projectAction(project)}: {project.title}"
												>
													{projectAction(project)}
												</a>
												{#if project.repo && project.repo !== project.href}
													<a
														href={project.repo}
														target="_blank"
														rel="noopener"
														aria-label="{project.title} source on GitHub"
													>
														<svg aria-hidden="true"><use href="#icon-github" /></svg>Source
													</a>
												{/if}
												{#each project.links ?? [] as link (link.href)}
													{@const resource = resourceType(link.label)}
													<a
														href={link.href}
														target="_blank"
														rel="noopener"
														aria-label="{project.title} {link.label.toLowerCase()}"
													>
														{#if resource === 'paper'}
															<svg
																class="resource-icon"
																viewBox="0 0 24 24"
																fill="none"
																aria-hidden="true"
																><path
																	d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"
																/><path d="M14 3v6h6M8 13h8M8 17h6" /></svg
															>
														{:else if resource === 'model'}
															<svg
																class="resource-icon"
																viewBox="0 0 24 24"
																fill="none"
																aria-hidden="true"
																><path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9Z" /><path
																	d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9M7.75 5.25l8.5 4.5"
																/></svg
															>
														{/if}
														{link.label}</a
													>
												{/each}
											</div>
										</div>
									</div>
								</article>
							{/each}
						</div>
					</section>
				{:else}
					<div class="empty-state glass">
						<h3>No projects found</h3>
						<p>Try a project name, a subject like “physics”, or a tool like “JAX”.</p>
						<button type="button" onclick={clearSearch}>Clear search</button>
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>

<style>
	.work {
		padding-top: 40px;
		padding-bottom: 16px;
		scroll-margin-top: 24px;
	}
	.directory-head {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 24px;
		margin-bottom: 24px;
	}
	.directory-intro {
		margin-top: 8px;
		max-width: 36em;
		font-size: 15px;
		line-height: 1.6;
		color: var(--muted);
	}
	.search-area {
		width: 320px;
		flex: none;
	}
	.search-field {
		display: flex;
		align-items: center;
		height: 48px;
		gap: 10px;
		padding-left: 15px;
		border-radius: 12px;
	}
	.search-field:focus-within {
		outline: 2px solid var(--focus);
		outline-offset: 3px;
	}
	.search-field svg {
		width: 18px;
		height: 18px;
		flex: none;
		stroke: currentColor;
		stroke-width: 1.65;
		color: var(--muted);
	}
	.search-field input {
		width: 100%;
		min-width: 0;
		height: 100%;
		padding-right: 12px;
		background: transparent;
		color: var(--title);
		border: 0;
		font: inherit;
		font-size: 14px;
		outline: none;
	}
	.search-field input::placeholder {
		color: var(--muted);
		opacity: 1;
	}
	.search-field input::-webkit-search-cancel-button {
		display: none;
	}
	.clear-search {
		display: grid;
		place-items: center;
		flex: none;
		width: 42px;
		height: 42px;
		margin-left: -10px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		cursor: pointer;
	}
	.clear-search:hover {
		background: var(--pane-2);
	}
	.search-summary {
		margin-top: 7px;
		padding-left: 1px;
		font-size: 12px;
		color: var(--muted);
	}
	.project-groups {
		min-width: 0;
	}
	.project-group {
		scroll-margin-top: 32px;
	}
	.project-group + .project-group {
		margin-top: 30px;
	}
	.group-head {
		margin-bottom: 12px;
	}
	.group-head h3 {
		width: fit-content;
		color: var(--title);
		font: 400 clamp(22px, 2.2vw, 28px) / 1.3 var(--serif);
		letter-spacing: -0.015em;
		scroll-margin-top: 24px;
	}
	.group-head p {
		margin-top: 5px;
		max-width: 80ch;
		color: var(--muted);
		font-size: 14px;
		line-height: 1.5;
	}
	.project-list {
		border-radius: 16px;
		padding-inline: 24px;
	}
	.project-row {
		display: grid;
		grid-template-columns: 320px minmax(0, 1fr);
		grid-template-rows: auto auto;
		align-items: start;
		gap: 5px 20px;
		padding-block: 14px;
	}
	.project-row + .project-row {
		border-top: 1px solid var(--hair);
	}
	.thumb {
		grid-column: 1;
		grid-row: 2;
		display: block;
		position: relative;
		align-self: start;
		overflow: hidden;
		border-radius: 8px;
		background: var(--pane-2);
		box-shadow: inset 0 0 0 1px var(--hair);
	}
	.thumb img,
	.thumb video {
		width: 100%;
		height: auto;
	}
	.project-placeholder {
		width: 100%;
		height: auto;
		padding: 12px;
		color: var(--muted);
		stroke: currentColor;
		stroke-width: 1.5;
	}
	.project-placeholder path:first-child {
		opacity: 0.3;
	}
	.project-placeholder ellipse {
		fill: currentColor;
	}
	.project-copy {
		display: contents;
	}
	.project-details {
		grid-column: 2;
		grid-row: 2;
		min-width: 0;
	}
	.project-heading {
		grid-column: 2;
		grid-row: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		column-gap: 12px;
		row-gap: 5px;
	}
	.project-heading h4 {
		font-size: 18px;
		font-weight: 590;
		line-height: 1.35;
		letter-spacing: -0.015em;
		color: var(--title);
	}
	.project-heading h4 a {
		text-decoration: none;
		text-underline-offset: 4px;
		text-decoration-thickness: 1px;
	}
	.project-heading h4 a:hover {
		text-decoration: underline;
	}
	.project-status {
		font-size: 11px;
		color: var(--muted);
		white-space: nowrap;
	}
	.project-description {
		max-width: 80ch;
		margin-top: 0;
		color: var(--text);
		font-size: 14px;
		line-height: 1.5;
		text-wrap: pretty;
	}
	.project-description strong {
		color: var(--title);
		font-weight: 650;
	}
	.project-links {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		column-gap: 16px;
		margin-top: 5px;
	}
	.project-links a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 30px;
		font-size: 12px;
		font-weight: 480;
		color: var(--muted);
		text-decoration: none;
		text-underline-offset: 3px;
	}
	.project-links .primary-link {
		color: var(--title);
	}
	.project-links a:hover {
		color: var(--title);
		text-decoration: underline;
	}
	.project-links svg {
		width: 13px;
		height: 13px;
		flex: none;
	}
	.project-links .resource-icon {
		width: 14px;
		height: 14px;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.empty-state {
		padding: 36px;
		border-radius: 16px;
	}
	.empty-state h3 {
		font-family: var(--serif);
		font-weight: 400;
		font-size: 24px;
		color: var(--title);
	}
	.empty-state p {
		margin-top: 12px;
		max-width: 38em;
		color: var(--muted);
		font-size: 14px;
	}
	.empty-state button {
		margin-top: 20px;
		padding: 9px 14px;
		border: 1px solid var(--hair);
		border-radius: 8px;
		background: var(--pane-2);
		cursor: pointer;
		font-size: 13px;
	}
	@media (max-width: 1050px) {
		.project-row {
			grid-template-columns: 260px minmax(0, 1fr);
		}
		.project-list {
			padding-inline: 20px;
		}
	}
	@media (max-width: 800px) {
		.directory-head {
			gap: 20px;
			margin-bottom: 20px;
		}
		.directory-intro {
			font-size: 14px;
			max-width: 26em;
		}
		.search-area {
			width: 270px;
		}
		.project-row {
			grid-template-columns: 230px minmax(0, 1fr);
		}
	}
	@media (max-width: 560px) {
		.directory-head {
			flex-direction: column;
			gap: 16px;
			margin-bottom: 20px;
		}
		.directory-intro {
			max-width: none;
			margin-top: 6px;
		}
		.search-area {
			width: 100%;
		}
		.search-field input {
			font-size: 16px;
		}
		.search-summary {
			font-size: 11px;
		}
		.group-head {
			margin-bottom: 10px;
		}
		.group-head h3 {
			font-size: 22px;
		}
		.group-head p {
			font-size: 13px;
			margin-top: 5px;
		}
		.project-group + .project-group {
			margin-top: 26px;
		}
		.project-list {
			border-radius: 12px;
			padding-inline: 15px;
		}
		.project-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 10px;
			padding-block: 14px;
		}
		.thumb {
			grid-column: auto;
			grid-row: auto;
		}
		.project-copy {
			display: block;
			min-width: 0;
		}
		.project-heading h4 {
			line-height: 1.3;
		}
		.project-description {
			line-height: 1.55;
			margin-top: 5px;
		}
		.project-links {
			gap: 4px 16px;
			margin-top: 4px;
		}
		.project-links a {
			min-height: 34px;
			font-size: 12px;
		}
		.empty-state {
			padding: 26px;
		}
	}
	@media (max-width: 370px) {
		.project-list {
			padding-inline: 12px;
		}
	}
</style>
