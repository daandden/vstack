import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2026-10-01",
  telemetry: false,
  devtools: { enabled: false },
  buildId: "flow-reader",
  experimental: { appManifest: false },
  css: ["~/assets/reader.css"],
  alias: {
    "#flow": fileURLToPath(new URL("../plugin/skills/flow-page/scripts", import.meta.url)),
    "#figures": fileURLToPath(new URL("../plugin/skills/vstack-figures/scripts", import.meta.url)),
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
