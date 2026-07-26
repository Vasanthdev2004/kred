// `twitter-image` is a separate Next file convention from `opengraph-image` — without
// this, X would keep falling back to the static root card instead of the per-disclosure
// one. Same image, same cache window (Next needs the literal here).
export { default, alt, size, contentType } from "./opengraph-image";

export const revalidate = 30;
