// ─── The two records ──────────────────────────────────────────────────────
// A piece of music for each half of the day. Change the lights while it is
// playing and it changes record: what was on fades down and pauses, keeping
// its place, there is a moment of needle noise between, and the other comes
// up. Not a crossfade — two pieces of music over each other is neither of
// them. Nothing is fetched until somebody plays it.

let ctx: AudioContext | null = null;
let master: GainNode;
let analyser: AnalyserNode;
const tracks: Partial<Record<'day' | 'night', { el: HTMLAudioElement; gain: GainNode }>> = {};
let current: 'day' | 'night' | null = null;
let bins: Uint8Array<ArrayBuffer>;

function audio() {
	if (ctx) return ctx;
	// On an iPhone, sound made through the page's audio graph is silenced by
	// the ringer switch, as a notification would be, unless the page says it
	// is playing music (Safari 16.4 and on). It is.
	const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
	if (session) session.type = 'playback';
	ctx = new AudioContext();
	master = ctx.createGain();
	master.gain.value = 0.9;
	analyser = ctx.createAnalyser();
	analyser.fftSize = 256;
	bins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
	master.connect(analyser);
	analyser.connect(ctx.destination);
	return ctx;
}

function track(which: 'day' | 'night') {
	const c = audio();
	let t = tracks[which];
	if (t) return t;
	const el = new Audio();
	el.preload = 'none';
	el.loop = true;
	el.crossOrigin = 'anonymous';
	el.src = `/media/${which}.mp3`;
	const src = c.createMediaElementSource(el);
	const gain = c.createGain();
	gain.gain.value = 0;
	src.connect(gain).connect(master);
	t = tracks[which] = { el, gain };
	return t;
}

/** A needle set down: a short burst of filtered noise. */
function hiss(dur = 0.45, level = 0.05) {
	const c = audio();
	const n = Math.floor(c.sampleRate * dur);
	const buf = c.createBuffer(1, n, c.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < n; i++) {
		const crackle = Math.random() < 0.002 ? (Math.random() - 0.5) * 6 : 0;
		d[i] = ((Math.random() - 0.5) * 0.6 + crackle) * Math.pow(1 - i / n, 0.6);
	}
	const s = c.createBufferSource();
	s.buffer = buf;
	const f = c.createBiquadFilter();
	f.type = 'bandpass';
	f.frequency.value = 2400;
	f.Q.value = 0.7;
	const g = c.createGain();
	g.gain.value = level;
	s.connect(f).connect(g).connect(c.destination);
	s.start();
}

function fade(g: GainNode, to: number, secs: number, after = 0) {
	const now = ctx!.currentTime;
	g.gain.cancelScheduledValues(now);
	g.gain.setValueAtTime(g.gain.value, now + after);
	g.gain.linearRampToValueAtTime(to, now + after + secs);
}

// ─── Clicks ───────────────────────────────────────────────────────────────
// Built rather than loaded, as on the old page: a short burst of noise
// through a band, which is most of what a switch actually is.

/** one burst of band-limited noise, `peak` loud, starting `at` seconds from now */
function burst(secs: number, freq: number, q: number, peak: number, at = 0, shape = 7) {
	const c = audio();
	if (c.state === 'suspended') c.resume();
	const t = c.currentTime + at;
	const n = Math.max(1, Math.round(c.sampleRate * secs));
	const buf = c.createBuffer(1, n, c.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, shape);
	const s = c.createBufferSource();
	s.buffer = buf;
	const f = c.createBiquadFilter();
	f.type = 'bandpass';
	f.frequency.value = freq;
	f.Q.value = q;
	const g = c.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.002, secs * 0.3));
	g.gain.exponentialRampToValueAtTime(0.0001, t + secs + 0.02);
	s.connect(f).connect(g).connect(c.destination);
	s.start(t);
	s.stop(t + secs + 0.04);
}

/** The lamp's pull-switch: a dry tick as it goes over, and a softer one as
 *  the cord takes it back, the old page's click. */
export function lampClick() {
	try {
		burst(0.03, 2100, 1.1, 0.16);
		burst(0.03, 1500, 1.1, 0.1, 0.09);
	} catch {
		/* no audio, no matter */
	}
}

/** The gramophone's switch, a heavier thing than a lamp's: the same burst
 *  through a lower band, landing twice, the knob going over and the detent
 *  behind it. */
export function gramClick(on: boolean) {
	try {
		burst(0.035, on ? 1200 : 900, 1.2, on ? 0.15 : 0.1, 0, 3);
		burst(0.05, 320, 0.9, 0.09, 0.045, 3);
	} catch {
		/* no audio */
	}
}

// Every request takes a ticket; anything still pending when a later request
// arrives stands down, so the last thing asked for is what happens.
let ticket = 0;
let stopped: (() => void) | null = null;

/** Called if the music stops on its own (a record that would not start). */
export function onStop(fn: () => void) {
	stopped = fn;
}

export async function play(day: boolean) {
	const my = ++ticket;
	const c = audio();
	const asked = c.currentTime;
	const which = day ? 'day' : 'night';
	const t = track(which);
	// the element is started in the same turn as the gesture that asked for
	// it, before anything is awaited, or Safari will not let it play
	const started = t.el.play();
	const resumed = c.state === 'suspended' ? c.resume() : Promise.resolve();
	// the switch, then the needle, then the music
	setTimeout(() => {
		if (my === ticket) hiss(0.3, 0.035);
	}, 110);
	current = which;
	let ok = true;
	try {
		await Promise.all([started, resumed]);
	} catch {
		ok = false;
	}
	if (my !== ticket) {
		// superseded while it started: whoever came later owns the music now
		if (current !== which) t.el.pause();
		return ok;
	}
	if (!ok) {
		current = null;
		return false;
	}
	fade(t.gain, 1, 0.8, Math.max(0, 0.22 - (c.currentTime - asked)));
	return true;
}

export function pause() {
	++ticket;
	if (!ctx || !current) return;
	const which = current;
	const t = tracks[which]!;
	current = null;
	fade(t.gain, 0, 0.35);
	setTimeout(() => {
		if (current !== which) t.el.pause();
	}, 380);
}

/** The lights changed while a record was on: change records. */
export function changeover(day: boolean) {
	if (!ctx || !current) return;
	const which = day ? 'day' : 'night';
	if (which === current) return;
	const my = ++ticket;
	const was = current;
	const w = tracks[was]!;
	fade(w.gain, 0, 0.5);
	setTimeout(() => {
		if (current !== was) w.el.pause();
	}, 520);
	// the other record goes on now, silent, while the lamp's pull still
	// counts as a gesture; it comes up after the needle noise
	current = which;
	const t = track(which);
	fade(t.gain, 0, 0.05);
	const started = t.el.play().then(
		() => true,
		() => false
	);
	setTimeout(() => {
		if (my === ticket) hiss(0.55, 0.05);
	}, 380);
	setTimeout(async () => {
		const ok = await started;
		if (my !== ticket) return;
		if (ok && current === which) fade(t.gain, 1, 0.8);
		else if (!ok) {
			current = null;
			stopped?.();
		}
	}, 820);
}

/** How loud the bottom of the spectrum is, 0..1, for the notes. */
export function level() {
	if (!ctx || !current) return 0;
	analyser.getByteFrequencyData(bins);
	let s = 0;
	for (let i = 1; i < 12; i++) s += bins[i];
	return s / (11 * 255);
}
