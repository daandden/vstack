// The Flow reader is a client-rendered Nuxt app. `vp run reader:build` generates its shell and assets, and
// reader/ship.ts copies them into the flow-page skill, where the Bun Local Flow host serves them.
import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2026-10-01",
  telemetry: false,
  devtools: { enabled: false },
  // A fixed id and no app manifest keep a rebuild of unchanged sources byte-identical.
  buildId: "flow-reader",
  experimental: { appManifest: false },
  css: ["~/assets/reader.css"],
  // Shared, browser-safe Flow modules: code highlighting, diff parsing, and the Visual kind labels.
  alias: { "#flow": fileURLToPath(new URL("../plugin/skills/flow-page/scripts", import.meta.url)) },
  app: {
    // Capability-free asset paths: the host serves them to every Flow, and the shell reads Flow data relative to
    // its own capability URL.
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
