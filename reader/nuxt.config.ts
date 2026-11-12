import { fileURLToPath } from "node:url";
import { join } from "node:path";

const sourceRoot = process.env.FLOW_READER_SOURCE_ROOT ?? fileURLToPath(new URL("..", import.meta.url));

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2026-10-01",
  telemetry: false,
  devtools: { enabled: false },
  buildId: "flow-reader",
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
