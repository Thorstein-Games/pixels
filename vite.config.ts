import { defineConfig } from "vitest/config";

// Served at thorsteingames.com/pixels: the thorstein-games-website app
// rewrites /pixels/* to this repo's GitHub Pages site, so every asset URL
// must carry the prefix.
export default defineConfig({
  base: "/pixels/",
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
