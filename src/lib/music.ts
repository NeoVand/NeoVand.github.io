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

function fade(g: GainNode, to: number, secs: number) {
	const now = ctx!.currentTime;
	g.gain.cancelScheduledValues(now);
	g.gain.setValueAtTime(g.gain.value, now);
	g.gain.linearRampToValueAtTime(to, now + secs);
}

export async function play(day: boolean) {
	const c = audio();
	if (c.state === 'suspended') await c.resume();
	const which = day ? 'day' : 'night';
	const t = track(which);
	hiss(0.3, 0.035);
	current = which;
	try {
		await t.el.play();
	} catch {
		current = null;
		return false;
	}
	fade(t.gain, 1, 0.8);
	return true;
}

export function pause() {
	if (!ctx || !current) return;
	const t = tracks[current]!;
	fade(t.gain, 0, 0.35);
	const el = t.el;
	setTimeout(() => el.pause(), 380);
	current = null;
}

/** The lights changed while a record was on: change records. */
export async function changeover(day: boolean) {
	if (!ctx || !current) return;
	const was = tracks[current]!;
	fade(was.gain, 0, 0.5);
	const el = was.el;
	setTimeout(() => el.pause(), 520);
	current = null;
	setTimeout(() => hiss(0.55, 0.05), 380);
	setTimeout(() => play(day), 820);
}

/** How loud the bottom of the spectrum is, 0..1, for the notes. */
export function level() {
	if (!ctx || !current) return 0;
	analyser.getByteFrequencyData(bins);
	let s = 0;
	for (let i = 1; i < 12; i++) s += bins[i];
	return s / (11 * 255);
}
