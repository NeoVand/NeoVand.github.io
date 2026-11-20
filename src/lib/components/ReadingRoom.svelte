<script lang="ts">
	import { onDestroy, tick } from 'svelte';
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
	// the islet's canvas, over the glass in the room the words leave free, and
	// the height of the part of it the islet is framed in
	let isletCv: HTMLCanvasElement;
	let islet = $state(false);
	let isletFrameH = 0;

	let deck: HTMLElement | null = null;
	let flying = $state(false);
	let closing = false;
	let pendingClose = false;
	let flightEpoch = 0;
	let activeAnimations: Animation[] = [];
	let settleFlight: (() => void) | null = null;
	let unlockScroll: (() => void) | null = null;
	let releaseFan: (() => void) | null = null;
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

	// The first pages reuse the already-visible fan thumbnails immediately.
	// High-resolution sheets replace those previews only after decoding.
	let lazy: IntersectionObserver | null = null;
	const pageLoads = new WeakMap<HTMLImageElement, () => void>();
	function pageImage(slug: string, index: number) {
		return (img: HTMLImageElement) => {
			let live = true;
			let pending: HTMLImageElement | null = null;
			const ready = () => {
				if (live) img.parentElement?.classList.add('ready');
			};
			const load = () => {
				if (pending) return;
				pending = new Image();
				pending.decoding = 'async';
				pending.src = '/media/papers/pages/' + slug + '-' + index + '.jpg';
				const source = pending;
				void decoded(source).then(() => {
					if (!live || !source.naturalWidth) return;
					img.src = source.src;
					ready();
				});
			};
			if (index <= FAN) {
				img.src = '/media/papers/' + slug + '-' + index + '.jpg';
				void decoded(img).then(ready);
			}
			if (index <= FAN + 2) load();
			else {
				lazy ??= new IntersectionObserver(
					(entries) => {
						for (const entry of entries) {
							if (!entry.isIntersecting) continue;
							pageLoads.get(entry.target as HTMLImageElement)?.();
							lazy?.unobserve(entry.target);
						}
					},
					{ root: stream, rootMargin: '0px 600px' }
				);
				pageLoads.set(img, load);
				lazy.observe(img);
			}
			return () => {
				live = false;
				lazy?.unobserve(img);
				pageLoads.delete(img);
				if (pending && !pending.complete) pending.src = '';
			};
		};
	}

	function fanRects(d: HTMLElement) {
		return [...d.querySelectorAll<HTMLImageElement>('.page')]
			.sort((a, b) => +a.style.getPropertyValue('--i') - +b.style.getPropertyValue('--i'))
			.map((img) => {
				const rect = img.getBoundingClientRect();
				const style = getComputedStyle(img);
				const matrix = new DOMMatrixReadOnly(style.transform);
				return {
					el: img,
					cx: rect.left + rect.width / 2,
					cy: rect.top + rect.height / 2,
					w: parseFloat(style.width),
					h: parseFloat(style.height),
					a: Math.atan2(matrix.b, matrix.a),
					filter: style.filter,
					radius: parseFloat(style.borderTopLeftRadius) || 0
				};
			});
	}
	type FanRect = ReturnType<typeof fanRects>[number];

	// A single moving frame owns its printed surface. The whole source image
	// is painted, never cropped; close can blend to a different fan page inside
	// that same frame when the reader has scrolled further through the paper.
	function printedSurface(source: HTMLImageElement, width: number, height: number) {
		if (!source.complete || !source.naturalWidth) {
			const fallback = document.createElement('img');
			fallback.src = source.currentSrc || source.src;
			fallback.alt = '';
			return fallback;
		}
		const canvas = document.createElement('canvas');
		const dpr = Math.min(2, devicePixelRatio || 1);
		canvas.width = Math.max(1, Math.round(width * dpr));
		canvas.height = Math.max(1, Math.round(height * dpr));
		const context = canvas.getContext('2d')!;
		context.fillStyle = '#fff';
		context.fillRect(0, 0, canvas.width, canvas.height);
		const scale = Math.min(
			canvas.width / source.naturalWidth,
			canvas.height / source.naturalHeight
		);
		const w = source.naturalWidth * scale;
		const h = source.naturalHeight * scale;
		context.drawImage(source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
		return canvas;
	}

	function clearFlight() {
		for (const animation of activeAnimations) animation.cancel();
		activeAnimations = [];
		flyLayer?.replaceChildren();
	}

	function fly(d: HTMLElement, toRoom: boolean, origin: FanRect[] | null, done: () => void) {
		const epoch = ++flightEpoch;
		clearFlight();
		const fan = origin ?? fanRects(d);
		const allImages = [...pagesEl.querySelectorAll<HTMLImageElement>('.rpage img')];
		const viewport = stream.getBoundingClientRect();
		const images = toRoom
			? allImages.slice(0, fan.length)
			: allImages
					.filter((img) => {
						const r = img.getBoundingClientRect();
						return (
							r.right > viewport.left &&
							r.left < viewport.right &&
							r.bottom > viewport.top &&
							r.top < viewport.bottom
						);
					})
					.slice(0, fan.length);
		const frames = images.map((img) => ({
			img,
			rect: img.getBoundingClientRect(),
			opacity: getComputedStyle(img).opacity,
			shadow: getComputedStyle(img.parentElement!, '::before').boxShadow
		}));
		// Hide complete sheets, including their pseudo-element shadows and
		// captions. Stop momentum/snap before measuring or handing off frames.
		stream.style.scrollSnapType = 'none';
		stream.scrollTo({ left: stream.scrollLeft, behavior: 'instant' });
		pagesEl.style.visibility = 'hidden';
		for (const page of fan) page.el.style.visibility = 'hidden';
		d.classList.add('no-hover');
		const motions: Animation[] = [];
		const duration = 680;
		const stagger = 30;
		for (let index = frames.length - 1; index >= 0; index--) {
			const { img, rect, opacity, shadow } = frames[index];
			const target = fan[index];
			if (!target || !rect.width || !rect.height) continue;
			const frame = document.createElement('div');
			frame.className = 'dbl';
			Object.assign(frame.style, {
				left: rect.left + 'px',
				top: rect.top + 'px',
				width: rect.width + 'px',
				height: rect.height + 'px'
			});
			const source = printedSurface(toRoom ? target.el : img, rect.width, rect.height);
			frame.append(source);
			const scaleX = target.w / rect.width;
			const scaleY = target.h / rect.height;
			const scale = (scaleX + scaleY) / 2;
			const pose =
				'translate(' +
				(target.cx - rect.left - rect.width / 2) +
				'px,' +
				(target.cy - rect.top - rect.height / 2) +
				'px) rotate(' +
				target.a +
				'rad) scale(' +
				scaleX +
				',' +
				scaleY +
				')';
			const filter = target.filter.replace(
				/drop-shadow\(([^()]*(?:\([^()]*\))?[^()]*)\)/g,
				(_match, inner: string) =>
					'drop-shadow(' +
					inner.replace(
						/(-?\d*\.?\d+)px/g,
						(_part, value) => (parseFloat(value) / scale).toFixed(3) + 'px'
					) +
					')'
			);
			const deckFrame = {
				transform: pose,
				filter,
				borderRadius: target.radius / scale + 'px',
				boxShadow: 'none',
				opacity: 1
			};
			const roomFrame = {
				transform: 'none',
				filter: 'none',
				borderRadius: '3px',
				boxShadow: shadow,
				opacity: toRoom ? 1 : Number(opacity)
			};
			flyLayer.append(frame);
			const delay = (toRoom ? index : frames.length - 1 - index) * stagger;
			motions.push(
				frame.animate(toRoom ? [deckFrame, roomFrame] : [roomFrame, deckFrame], {
					duration,
					delay,
					easing: 'cubic-bezier(0.3, 0.1, 0.1, 1)',
					fill: 'both'
				})
			);
			if (!toRoom) {
				const destination = printedSurface(target.el, rect.width, rect.height);
				frame.append(destination);
				const blend = { duration: 220, delay: delay + 360, fill: 'both' as const };
				motions.push(source.animate([{ opacity: 1 }, { opacity: 0 }], blend));
				motions.push(destination.animate([{ opacity: 0 }, { opacity: 1 }], blend));
			}
		}
		// A narrow screen may show fewer than five reader sheets. The remaining
		// sheets emerge behind the arrivals, rather than popping in at the end.
		if (!toRoom) {
			for (const page of fan.slice(frames.length)) {
				page.el.style.visibility = '';
				motions.push(
					page.el.animate([{ opacity: 0 }, { opacity: 1 }], {
						duration: 180,
						delay: 500,
						fill: 'both'
					})
				);
			}
		}
		activeAnimations = motions;
		let ended = false;
		const finish = () => {
			if (ended || epoch !== flightEpoch) return;
			ended = true;
			settleFlight = null;
			if (toRoom) pagesEl.style.visibility = '';
			else for (const page of fan) page.el.style.visibility = '';
			clearFlight();
			stream.style.scrollSnapType = '';
			done();
		};
		settleFlight = finish;
		void Promise.all(motions.map((animation) => animation.finished.catch(() => {}))).then(finish);
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
		isletFrameH = frameH;
		Object.assign(isletCv.style, { left: x + 'px', width: w + 'px', height: innerHeight + 'px' });
		g.read({ w, h: innerHeight, frameH });
	}

	// The islet belongs to the paper: it comes out of the deck with the pages
	// and goes back into it with them, the same way and at the same pace. Its
	// picture's middle is put on the deck's, as small as the deck.
	const FLIGHT = 'transform 680ms cubic-bezier(0.3, 0.1, 0.1, 1)';
	function deckPose(d: HTMLElement) {
		const r = d.getBoundingClientRect();
		const x = parseFloat(isletCv.style.left),
			w = parseFloat(isletCv.style.width);
		const k = Math.max(0.05, Math.min(r.width / (w * 0.86), r.height / (isletFrameH * 0.95)));
		const dx = r.left + r.width / 2 - (x + w / 2),
			dy = r.top + r.height / 2 - isletFrameH / 2;
		isletCv.style.transformOrigin = `${w / 2}px ${isletFrameH / 2}px`;
		return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${k.toFixed(4)})`;
	}
	function isletOut(d: HTMLElement) {
		const st = isletCv.style;
		st.transition = 'none';
		st.transform = deckPose(d);
		st.opacity = '0';
		isletCv.getBoundingClientRect();
		st.transition = `${FLIGHT} 70ms, opacity 300ms var(--ease) 70ms`;
		st.transform = 'none';
		st.opacity = '1';
	}
	function isletHome(d: HTMLElement) {
		const st = isletCv.style;
		st.transition = `${FLIGHT}, opacity 280ms var(--ease) 400ms`;
		st.transform = deckPose(d);
		st.opacity = '0';
	}
	function isletReset() {
		Object.assign(isletCv.style, { transition: '', transform: '', opacity: '' });
	}

	$effect(() => {
		const g = stage.grove;
		if (!g || !isletCv) return;
		g.setIsletCanvas(isletCv);
		// a tap on the glass round the islet closes the room, as it would anywhere
		g.onIsletMiss = () => close();
	});

	function holdFan(d: HTMLElement) {
		releaseFan?.();
		d.classList.add('no-hover');
		const wake = () => {
			d.classList.remove('no-hover');
			removeEventListener('pointermove', wake);
			removeEventListener('keydown', wake);
			releaseFan = null;
		};
		addEventListener('pointermove', wake);
		addEventListener('keydown', wake);
		releaseFan = wake;
	}

	export async function open(p: Paper, d: HTMLElement) {
		if (!hidden) return;
		releaseFan?.();
		const origin = fanRects(d);
		const root = document.documentElement;
		const overflow = root.style.overflow;
		const gutter = root.style.scrollbarGutter;
		root.style.scrollbarGutter = 'stable';
		root.style.overflow = 'hidden';
		unlockScroll = () => {
			root.style.overflow = overflow;
			root.style.scrollbarGutter = gutter;
		};
		deck = d;
		paper = p;
		absOpen = false;
		pendingClose = false;
		closing = false;
		flying = !reduced();
		hidden = false;
		await tick();
		stream.scrollLeft = 0;
		head.scrollTop = 0;
		moreShown = abstractEl.scrollHeight > abstractEl.clientHeight + 2;
		await tick();
		checkCut();
		frameIslet();
		await tick();
		if (islet) {
			if (reduced()) isletCv.style.opacity = '1';
			else isletOut(d);
		}
		if (!reduced()) {
			fly(d, true, origin, () => {
				flying = false;
				if (pendingClose) {
					pendingClose = false;
					close();
				}
			});
		} else {
			d.classList.add('no-hover');
			for (const page of origin) page.el.style.visibility = 'hidden';
			flying = false;
		}
		isIn = true;
		room.focus({ preventScroll: true });
	}

	export function close() {
		if (!deck || hidden || closing) return;
		if (flying) {
			pendingClose = true;
			return;
		}
		const d = deck;
		closing = true;
		const hadIslet = islet;
		const finish = () => {
			if (hadIslet) {
				stage.grove?.read(null);
				isletReset();
			}
			holdFan(d);
			for (const page of d.querySelectorAll<HTMLElement>('.page')) page.style.visibility = '';
			hidden = true;
			isIn = false;
			flying = false;
			closing = false;
			islet = false;
			deck = null;
			paper = null;
			lazy?.disconnect();
			lazy = null;
			unlockScroll?.();
			unlockScroll = null;
			d.focus({ preventScroll: true });
		};
		if (reduced()) return finish();
		// Snapshot the currently painted sheets before .in/hover/late-page
		// styles change. The real layer then stays hidden for the entire flight.
		fly(d, false, null, finish);
		flying = true;
		isIn = false;
		if (hadIslet) isletHome(d);
	}

	onDestroy(() => {
		flightEpoch += 1;
		settleFlight = null;
		clearFlight();
		lazy?.disconnect();
		unlockScroll?.();
		releaseFan?.();
		deck?.querySelectorAll<HTMLElement>('.page').forEach((page) => (page.style.visibility = ''));
		if (islet) stage.grove?.read(null);
	});

	function checkCut() {
		if (!head) return;
		headCut =
			head.scrollHeight > head.clientHeight + 1 &&
			head.scrollTop + head.clientHeight < head.scrollHeight - 2;
	}

	function toggleAbstract() {
		if (closing || pendingClose) return;
		settleFlight?.();
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
			e.preventDefault();
			if (flying) return;
			const page = pagesEl.firstElementChild as HTMLElement | null;
			if (!page) return;
			const step =
				page.getBoundingClientRect().width + parseFloat(getComputedStyle(pagesEl).columnGap);
			stream.scrollBy({
				left: e.key === 'ArrowRight' ? step : -step,
				behavior: reduced() ? 'instant' : 'smooth'
			});
		}
	}

	// the wheel reads along the row
	function onWheel(e: WheelEvent) {
		if (flying) {
			e.preventDefault();
			return;
		}
		if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
			stream.scrollLeft += e.deltaY;
			e.preventDefault();
		}
	}
</script>

<svelte:window
	onkeydown={onKey}
	onresize={() => {
		settleFlight?.();
		checkCut();
		if (!hidden && isIn) frameIslet();
	}}
/>

<div
	class={['room', { in: isIn, moving: flying }]}
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
				{#if paper.arxiv}
					<a
						class="pill glass"
						href={paper.arxiv}
						target="_blank"
						rel="noopener"
						aria-label="View {paper.title} on arXiv"
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
							><path
								d="M14 3h7v7M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"
							/></svg
						>
						View on arXiv
					</a>
				{/if}
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
			<div
				class="pages"
				bind:this={pagesEl}
				style:--paper-ratio={paper.pageSize.width / paper.pageSize.height}
			>
				{#each Array.from({ length: paper.pages }, (_, k) => k + 1) as i (i)}
					<figure
						class="rpage"
						class:late={i > FAN}
						style="--pd:{300 + Math.min(6, i - FAN) * 55}ms"
					>
						<img
							alt="Page {i}"
							width={paper.pageSize.width}
							height={paper.pageSize.height}
							decoding="async"
							{@attach pageImage(paper.slug, i)}
						/>
						<figcaption>{i}</figcaption>
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
		flex-wrap: wrap;
		align-items: center;
		gap: 14px;
		margin-top: 16px;
	}
	.count {
		font-size: 13px;
		color: var(--muted);
	}
	.stream {
		--reader-gutter: clamp(24px, 6vw, 96px);
		container-type: size;
		position: relative;
		z-index: 1;
		flex: 1 1 0;
		min-height: 38%;
		overflow-x: auto;
		overflow-y: hidden;
		scroll-snap-type: x proximity;
		/* a page snaps to the margin the row keeps, not to the window's edge */
		scroll-padding-inline: var(--reader-gutter);
		scrollbar-width: thin;
		padding: 12px 0 20px;
		outline: none;
	}
	.pages {
		display: flex;
		align-items: flex-start;
		gap: 22px;
		height: 100%;
		padding: 0 var(--reader-gutter);
		width: max-content;
	}
	/* A page is a sheet lying on the glass: a close shadow where it touches
	   and a wide soft one under it. Under the pointer it lifts a little
	   toward the eye, and its shadow spreads and softens as it would. */
	.rpage {
		flex: none;
		width: min(calc((100cqh - 26px) * var(--paper-ratio)), calc(100cqw - 2 * var(--reader-gutter)));
		aspect-ratio: var(--paper-ratio);
		scroll-snap-align: start;
		position: relative;
		isolation: isolate;
		transition: transform 520ms var(--ease-out);
	}
	.rpage::before,
	.rpage::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: 3px;
		transition: opacity 520ms var(--ease-out);
	}
	.rpage::before {
		box-shadow:
			0 1px 2px rgba(0, 0, 0, 0.3),
			0 12px 28px -8px rgba(0, 0, 0, 0.5),
			0 34px 64px -26px rgba(0, 0, 0, 0.5);
	}
	.rpage::after {
		opacity: 0;
		box-shadow:
			0 2px 4px rgba(0, 0, 0, 0.22),
			0 26px 48px -12px rgba(0, 0, 0, 0.55),
			0 56px 96px -34px rgba(0, 0, 0, 0.5);
	}
	:global(.day) .rpage::before {
		box-shadow:
			0 1px 2px rgba(22, 36, 47, 0.16),
			0 12px 26px -10px rgba(22, 36, 47, 0.26),
			0 30px 56px -26px rgba(22, 36, 47, 0.24);
	}
	:global(.day) .rpage::after {
		box-shadow:
			0 2px 4px rgba(22, 36, 47, 0.12),
			0 24px 44px -14px rgba(22, 36, 47, 0.3),
			0 50px 86px -34px rgba(22, 36, 47, 0.26);
	}
	@media (hover: hover) and (pointer: fine) {
		.in:not(.moving) .rpage:hover {
			transform: translateY(-5px);
		}
		.in:not(.moving) .rpage:hover::before {
			opacity: 0;
		}
		.in:not(.moving) .rpage:hover::after {
			opacity: 1;
		}
	}
	.rpage img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		object-position: top center;
		background: #fff;
		border-radius: 3px;
	}
	.rpage figcaption {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -22px;
		text-align: center;
		font-size: 11.5px;
		letter-spacing: 0.04em;
		color: var(--muted);
		opacity: 0.8;
		font-feature-settings: 'tnum';
	}
	.rpage.late img,
	.rpage.late::before {
		opacity: 0;
		transform: translateY(14px);
	}
	.in:not(.moving) .rpage.late:global(.ready) img,
	.in:not(.moving) .rpage.late:global(.ready)::before {
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
	.moving .pages {
		visibility: hidden;
	}
	.moving .stream {
		pointer-events: none;
		scroll-snap-type: none;
	}
	.fly :global(.dbl) {
		position: fixed;
		display: block;
		overflow: hidden;
		background: #fff;
		transform-origin: 50% 50%;
		will-change: transform;
	}
	.fly :global(.dbl > *) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	@media (max-width: 700px) {
		.backdrop {
			background: rgb(4, 6, 10);
			-webkit-backdrop-filter: none;
			backdrop-filter: none;
		}
		:global(.day) .backdrop {
			background: linear-gradient(rgb(86, 128, 184), rgb(142, 174, 212));
		}
		.head {
			padding: 56px 20px 12px;
		}
		.stream {
			--reader-gutter: 20px;
			min-height: 46%;
		}
		.pages {
			gap: 14px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.backdrop,
		.head,
		.close,
		.abstract,
		.rpage,
		.rpage::before,
		.rpage::after,
		.in .rpage.late:global(.ready) img,
		.in .rpage.late:global(.ready)::before {
			transition: none;
		}
	}
</style>
