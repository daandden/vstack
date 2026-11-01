<script setup lang="ts">
// One captured diagram: Mermaid source drawn by Pele, or an SVG. A Pele diagram lives in its own shadow root, so its
// ids and rules stay inside it while it inherits the theme's `--pele-*` colors and the page's fonts. Its caption is
// its accessible name. Any SVG that Pele did not draw stays a sandboxed <img>.
import { keepPlaceNow } from "~/composables/navigation";
import { derivePele, drawMermaid, type Drawn } from "~/utils/diagram";
import type { Attachment } from "~/utils/flow";

const props = defineProps<{ a: Attachment }>();
const src = computed(() => `assets/${props.a.file}`);
const mode = ref<"pending" | "drawn" | "image" | "failed">("pending");
const error = ref("");
const host = ref<HTMLElement>();
const BASE = ":host { display: block; inline-size: fit-content; max-inline-size: 100%; }\nsvg { display: block; max-inline-size: 100%; block-size: auto; }\ntext { font-variant-ligatures: none; }";

let drawing = 0;
async function draw() {
  const run = ++drawing;
  mode.value = "pending";
  try {
    const r = await fetch(new URL(src.value, location.href), { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) throw new Error(`the Local Flow host answered ${r.status} for the diagram`);
    const text = await r.text();
    const drawn: Drawn | undefined = props.a.type === "mermaid" ? await drawMermaid(text, props.a.focus ?? []) : derivePele(text);
    if (run !== drawing) return;
    if (!drawn) {
      mode.value = "image";
      return;
    }
    await nextTick();
    const el = host.value;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `${BASE}\n${drawn.css}`;
    // The host is the image, named by the caption; the drawing's own text and roles stay out of the accessibility tree.
    drawn.svg.setAttribute("aria-hidden", "true");
    keepPlaceNow(() => root.replaceChildren(style, document.adoptNode(drawn.svg)));
    mode.value = "drawn";
  } catch (e) {
    if (run !== drawing) return;
    error.value = (e as Error).message;
    mode.value = "failed";
  }
}
onMounted(draw);
// A live refresh hands over new attachment objects; only other bytes or focus draw again.
watch(() => `${props.a.file}\n${props.a.focus?.join("\n") ?? ""}`, draw);
</script>

<template>
  <img v-if="mode === 'image'" :src="src" :alt="a.caption">
  <p v-else-if="mode === 'failed'" class="unavailable"><span class="label">Diagram unavailable</span> {{ error }}</p>
  <div v-else ref="host" class="diagram" role="img" :aria-label="a.caption" :aria-busy="mode === 'pending'" :data-render="mode" />
</template>
