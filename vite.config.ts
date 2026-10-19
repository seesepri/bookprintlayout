import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Stamp every build with the commit it came from. "Which build am I looking at"
 * was impossible to answer from a screenshot, and the answer decides whether a
 * bug is still open or has simply not been deployed yet.
 */
const BUILD_ID = (() => {
  const fromCi = process.env.GITHUB_SHA?.trim();
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
})();

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    // Vite 8 bundles with rolldown/oxc, and its default target
    // "baseline-widely-available" is a *moving* floor: which browsers that label
    // covers changes when Vite changes. This app gets opened on whatever machine a
    // print shop happens to have, so pin the target instead of inheriting someone
    // else's release year. Cost, measured on the single-file output at its real
    // path (`gzip -c dist/index.html`, same ruler as the CI guard): 910,433 B at
    // Vite 8's default vs 920,886 B at es2020 — +10,453 B, still 81.8 % of the
    // 1,126,400 B guard, and only +3,744 B over what Vite 7 shipped.
    //
    // Deliberately es2020 and not a browser list: oxc accepts "chrome107,edge107,
    // firefox104,safari16" without complaining and then lowers *nothing* — the
    // emitted private-field count stays identical to the default build (221 vs
    // 220), while es2020 drops it to 119. Only esNNNN actually does the work here.
    target: "es2020",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // The pure modules under src/lib are the expensive ones to get wrong, and
    // they need no DOM: environment "node" keeps the suite dependency-light.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
});
