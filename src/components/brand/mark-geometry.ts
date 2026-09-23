/**
 * THE SLICE S — the mark's geometry, in one place, for the rail's glyph and every icon route.
 *
 * A geometric S in a 100×100 box whose first stretch — where money lands — is cut off and
 * lifted as a slice: a slice of every dollar that lands becomes stock. Drawn with butt caps, so
 * the cuts are radial and the slice reads as a piece of the same stroke, not a new shape.
 */
export const MARK_VIEWBOX = "0 0 100 100";
export const MARK_STROKE = 14.5;
export const MARK_S = "M 58.74 13.26 A 21.5 19.2 0 1 0 50 50 A 21.5 19.2 0 1 1 29.80 75.77";
export const MARK_SLICE = "M 70.45 24.87 A 21.5 19.2 0 0 0 61.39 14.52";
/** Where the slice sits, lifted off the S along its own radius. */
export const MARK_SLICE_LIFT = "translate(2.84 -2.22)";
/** The S and its slice, nudged to the optical centre of the box. */
export const MARK_NUDGE = "translate(-1.4 0.9)";
