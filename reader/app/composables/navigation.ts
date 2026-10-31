// Reading position, fragments, and keyboard navigation. A stop is any block or section marked `data-stop`; a reading
// block (`data-block`) is one entry of the Flow-wide sequence. Fragments name element ids; migrated aliases and old
// Stage tab ids resolve to the element that now carries them, and a fragment inside a closed disclosure opens it.
import { flow } from "~/composables/reader";

/** The id of the stop the reader last selected or scrolled to. */
export const current = ref<string>();
/** Whether the Stage tree dialog is open; `t` toggles it. */
export const treeOpen = ref(false);

const shown = (el: Element) => el.getClientRects().length > 0;
export const stops = () => [...document.querySelectorAll<HTMLElement>("[data-stop]")].filter(shown);
const blocks = () => [...document.querySelectorAll<HTMLElement>("[data-block]")].map((el) => el.querySelector<HTMLElement>("[id][data-stop]")).filter((el): el is HTMLElement => !!el && shown(el));

/** The element a fragment id names, with its closed ancestor disclosures opened. */
export function resolve(id: string): HTMLElement | null {
  if (!id) return null;
  let el = document.getElementById(id);
  if (!el) {
    const target = flow.value?.aliases.get(id);
    if (target) el = document.getElementById(target);
  }
  for (let parent = el?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
  return el;
}

function focusOn(el: HTMLElement) {
  if (!el.matches("a[href], button, input, select, textarea, [tabindex]")) el.tabIndex = -1;
  el.focus({ preventScroll: true });
}

export function goTo(id: string, focus: boolean) {
  const el = resolve(id);
  if (!el) return;
  el.scrollIntoView({ block: "start", behavior: "instant" });
  const stop = el.closest<HTMLElement>("[data-stop]");
  if (stop) current.value = stop.id;
  if (focus) focusOn(el);
}

function select(el: HTMLElement | undefined) {
  if (!el) return;
  el.scrollIntoView({ block: "start", behavior: "instant" });
  current.value = el.id;
  history.replaceState(null, "", `#${el.id}`);
  focusOn(el);
}

function step(list: HTMLElement[], by: number) {
  const exact = list.findIndex((el) => el.id === current.value);
  const at = exact >= 0 ? exact : list.findIndex((el) => el.contains(document.getElementById(current.value ?? "")));
  select(list[at < 0 ? (by > 0 ? 0 : list.length - 1) : Math.min(Math.max(at + by, 0), list.length - 1)]);
}

export function markFromScroll() {
  let id: string | undefined;
  const edge = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockStart) || 0) + 2;
  for (const el of stops()) if (el.getBoundingClientRect().top <= edge) id = el.id;
  if (id) current.value = id;
}

/** The element whose on-screen position must survive an update, with that position. */
export function readingAnchor(): { el: HTMLElement; top: number } | undefined {
  const visible = (el: Element | null) => {
    const box = el?.getBoundingClientRect();
    return !!box && box.top < innerHeight && box.bottom > 0;
  };
  const target = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  const selected = current.value ? document.getElementById(current.value) : null;
  const el = visible(target) ? target : visible(selected) ? selected : stops().reverse().find((s) => s.getBoundingClientRect().top <= 0);
  return el ? { el, top: el.getBoundingClientRect().top } : undefined;
}

const editable = (el: EventTarget | null) => el instanceof Element && ((el as HTMLElement).isContentEditable || el.closest("input, textarea, select, video, audio") !== null);

export function onKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || editable(e.target)) return;
  if (e.key === "t") {
    e.preventDefault();
    treeOpen.value = !treeOpen.value;
    return;
  }
  if (treeOpen.value) return;
  if (e.key === "n") {
    const queue = (flow.value?.next ?? []).map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!queue.length) return;
    e.preventDefault();
    const at = queue.findIndex((el) => el.id === current.value);
    select(queue[(at + 1) % queue.length]);
  } else if (e.key === "j" || e.key === "ArrowDown") {
    e.preventDefault();
    step(stops(), 1);
  } else if (e.key === "k" || e.key === "ArrowUp") {
    e.preventDefault();
    step(stops(), -1);
  } else if (e.key === "l" || e.key === "ArrowRight") {
    e.preventDefault();
    step(blocks(), 1);
  } else if (e.key === "h" || e.key === "ArrowLeft") {
    e.preventDefault();
    step(blocks(), -1);
  }
}

/** Follows an in-page link to an alias or to the fragment already in the address bar, which the browser ignores. */
export function onClick(e: MouseEvent) {
  const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const id = decodeURIComponent(a.getAttribute("href")!.slice(1));
  if (!document.getElementById(id) || location.hash === a.getAttribute("href")) {
    e.preventDefault();
    if (location.hash !== `#${id}`) history.pushState(null, "", `#${id}`);
    goTo(id, true);
  }
  treeOpen.value = false;
}
