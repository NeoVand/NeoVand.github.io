<script lang="ts">
	import { links } from '$lib/data/content';
</script>

<nav class="profile-nav" aria-label="Elsewhere">
	{#each links as link (link.href)}
		<a class="profile-link" href={link.href} target="_blank" rel="noopener" aria-label={link.label}>
			<svg aria-hidden="true">
				<use href="#{link.icon === 'icon-github' ? 'icon-github-cat' : link.icon}" />
			</svg>
			<span class="label" aria-hidden="true">{link.label}</span>
			<span class="tooltip" aria-hidden="true">{link.label}</span>
		</a>
	{/each}
</nav>

<style>
	.profile-nav {
		--nav-text: #f5f4ef;
		--nav-hover: #fff;
		--nav-focus: #fff;
		position: absolute;
		top: max(14px, env(safe-area-inset-top, 0px));
		left: calc(var(--gutter) - 6px);
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 10px;
		width: max-content;
		max-width: calc(100% - var(--gutter) - 90px);
		transition: opacity 900ms var(--ease);
	}
	/* A little depth in the sky keeps the open links readable in daylight.
	   It fades before the scene, and does not become a surface under each link. */
	.profile-nav::before {
		content: '';
		position: absolute;
		top: calc(-1 * max(14px, env(safe-area-inset-top, 0px)));
		left: calc(6px - var(--gutter));
		z-index: -1;
		width: 100vw;
		height: 128px;
		background: linear-gradient(
			to bottom,
			rgb(5 20 38 / 28%),
			rgb(5 20 38 / 22%) 44px,
			rgb(5 20 38 / 8%) 82px,
			transparent
		);
		opacity: 0.2;
		pointer-events: none;
		transition: opacity var(--theme-t);
	}
	:global(html.day) .profile-nav::before {
		opacity: 1;
	}
	.profile-link {
		position: relative;
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-width: 44px;
		min-height: 44px;
		padding: 0 10px;
		border-radius: 10px;
		color: var(--nav-text);
		font-size: 13px;
		font-weight: 480;
		line-height: 1;
		text-decoration: none;
		white-space: nowrap;
		transition: color 180ms var(--ease);
	}
	.profile-link svg {
		flex: none;
		width: 21px;
		height: 21px;
	}
	.profile-nav .profile-link svg {
		color: var(--nav-text);
		transform-origin: center;
		transition:
			transform 200ms var(--ease-out),
			color 180ms var(--ease);
	}
	.profile-nav .profile-link:focus-visible svg {
		color: var(--nav-hover);
		transform: translateY(-2px) scale(1.12);
	}
	@media (hover: hover) and (pointer: fine) {
		.profile-nav .profile-link:hover svg {
			color: var(--nav-hover);
			transform: translateY(-2px) scale(1.12);
		}
	}
	.profile-link:hover,
	.profile-link:focus-visible {
		color: var(--nav-hover);
	}
	.profile-nav .profile-link:hover .label,
	.profile-nav .profile-link:focus-visible .label {
		text-decoration: underline;
		text-underline-offset: 5px;
		text-decoration-thickness: 1px;
	}
	.profile-link:focus-visible {
		outline: 2px solid var(--nav-focus);
		outline-offset: 2px;
	}
	.tooltip {
		display: none;
		position: absolute;
		top: calc(100% + 10px);
		left: 50%;
		z-index: 1;
		padding: 9px 11px;
		border: 1px solid var(--hair);
		border-radius: 8px;
		background: var(--sheet);
		box-shadow: 0 3px 12px var(--cast);
		color: var(--title);
		font-size: 12px;
		font-weight: 450;
		line-height: 1.3;
		opacity: 0;
		transform: translateX(-50%);
		pointer-events: none;
		transition: opacity 150ms var(--ease);
	}
	.profile-link:first-child .tooltip {
		left: 0;
		transform: none;
	}
	.profile-link:hover .tooltip,
	.profile-link:focus-visible .tooltip {
		opacity: 1;
	}
	:global(html.veiled) .profile-nav {
		opacity: 0;
	}
	@media (max-width: 640px) {
		.profile-nav {
			gap: 4px;
		}
		.profile-link {
			width: 44px;
			padding: 0;
		}
		.label {
			display: none;
		}
		.tooltip {
			display: block;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.profile-nav,
		.profile-nav::before,
		.profile-link,
		.profile-nav .profile-link svg,
		.tooltip {
			transition: none;
		}
		.profile-nav .profile-link:hover svg,
		.profile-nav .profile-link:focus-visible svg {
			transform: none;
		}
	}
</style>
