import { createSharedComposable, formatTimeAgoIntl, useIntervalFn } from "@vueuse/core";

const sharedClock = createSharedComposable((initial: number) => {
  const now = shallowRef(initial);
  useIntervalFn(() => { now.value = Date.now(); }, 60_000);
  return now;
});

export function useReadingClock() {
  return sharedClock(useState("flow-reading-clock", () => Date.now()).value);
}

export function readingAge(time: number, now: number): string | undefined {
  if (!Number.isFinite(time)) return;
  if (Math.abs(time - now) < 60_000) return "just now";
  return formatTimeAgoIntl(new Date(time), { locale: "en", relativeTimeFormatOptions: { numeric: "always" } }, now);
}
