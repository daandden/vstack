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
  modules: ["@unocss/nuxt", "@nuxtjs/color-mode", "@vueuse/nuxt"],
  unocss: {
    configFile: fileURLToPath(new URL("./uno.config.ts", import.meta.url)),
    wind3: false,
    components: false,
    disableNuxtInlineStyle: false,
  },
  colorMode: { preference: "system", fallback: "light", classSuffix: "", dataValue: "theme", storageKey: "flow-reader:theme", disableTransition: true },
  css: ["~/assets/main.css"],
  // Bun resolves omptype's TypeScript export. Bundle it before Nitro's Rollup pass.
  build: { transpile: ["@oh-my-pi/omptype", "reka-ui"] },
  alias: {
    "#flow": join(sourceRoot, "plugin/skills/flow-page/scripts"),
    "#figures": join(sourceRoot, "plugin/skills/vstack-figures/scripts"),
  },
  vite: {
    // SSR chunks contain absolute external imports. Their content hashes vary by checkout, but these private files ship only inside one server bundle.
    environments: {
      ssr: { build: { rollupOptions: { output: { chunkFileNames: "_flow-reader/[name].js" } } } },
    },
  },
  nitro: {
    preset: shell ? "static" : "bun",
    ...(!shell ? { entry: fileURLToPath(new URL("./server/entry.ts", import.meta.url)) } : {}),
    ignore: shell ? ["**/routes/**"] : [],
    serveStatic: false,
    esbuild: { options: { target: "esnext" } },
    externals: { inline: [/.*/], trace: false },
    rollupConfig: {
      plugins: [{
        name: "flow-stable-generated-inputs",
        // Nitro hashes absolute plugin and handler paths into local identifiers. Keep their declaration order, not their checkout paths.
        transform(code: string, id: string) {
          // Nuxt records independent stylesheet loaders in parallel completion order.
          if (id.includes("styles") && code.startsWith("const interopDefault = r => r.default || r || []")) {
            return { code: code.replace(/(export default \{\n)([\s\S]*?)(\n\})/, (_match, open: string, entries: string, close: string) =>
              open + entries.split(/,\n/).sort().join(",\n") + close), map: null };
          }
          if (!id.includes("#nitro-internal-virtual/plugins") && !id.includes("#nitro-internal-virtual/server-handlers")) return;
          const identifiers = [...code.matchAll(/(?:import|const) (_[A-Za-z0-9_$]+)(?= (?:from|=))/g)].map(match => match[1]!);
          for (const [index, identifier] of identifiers.entries()) code = code.replace(new RegExp(`\\b${identifier}\\b`, "g"), `_flow_generated_${index}`);
          return { code, map: null };
        },
      }],
    },
    // Nitro 2 needs Hookable 5's Promise-returning calls. Nuxt 4 also installs Hookable 6 at the project root.
    alias: { hookable: nitroRequire.resolve("hookable") },
  },
  app: {
    buildAssetsDir: "/_flow-reader/",
    rootAttrs: { class: "isolate" },
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
