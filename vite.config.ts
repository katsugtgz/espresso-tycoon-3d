import { defineConfig } from 'vite';

// base is injected by CI for GitHub Pages project sites
// (e.g. BASE_PATH=/espresso-tycoon-3d/); defaults to '/' for local dev.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: {
    chunkSizeWarningLimit: 900,
  },
});
