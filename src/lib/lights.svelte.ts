// ─── The lights, and the music ────────────────────────────────────────────
// Two switches on the page: the lamp's cord, which is day and night, and
// the gramophone, which is music. The class on <html> is set before first
// paint by app.html; this only mirrors it and changes it.

// read from the page as soon as this is imported, so nothing is ever drawn
// or compared against a stale value before the page's own onMount has run
export const lights = $state({
	day: typeof document !== 'undefined' && document.documentElement.classList.contains('day'),
	playing: false
});

export function readLights() {
	lights.day = document.documentElement.classList.contains('day');
}

let themeT = 0;
export function setDay(on: boolean, remember = true) {
	const root = document.documentElement;
	if (on === lights.day && on === root.classList.contains('day')) return;
	root.classList.add('theming');
	root.classList.toggle('day', on);
	lights.day = on;
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute('content', on ? '#c4bfb2' : '#101a38');
	if (remember)
		try {
			localStorage.setItem('lights', on ? 'day' : 'night');
			localStorage.setItem('lightsAt', String(Date.now()));
		} catch {
			/* private windows */
		}
	clearTimeout(themeT);
	themeT = window.setTimeout(() => root.classList.remove('theming'), 1000);
}

export const toggleDay = () => setDay(!lights.day);
