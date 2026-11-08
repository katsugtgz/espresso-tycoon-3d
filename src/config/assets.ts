/**
 * Resolve a path under public/assets/ so it works both at `/` (dev) and at a
 * sub-path like `/espresso-tycoon-3d/` (GitHub Pages). BASE_URL always ends
 * with a slash.
 */
export const asset = (name: string): string => `${import.meta.env.BASE_URL}assets/${name}`;
