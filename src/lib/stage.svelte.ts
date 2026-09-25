import type { Grove } from '$lib/grove/engine';

/** The picture behind the page, once it is up: for the parts of the page
 *  that talk to it, as the reading room does. */
export const stage = $state<{ grove: Grove | null }>({ grove: null });
