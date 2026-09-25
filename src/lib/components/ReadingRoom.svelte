<script lang="ts">
	import { tick } from 'svelte';
	import type { Paper } from '$lib/data/types';
	import { stage } from '$lib/stage.svelte';

	// ─── The reading room: a paper opens into all its pages ─────────────────
	// Clicking a deck does not leave the page. The five pages of the fan fly
	// out of the deck and lay themselves down as the first five of a row that
	// holds every page of the paper, with the abstract set above; the rest of
	// the pages follow them in. Closing sends the five back into the fan.
	// Carried over from the flat grove, flight and all.

	const FAN = 5;
	const NEO = /Mostafa (‘|')?Neo(’|')? Mohsenvand|Mostafa Mohsenvand/;

	let paper = $state.raw<Paper | null>(null);
	let hidden = $state(true);
	let isIn = $state(false);
	let absOpen = $state(false);
	let moreShown = $state(false);
	let headCut = $state(false);

	let room: HTMLDivElement;
	let head = $state<HTMLDivElement>() as unknown as HTMLDivElement;
	let abstractEl = $state<HTMLParagraphElement>() as unknown as HTMLParagraphElement;
	let stream = $state<HTMLDivElement>() as unknown as HTMLDivElement;
	let pagesEl = $state<HTMLDivElement>() as unknown as HTMLDivElement;
	let flyLayer: HTMLDivElement;
	let closeBtn: HTMLButtonElement;
	// the islet's canvas, over the glass in the room the words leave free
	let isletCv: HTMLCanvasElement;
	let islet = $state(false);

	let deck: HTMLElement | null = null;
	let flying = false;
	let holding: (() => void) | null = null;
	const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

	const authors = $derived(
		paper
			? paper.authors
					.split(', ')
					.map((a) => (NEO.test(a) ? `<strong>${a}</strong>` : a))
					.join(', ')
			: ''
	);

	function decoded(img: HTMLImageElement) {
		if (img.decode) return img.decode().catch(() => {});
		return new Promise<void>((r) => {
			if (img.complete) return r();
			img.addEventListener('load', () => r(), { once: true });
			img.addEventListener('error', () => r(), { once: true });
		});
	}

	// Pages load only as they come into the stream's view: a paper can be
	// thirty-six pages, and most visits look at three.
	let lazy: IntersectionObserver | null = null;
	function lazyPage(img: HTMLImageElement, i: number) {
		const src = `/media/papers/pages/${paper!.slug}-${i}.jpg`;
		if (i <= FAN + 2) {
			img.src = src;
			if (i > FAN) decoded(img).then(() => img.parentElement?.classList.add('ready'));
			return;
		}
		lazy ??= new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (!e.isIntersecting) continue;
					const im = e.target as HTMLImageElement;
					if (im.dataset.src) {
						im.src = im.dataset.src;
						delete im.dataset.src;
						decoded(im).then(() => im.parentElement?.classList.add('ready'));
					}
					lazy!.unobserve(im);
				}
			},
			{ root: stream, rootMargin: '0px 600px 0px 600px' }
		);
		img.dataset.src = src;
		lazy.observe(img);
		return { destroy: () => lazy?.unobserve(img) };
	}

	// Where each of the fan's pages sits on screen: centre, size and angle,
	// read back from the transform so a deck caught mid-hover flies from
	// where it actually is.
	function fanRects(d: HTMLElement) {
		const pages = [...d.querySelectorAll<HTMLImageElement>('.page')].sort(
			(a, b) => +a.style.getPropertyValue('--i') - +b.style.getPropertyValue('--i')
		);
		return pages.map((img) => {
			const r = img.getBoundingClientRect();
			const m = new DOMMatrixReadOnly(getComputedStyle(img).transform);
			return {
				el: img,
				cx: r.left + r.width / 2,
				cy: r.top + r.height / 2,
				w: img.offsetWidth,
				a: Math.atan2(m.b, m.a)
			};
		});
	}

	// A double of a fan page: a canvas painted from the page's own image, so
	// it needs nothing from the network and is whole the instant it is made.
	function makeDouble(src: HTMLImageElement, w: number, h: number) {
		if (src.complete && src.naturalWidth) {
			const c = document.createElement('canvas');
			const dpr = Math.min(2, devicePixelRatio || 1);
			c.width = Math.round(w * dpr);
			c.height = Math.round(h * dpr);
			const g = c.getContext('2d')!;
			const s = Math.max(c.width / src.naturalWidth, c.height / src.naturalHeight);
			const dw = src.naturalWidth * s,
				dh = src.naturalHeight * s;
			g.drawImage(src, (c.width - dw) / 2, 0, dw, dh);
			return c;
		}
		const d = document.createElement('img');
		d.src = src.currentSrc || src.src;
		d.alt = '';
		return d;
	}

	function endHold() {
		const h = holding;
		holding = null;
		h?.();
	}

	// The flight is made by doubles in a layer over the whole room, because
	// the stream clips whatever leaves its box and the deck is well outside
	// it. The real pages are shown or hidden underneath as the doubles arrive.
	function fly(d: HTMLElement, toRoom: boolean, done?: () => void) {
		endHold();
		const fan = fanRects(d);
		const imgs = [...pagesEl.querySelectorAll<HTMLImageElement>('.rpage img')].slice(0, FAN);
		const fanPages = [...d.querySelectorAll<HTMLImageElement>('.page')];
		flyLayer.innerHTML = '';
		const doubles: HTMLElement[] = [];
		for (let i = Math.min(FAN, imgs.length) - 1; i >= 0; i--) {
			const img = imgs[i],
				f = fan[i];
			if (!f) continue;
			const r = img.getBoundingClientRect();
			const dbl = makeDouble(f.el, r.width, r.height);
			dbl.className = 'dbl';
			Object.assign(dbl.style, {
				left: r.left + 'px',
				top: r.top + 'px',
				width: r.width + 'px',
				height: r.height + 'px'
			});
			const sc = Math.max(0.05, f.w / r.width);
			// a slight lift out of the page on the way, so the flight has depth
			const pose = `translate(${(f.cx - (r.left + r.width / 2)).toFixed(1)}px, ${(f.cy - (r.top + r.height / 2)).toFixed(1)}px) rotate(${f.a.toFixed(4)}rad) scale(${sc.toFixed(4)})`;
			const cs = getComputedStyle(f.el);
			// the deck page's radius and shadows, divided by the scale so they
			// come out the deck's true size once scaled
			const look = cs.filter.replace(
				/drop-shadow\(([^()]*(?:\([^()]*\))?[^()]*)\)/g,
				(_m, inner: string) =>
					'drop-shadow(' +
					inner.replace(/(-?\d*\.?\d+)px/g, (_mm, v) => (parseFloat(v) / sc).toFixed(2) + 'px') +
					')'
			);
			const deckR = (parseFloat(cs.borderTopLeftRadius) || 8) / sc + 'px';
			dbl.style.transitionDelay = `${(toRoom ? i : FAN - 1 - i) * 36}ms`;
			dbl.style.transform = toRoom ? pose : 'none';
			dbl.style.filter = toRoom ? look : 'none';
			dbl.style.borderRadius = toRoom ? deckR : '4px';
			dbl.classList.toggle('paper', !toRoom);
			dbl.dataset.pose = pose;
			dbl.dataset.look = look;
			dbl.dataset.deckR = deckR;
			flyLayer.appendChild(dbl);
			doubles.push(dbl);
		}
		imgs.forEach((im) => (im.style.visibility = 'hidden'));
		fanPages.forEach((p) => (p.style.visibility = 'hidden'));
		flyLayer.getBoundingClientRect();
		for (const dbl of doubles) {
			dbl.style.transform = toRoom ? 'none' : dbl.dataset.pose!;
			dbl.style.filter = toRoom ? 'none' : dbl.dataset.look!;
			dbl.style.borderRadius = toRoom ? '4px' : dbl.dataset.deckR!;
			dbl.classList.toggle('paper', toRoom);
		}
		// the pages underneath must be decoded before the doubles leave, or
		// the swap paints a frame of blank paper where the image has not landed
		const under = toRoom ? imgs : fanPages;
		const ready = Promise.all(under.map(decoded));
		const patient = new Promise((r) => setTimeout(r, toRoom ? 8000 : 1500));
		setTimeout(
			() => {
				if (!toRoom) {
					Promise.race([ready, patient]).then(() =>
						requestAnimationFrame(() => {
							under.forEach((im) => (im.style.visibility = ''));
							flyLayer.innerHTML = '';
							done?.();
						})
					);
					return;
				}
				done?.();
				let held = true;
				const swap = () => {
					if (!held) return;
					held = false;
					holding = null;
					under.forEach((im) => (im.style.visibility = ''));
					for (const dbl of doubles) {
						dbl.style.transition = 'opacity 180ms linear';
						dbl.classList.remove('paper');
						dbl.style.opacity = '0';
					}
					setTimeout(() => {
						if (doubles[0]?.parentNode === flyLayer) flyLayer.innerHTML = '';
					}, 200);
				};
				holding = swap;
				Promise.race([ready, patient]).then(() => requestAnimationFrame(swap));
			},
			680 + FAN * 36 + 40
		);
	}

	// On a wide screen, with a mouse, the room over the words, beside the
	// title, is the islet's: it floats there over the glass, and its fall goes
	// on down behind the pages.
	function frameIslet() {
		const g = stage.grove;
		const h = head?.getBoundingClientRect(),
			s = stream?.getBoundingClientRect();
		const x = h ? Math.round(h.right) : 0;
		const w = innerWidth - x;
		const frameH = s ? Math.round(s.top + 12) : 0;
		if (!g || !h || !s || !matchMedia('(pointer: fine)').matches || w < 380 || frameH < 300) {
			if (islet) g?.read(null);
			islet = false;
			return;
		}
		islet = true;
		Object.assign(isletCv.style, { left: x + 'px', width: w + 'px', height: innerHeight + 'px' });
		g.read({ w, h: innerHeight, frameH });
	}

	$effect(() => {
		const g = stage.grove;
		if (!g || !isletCv) return;
		g.setIsletCanvas(isletCv);
		// a tap on the glass round the islet closes the room, as it would anywhere
		g.onIsletMiss = () => close();
	});

	export async function open(p: Paper, d: HTMLElement) {
		if (flying) return;
		deck = d;
		paper = p;
		absOpen = false;
		hidden = false;
		document.documentElement.style.overflow = 'hidden';
		await tick();
		stream.scrollLeft = 0;
		head.scrollTop = 0;
		moreShown = abstractEl.scrollHeight > abstractEl.clientHeight + 2;
		await tick();
		checkCut();
		frameIslet();
		if (!reduced()) {
			flying = true;
			fly(d, true, () => (flying = false));
		}
		requestAnimationFrame(() => (isIn = true));
		room.focus({ preventScroll: true });
	}

	export function close() {
		if (!deck || flying || hidden) return;
		const d = deck;
		isIn = false;
		// the islet goes down into the glass while the pages go home
		if (islet) stage.grove?.read(null);
		const finish = () => {
			// hover stays off this deck until the pointer moves, so the fan
			// does not swing out under a pointer that merely stayed put
			d.classList.add('no-hover');
			const wake = () => {
				d.classList.remove('no-hover');
				removeEventListener('pointermove', wake);
				removeEventListener('keydown', wake);
			};
			addEventListener('pointermove', wake);
			addEventListener('keydown', wake);
			hidden = true;
			document.documentElement.style.overflow = '';
			d.querySelectorAll<HTMLElement>('.page').forEach((p) => (p.style.visibility = ''));
			flying = false;
			islet = false;
			deck = null;
			paper = null;
			lazy?.disconnect();
			lazy = null;
			d.focus({ preventScroll: true });
		};
		if (reduced()) return finish();
		flying = true;
		fly(d, false, finish);
	}

	function checkCut() {
		if (!head) return;
		headCut =
			head.scrollHeight > head.clientHeight + 1 &&
			head.scrollTop + head.clientHeight < head.scrollHeight - 2;
	}

	function toggleAbstract() {
		const on = !absOpen;
		const full = abstractEl.scrollHeight;
		if (on) {
			abstractEl.style.maxHeight = full + 'px';
			absOpen = true;
		} else {
			abstractEl.style.maxHeight = full + 'px';
			abstractEl.getBoundingClientRect();
			absOpen = false;
			abstractEl.style.maxHeight = '';
		}
		setTimeout(checkCut, 360);
	}

	function onKey(e: KeyboardEvent) {
		if (hidden) return;
		if (e.key === 'Escape') return close();
		if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
			const page = pagesEl.firstElementChild as HTMLElement | null;
			if (!page) return;
			const step = page.getBoundingClientRect().width + 22;
			stream.scrollBy({ left: e.key === 'ArrowRight' ? step : -step, behavior: 'smooth' });
			e.preventDefault();
		}
	}

	// the wheel reads along the row
	function onWheel(e: WheelEvent) {
		if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
			stream.scrollLeft += e.deltaY;
			e.preventDefault();
		}
	}
