import { flow } from "~/composables/reader";

export const current = ref<string>();
export const treeOpen = ref(false);
export const tab = ref("overview");

const shown = (el: Element) => el.getClientRects().length > 0;
export const stops = () => [...document.querySelectorAll<HTMLElement>("[data-stop]")].filter(shown);
const tabs = () => [...document.querySelectorAll<HTMLElement>("[data-tab]")].map((el) => el.dataset.tab!);
export const tabOf = (el: Element) => el.closest<HTMLElement>("[data-tab]")?.dataset.tab;

export function resolve(id: string): HTMLElement | null {
  if (!id) return null;
  let el = document.getElementById(id);
  const seen = new Set([id]);
  for (let alias = flow.value?.aliases.get(id); !el && alias && !seen.has(alias); alias = flow.value?.aliases.get(alias)) {
    seen.add(alias);
    el = document.getElementById(alias);
  }
  for (let parent = el?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
  return el;
}

async function reveal(el: HTMLElement) {
  const owner = tabOf(el);
  if (owner && owner !== tab.value) {
    tab.value = owner;
    await nextTick();
  }
}

function focusOn(el: HTMLElement) {
  if (!el.matches("a[href], button, input, select, textarea, [tabindex]")) el.tabIndex = -1;
  el.focus({ preventScroll: true });
}

export function measureHeader() {
  const bar = document.querySelector<HTMLElement>(".bar");
  if (bar) document.documentElement.style.setProperty("--bar", `${bar.offsetHeight}px`);
}

function place(el: HTMLElement) {
  measureHeader();
  el.scrollIntoView({ block: "start", behavior: "instant" });
  keepSelectionAtCurrentScroll();
}

function bringIntoView(el: HTMLElement) {
  const isWholeTab = el.dataset.tab !== undefined;
  const headerBottom = document.querySelector(".bar")?.getBoundingClientRect().bottom ?? 0;
  const startHiddenUnderHeader = el.getBoundingClientRect().top < headerBottom;
  if (!isWholeTab || startHiddenUnderHeader) place(el);
}

export async function goTo(id: string, focus: boolean): Promise<boolean> {
  const el = resolve(id);
  if (!el) return false;
  await reveal(el);
  bringIntoView(el);
  const stop = el.closest<HTMLElement>("[data-stop]");
  if (stop) current.value = stop.id;
  else markFromScroll();
  if (focus) focusOn(el);
  return true;
}

export async function openFirstOpenQuestionTab() {
  const first = flow.value?.next[0];
  const el = first ? document.getElementById(first) : null;
  tab.value = (el && tabOf(el)) ?? "overview";
  await nextTick();
  markFromScroll();
}

async function select(el: HTMLElement | undefined) {
  if (!el) return;
  await reveal(el);
  place(el);
  current.value = el.id;
  history.replaceState(null, "", `#${el.id}`);
  focusOn(el);
}

function step(list: HTMLElement[], by: number) {
  const exact = list.findIndex((el) => el.id === current.value);
  const at = exact >= 0 ? exact : list.findIndex((el) => el.contains(document.getElementById(current.value ?? "")));
  void select(list[at < 0 ? (by > 0 ? 0 : list.length - 1) : Math.min(Math.max(at + by, 0), list.length - 1)]);
}

function switchTab(by: number) {
  const ids = tabs();
  const next = ids[Math.min(Math.max(ids.indexOf(tab.value) + by, 0), ids.length - 1)];
  if (!next || next === tab.value) return;
  history.replaceState(null, "", `#${next}`);
  void goTo(next, true);
}

let scrollThatKeepsSelection: number | undefined;
function keepSelectionAtCurrentScroll() {
  scrollThatKeepsSelection = scrollY;
}
export function markFromScroll() {
  let id: string | undefined;
  const edge = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockStart) || 0) + 2;
  for (const el of stops()) if (el.getBoundingClientRect().top <= edge) id = el.id;
  if (id) current.value = id;
}

/** A stop near the end of a tab cannot scroll to the top, so the scroll that placed it must not hand the selection to an earlier stop. */
export function onScroll() {
  if (scrollThatKeepsSelection !== undefined && Math.abs(scrollY - scrollThatKeepsSelection) < 1) return;
  scrollThatKeepsSelection = undefined;
  markFromScroll();
}

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

export function restoreReadingAnchor(anchor: ReturnType<typeof readingAnchor>) {
  if (!anchor?.el.isConnected) return;
  const moved = anchor.el.getBoundingClientRect().top - anchor.top;
  if (Math.abs(moved) >= 0.5) {
    scrollBy({ top: moved, behavior: "instant" });
  }
  keepSelectionAtCurrentScroll();
}

export function keepPlaceNow(change: () => void) {
  const anchor = readingAnchor();
  change();
  restoreReadingAnchor(anchor);
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
    void select(queue[(at + 1) % queue.length]);
  } else if (e.key === "j" || e.key === "ArrowDown") {
    e.preventDefault();
    step(stops(), 1);
  } else if (e.key === "k" || e.key === "ArrowUp") {
    e.preventDefault();
    step(stops(), -1);
  } else if (e.key === "l" || e.key === "ArrowRight") {
    e.preventDefault();
    switchTab(1);
  } else if (e.key === "h" || e.key === "ArrowLeft") {
    e.preventDefault();
    switchTab(-1);
  }
}

export function onClick(e: MouseEvent) {
  const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const id = decodeURIComponent(a.getAttribute("href")!.slice(1));
  if (!document.getElementById(id) || location.hash === a.getAttribute("href")) {
    e.preventDefault();
    if (location.hash !== `#${id}`) history.pushState(null, "", `#${id}`);
    void goTo(id, true);
  }
  treeOpen.value = false;
}
