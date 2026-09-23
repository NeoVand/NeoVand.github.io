import { brickCanvases, ashlarCanvases, rockCanvases, flagCanvases } from './texgen';

// Draws the heavy textures off the page's thread (see bakeTextures in
// textures.ts) and hands each back as raw pixels, which cross between
// threads and into WebGL anywhere; a bitmap made here does not always.

const jobs = {
	bricks: brickCanvases,
	ashlar: ashlarCanvases,
	rock: rockCanvases,
	flags: flagCanvases
};

const pixels = (cv: OffscreenCanvas) =>
	cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height);

self.onmessage = (e: MessageEvent<(keyof typeof jobs)[]>) => {
	for (const k of e.data) {
		const c = jobs[k]();
		const color = pixels(c.color as OffscreenCanvas),
			normal = pixels(c.normal as OffscreenCanvas);
		(self as unknown as Worker).postMessage({ k, color, normal }, [
			color.data.buffer,
			normal.data.buffer
		]);
	}
};
