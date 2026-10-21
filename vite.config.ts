import { defineConfig } from "vitest/config";

// Served at thorsteingames.com/pix-pen: thorstein-games-website proxies
// /pix-pen/* to this repo's GitHub Pages site (still at /pixels/, the repo's
// name), so every asset URL
// must carry the prefix.
export default defineConfig({
  base: "/pix-pen/",
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
