<script setup lang="ts">
import { keepPlaceNow } from "~/composables/navigation";
import { derivePele, drawMermaid, type Drawn } from "~/utils/diagram";
import type { Attachment } from "~/utils/flow";

const props = defineProps<{ a: Attachment }>();
const src = computed(() => `assets/${props.a.file}`);
const mode = ref<"pending" | "drawn" | "image" | "failed">("pending");
const error = ref("");
const host = ref<HTMLElement>();
const BASE = ":host { display: block; inline-size: fit-content; max-inline-size: 100%; overflow-x: auto; }\nsvg { display: block; max-inline-size: none; block-size: auto; }\ntext { font-variant-ligatures: none; }";

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
    drawn.svg.setAttribute("aria-hidden", "true");
    drawn.svg.style.removeProperty("max-width");
    keepPlaceNow(() => root.replaceChildren(style, document.adoptNode(drawn.svg)));
    mode.value = "drawn";
  } catch (e) {
    if (run !== drawing) return;
    error.value = (e as Error).message;
    mode.value = "failed";
  }
}
function pan(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
  const el = host.value;
  if (!direction || !el || el.scrollWidth <= el.clientWidth) return;
  event.preventDefault();
  el.scrollLeft += direction * 40;
}
onMounted(draw);
watch(() => `${props.a.file}\n${props.a.focus?.join("\n") ?? ""}`, draw);
</script>

<template>
  <img v-if="mode === 'image'" :src="src" :alt="a.caption">
  <p v-else-if="mode === 'failed'" class="unavailable"><span class="label">Diagram unavailable</span> {{ error }}</p>
  <div v-else ref="host" class="diagram" role="img" :aria-label="a.caption" :aria-busy="mode === 'pending'" :data-render="mode" tabindex="0" @keydown.stop="pan" />
</template>
