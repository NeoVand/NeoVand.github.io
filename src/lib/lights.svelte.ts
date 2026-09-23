// ─── The lights, and the music ────────────────────────────────────────────
// Two switches on the page: the lamp's cord, which is day and night, and
// the gramophone, which is music. The class on <html> is set before first
// paint by app.html; this only mirrors it and changes it.

export const lights = $state({ day: false, playing: false });

export function readLights() {
	lights.day = document.documentElement.classList.contains('day');
}

let themeT = 0;
export function setDay(on: boolean, remember = true) {
	const root = document.documentElement;
	if (on === root.classList.contains('day')) return;
	root.classList.add('theming');
	root.classList.toggle('day', on);
	lights.day = on;
	document
		.querySelector('meta[name="theme-color"]')
		?.setAttribute('content', on ? '#5d7aa8' : '#000000');
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
