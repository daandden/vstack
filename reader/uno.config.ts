import { fileURLToPath } from "node:url";
import { icons as lucide } from "@iconify-json/lucide";
import { defineConfig, presetIcons, presetWind4 } from "unocss";

const colors: Record<string, string> = {
  "flow-base": "var(--color-base)",
  "flow-muted": "var(--color-mantle)",
  "flow-accented": "var(--color-surface0)",
  "flow-border": "var(--color-surface1)",
  "flow-line": "var(--color-line)",
  "flow-dimmed": "var(--color-overlay0)",
  "flow-subtext": "var(--color-subtext0)",
  "flow-toned": "var(--color-subtext1)",
  "flow-text": "var(--color-text)",
  "flow-mauve": "var(--color-mauve)",
  "flow-blue": "var(--color-blue)",
  "flow-lavender": "var(--color-lavender)",
  "flow-yellow": "var(--color-yellow)",
  "flow-peach": "var(--color-peach)",
  "flow-green": "var(--color-green)",
  "flow-red": "var(--color-red)",
  "flow-teal": "var(--color-teal)",
  "flow-sky": "var(--color-sky)",
  "flow-pink": "var(--color-pink)",
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
  safelist: ["isolate", "spacing:control", "spacing:gutter", "container:content", "font:sans", "font:heading", "leading:body", "leading:heading", "radius:xs", "radius:sm"],
  outputToCssLayers: {
    cssLayerName: layer => layer === "base" ? "reset" : null,
  },
  shortcuts: {
    "reader-control": "[min-block-size:var(--spacing-control)] px-2 rounded-sm",
  },
  rules: [
    [/^(text|bg|border|outline)-(flow-[a-z-]+)$/, ([, type, token]) => {
      const color = colors[token!];
      if (color) return { [paintProperties[type!]!]: color };
    }],
    ["text-flow-state", { color: "var(--state, var(--color-subtext0))" }],
    ["bg-flow-state", { "background-color": "var(--state, var(--color-subtext0))" }],
  ],
  theme: {
    spacing: { DEFAULT: "4px", entry: "16px", control: "28px", gutter: "20px" },
    radius: { xs: "3px", sm: "4px", md: "4px", lg: "4px" },
    container: { content: "1024px" },
    leading: { body: "1.45", heading: "1.35" },
    font: {
      sans: '"IosevkaTerm Nerd Font Mono", "Iosevka Term", "JetBrains Mono", ui-monospace, monospace',
      mono: "var(--font-sans)",
      heading: '"IosevkaTermSlab Nerd Font Mono", "Iosevka Term Slab", "JetBrains Mono", ui-monospace, monospace',
    },
    text: {
      body: { fontSize: "var(--text-body)" },
      small: { fontSize: "var(--text-small)" },
      title: { fontSize: "var(--text-title)" },
    },
    colors,
  },
});
