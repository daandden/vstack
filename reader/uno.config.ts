import { fileURLToPath } from "node:url";
import { icons as lucide } from "@iconify-json/lucide";
import { defineConfig, presetIcons, presetWind4 } from "unocss";

const colors: Record<string, string> = {
  "flow-base": "var(--base)",
  "flow-muted": "var(--mantle)",
  "flow-accented": "var(--surface0)",
  "flow-border": "var(--surface1)",
  "flow-line": "var(--line)",
  "flow-dimmed": "var(--overlay0)",
  "flow-subtext": "var(--subtext0)",
  "flow-toned": "var(--subtext1)",
  "flow-text": "var(--text)",
  "flow-mauve": "var(--mauve)",
  "flow-blue": "var(--blue)",
  "flow-lavender": "var(--lavender)",
  "flow-yellow": "var(--yellow)",
  "flow-peach": "var(--peach)",
  "flow-green": "var(--green)",
  "flow-red": "var(--red)",
  "flow-teal": "var(--teal)",
  "flow-sky": "var(--sky)",
  "flow-pink": "var(--pink)",
};
const paintProperties: Record<string, string> = {
  text: "color",
  bg: "background-color",
  border: "border-color",
  outline: "outline-color",
};

export default defineConfig({
  presets: [
    presetWind4({ preflights: { reset: true } }),
    presetIcons({ collections: { lucide: () => lucide }, mode: "mask" }),
  ],
  content: {
    pipeline: { include: [/[/\\]app[/\\].*\.(?:vue|ts)(?:$|\?)/] },
    filesystem: [fileURLToPath(new URL("./app/**/*.{vue,ts}", import.meta.url))],
  },
  safelist: ["isolate"],
  outputToCssLayers: {
    cssLayerName: layer => layer === "base" ? "reset" : null,
  },
  rules: [
    [/^(text|bg|border|outline)-(flow-[a-z-]+)$/, ([, type, token]) => {
      const color = colors[token!];
      // Opaque palette colors keep their OKLCH values instead of mixing in sRGB.
      if (color) return { [paintProperties[type!]!]: color };
    }],
    ["text-flow-state", { color: "var(--state, var(--subtext0))" }],
    ["bg-flow-state", { "background-color": "var(--state, var(--subtext0))" }],
  ],
  theme: {
    media: { "pointer-coarse": "(pointer: coarse)" },
    font: {
      sans: "var(--reader-font-sans)",
      mono: "var(--reader-font-sans)",
      heading: "var(--reader-font-heading)",
    },
    text: {
      body: { fontSize: "var(--fs-body)" },
      small: { fontSize: "var(--fs-small)" },
      title: { fontSize: "var(--fs-title)" },
    },
    colors,
  },
});