</script>

<svelte:window
	onkeydown={onKey}
	onresize={() => {
		checkCut();
		if (!hidden && isIn) frameIslet();
	}}
/>

<div
	class="room"
	class:in={isIn}
	{hidden}
	role="dialog"
	aria-modal="true"
	aria-labelledby="room-title"
	tabindex="-1"
	bind:this={room}
>
	<div class="backdrop" onclick={close} aria-hidden="true"></div>
	<canvas class="islet" class:on={islet} bind:this={isletCv} aria-hidden="true"></canvas>
	<button class="close glass" type="button" aria-label="Close" onclick={close} bind:this={closeBtn}>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
	</button>
	{#if paper}
		<div class="head" class:cut={headCut} bind:this={head} onscroll={checkCut}>
			<p class="kicker">{paper.venue}</p>
			<h2 class="title" id="room-title">{paper.title}</h2>
			<p class="authors">{@html authors}</p>
			<p
				class="abstract"
				class:open={absOpen}
				bind:this={abstractEl}
				ontransitionend={(e) => {
					if (e.propertyName === 'max-height' && absOpen) abstractEl.style.maxHeight = 'none';
				}}
			>
				{paper.abstract}
			</p>
			{#if moreShown}
				<button class="more" type="button" onclick={toggleAbstract}
					>{absOpen ? 'Show less' : 'Read the whole abstract'}</button
				>
			{/if}
			<div class="actions">
				<a class="pill glass" href={paper.pdf} download>
					<svg aria-hidden="true"><use href="#icon-download" /></svg>
					Download PDF
				</a>
				<span class="count">{paper.pages} page{paper.pages === 1 ? '' : 's'}</span>
			</div>
		</div>
		<!-- a scrolling row of pages: focusable so the keyboard can read along it -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="stream"
			tabindex="0"
			aria-label="Pages of the paper"
			bind:this={stream}
			onwheel={onWheel}
		>
			<div class="pages" bind:this={pagesEl}>
				{#each Array.from({ length: paper.pages }, (_, k) => k + 1) as i (i)}
					<figure
						class="rpage"
						class:late={i > FAN}
						style="--pd:{300 + Math.min(6, i - FAN) * 55}ms"
					>
						<img alt="Page {i}" decoding="async" use:lazyPage={i} />
						<figcaption>{i} / {paper.pages}</figcaption>
					</figure>
				{/each}
			</div>
		</div>
	{/if}
	<div class="fly" aria-hidden="true" bind:this={flyLayer}></div>
</div>

<style>
	.room[hidden] {
		display: none;
	}
	.room {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		flex-direction: column;
		overscroll-behavior: contain;
		padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
			env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
		outline: none;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(4, 6, 10, 0.8);
		-webkit-backdrop-filter: blur(8px);
		backdrop-filter: blur(8px);
		opacity: 0;
		transition: opacity 340ms var(--ease);
	}
	/* by day the glass is the sky's own blue, deeper overhead and paler
	   toward the horizon, not a white sheet laid over it */
	:global(.day) .backdrop {
		background: linear-gradient(rgba(86, 128, 184, 0.72), rgba(142, 174, 212, 0.72));
	}
	.in .backdrop {
		opacity: 1;
	}
	/* the islet's canvas: over the glass, under the words and the pages, and
	   fading out toward the foot of the room, where its fall gives out */
	.islet {
		position: fixed;
		top: 0;
		display: none;
		opacity: 0;
		-webkit-mask-image: linear-gradient(#000 62%, transparent 94%);
		mask-image: linear-gradient(#000 62%, transparent 94%);
	}
	.islet.on {
		display: block;
	}
	.close {
		position: absolute;
		top: calc(18px + env(safe-area-inset-top, 0px));
		right: calc(20px + env(safe-area-inset-right, 0px));
		z-index: 3;
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 12px;
		cursor: pointer;
		color: var(--title);
		opacity: 0;
		transition: opacity 240ms var(--ease);
	}
	.close svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}
	.in .close {
		opacity: 1;
	}
	.head {
		position: relative;
		z-index: 1;
		flex: 0 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		max-width: 760px;
		padding: 48px 24px 18px clamp(24px, 6vw, 96px);
		opacity: 0;
		transform: translateY(8px);
		transition:
			opacity 360ms var(--ease) 120ms,
			transform 420ms var(--ease) 120ms;
	}
	.in .head {
		opacity: 1;
		transform: none;
	}
	.head.cut {
		-webkit-mask-image: linear-gradient(#000 calc(100% - 2.6em), transparent);
		mask-image: linear-gradient(#000 calc(100% - 2.6em), transparent);
	}
	.kicker {
		font-size: 13px;
		color: var(--muted);
		margin-bottom: 10px;
		font-feature-settings: 'tnum';
	}
	.title {
		font-family: var(--serif);
		font-weight: 400;
		font-size: clamp(20px, 2.1vw, 27px);
		line-height: 1.28;
		color: var(--title);
		margin: 0 44px 10px 0;
		text-wrap: balance;
	}
	.authors {
		font-size: 13.5px;
		color: var(--muted);
		margin-bottom: 12px;
	}
	.abstract {
		font-size: 14px;
		line-height: 1.65;
		color: var(--text);
		max-height: 7.5em;
		overflow: hidden;
		-webkit-mask-image: linear-gradient(#000 calc(100% - 2.4em), transparent);
		mask-image: linear-gradient(#000 calc(100% - 2.4em), transparent);
		transition: max-height 320ms var(--ease);
	}
	.abstract.open {
		-webkit-mask-image: none;
		mask-image: none;
	}
	.more {
		background: none;
		border: 0;
		margin-top: 6px;
		font-size: 13px;
		color: var(--title);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--hair);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-top: 16px;
	}
	.count {
		font-size: 13px;
		color: var(--muted);
	}
	.stream {
		position: relative;
		z-index: 1;
		flex: 1 1 0;
		min-height: 38%;
		overflow-x: auto;
		overflow-y: hidden;
		scroll-snap-type: x proximity;
		/* a page snaps to the margin the row keeps, not to the window's edge */
		scroll-padding-inline: clamp(24px, 6vw, 96px);
		scrollbar-width: thin;
		padding: 12px 0 20px;
		outline: none;
	}
	.pages {
		display: flex;
		align-items: flex-start;
		gap: 22px;
		height: 100%;
		padding: 0 clamp(24px, 6vw, 96px);
		width: max-content;
	}
	.rpage {
		height: calc(100% - 26px);
		aspect-ratio: 720 / 932;
		scroll-snap-align: start;
		position: relative;
	}
	.rpage img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top center;
		background: #fff;
		border-radius: 4px;
		box-shadow:
			0 2px 4px rgba(0, 0, 0, 0.35),
			0 18px 40px rgba(0, 0, 0, 0.45);
	}
	:global(.day) .rpage img {
		box-shadow:
			0 1px 3px rgba(22, 36, 47, 0.18),
			0 16px 34px rgba(22, 36, 47, 0.22);
	}
	.rpage figcaption {
		position: absolute;
		left: 0;
		bottom: -22px;
		font-size: 12px;
		color: var(--muted);
		font-feature-settings: 'tnum';
	}
	.rpage.late img {
		opacity: 0;
		transform: translateY(14px);
	}
	.in .rpage.late:global(.ready) img {
		opacity: 1;
		transform: none;
		transition:
			opacity 420ms var(--ease) var(--pd),
			transform 520ms var(--ease-out) var(--pd);
	}
	.fly {
		position: fixed;
		inset: 0;
		z-index: 3;
		pointer-events: none;
	}
	.fly :global(.dbl) {
		position: fixed;
		display: block;
		object-fit: cover;
		object-position: top center;
		background: #fff;
		transform-origin: 50% 50%;
		transition:
			transform 680ms cubic-bezier(0.3, 0.1, 0.1, 1),
			filter 680ms var(--ease),
			border-radius 680ms var(--ease);
		will-change: transform;
	}
	.fly :global(.dbl.paper) {
		box-shadow:
			0 2px 4px rgba(0, 0, 0, 0.35),
			0 18px 40px rgba(0, 0, 0, 0.45);
	}
	@media (max-width: 700px) {
		.head {
			padding: 56px 20px 12px;
		}
		.stream {
			min-height: 46%;
		}
		.pages {
			padding: 0 20px;
			gap: 14px;
		}
	}
</style>
