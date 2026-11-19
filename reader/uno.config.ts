import { fileURLToPath } from "node:url";
import { icons as lucide } from "@iconify-json/lucide";
import { defineConfig, presetIcons, presetWind4 } from "unocss";

export default defineConfig({
  presets: [
    // Tailwind still owns the reset and the unprefixed utility selectors.
    presetWind4({ prefix: "u-", preflights: { reset: false, property: false } }),
    presetIcons({ collections: { lucide: () => lucide }, mode: "mask" }),
  ],
  content: {
    pipeline: { include: [/[/\\]app[/\\].*\.(?:vue|ts)(?:$|\?)/] },
    filesystem: [fileURLToPath(new URL("./app/**/*.{vue,ts}", import.meta.url))],
  },
  theme: {
    colors: {
      "flow-base": "var(--base)",
      "flow-muted": "var(--mantle)",
      "flow-accented": "var(--surface0)",
      "flow-border": "var(--surface1)",
      "flow-line": "var(--line)",
      "flow-dimmed": "var(--overlay0)",
      "flow-subtext": "var(--subtext0)",
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
    },
  },
});
