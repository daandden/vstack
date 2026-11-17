import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createRequire } from "node:module";

const sourceRoot = process.env.FLOW_READER_SOURCE_ROOT ?? fileURLToPath(new URL("..", import.meta.url));
const shell = process.env.FLOW_READER_SHELL === "1";
const require = createRequire(import.meta.url);
const nitroRequire = createRequire(require.resolve("nitropack/package.json"));

export default defineNuxtConfig({
  ssr: !shell,
  compatibilityDate: "2026-10-01",
  telemetry: false,
  devtools: { enabled: false },
  buildId: "flow-reader",
  buildDir: fileURLToPath(new URL("./.nuxt", import.meta.url)),
  // Fragment navigation belongs to the reader. A delayed router commit can overwrite the next keyboard selection.
  experimental: { appManifest: false, navigationRepaint: false },
  modules: ["@nuxt/ui", "@vueuse/nuxt"],
  ui: { theme: { transitions: false }, experimental: { componentDetection: true } },
  fonts: { provider: "local" },
  icon: { provider: "none", serverBundle: false, fallbackToApi: false, clientBundle: { scan: true } },
  colorMode: { preference: "system", fallback: "light", classSuffix: "", dataValue: "theme", storageKey: "flow-reader:theme" },
  css: ["~/assets/main.css"],
  alias: {
    "#flow": join(sourceRoot, "plugin/skills/flow-page/scripts"),
    "#figures": join(sourceRoot, "plugin/skills/vstack-figures/scripts"),
  },
  nitro: {
    preset: shell ? "static" : "bun",
    ...(!shell ? { entry: fileURLToPath(new URL("./server/entry.ts", import.meta.url)) } : {}),
    ignore: shell ? ["**/routes/**"] : [],
    serveStatic: false,
    esbuild: { options: { target: "esnext" } },
    externals: { inline: [/.*/], trace: false },
    // Nitro 2 needs Hookable 5's Promise-returning calls. Nuxt 4 also installs Hookable 6 at the project root.
    alias: { hookable: nitroRequire.resolve("hookable") },
  },
  app: {
    buildAssetsDir: "/_flow-reader/",
    head: {
      htmlAttrs: { lang: "en" },
      title: "Flow",
      meta: [{ name: "color-scheme", content: "light dark" }],
      link: [{ rel: "icon", href: "data:," }],
    },
  },
  hooks: {
    "prerender:routes"({ routes }) {
      routes.clear();
    },
  },
});
