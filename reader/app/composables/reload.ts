const captures = new Map<string, () => unknown>();
let restored: Record<string, unknown> | undefined;
const key = () => `flow-reader:reload:${location.pathname}`;

export function readReloadState(name: string): unknown {
  if (!import.meta.client) return;
  if (!restored) {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(key()) ?? "null");
      restored = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    } catch { restored = {}; }
  }
  return restored[name];
}

export function onReaderReload(name: string, capture: () => unknown) {
  onMounted(() => { captures.set(name, capture); });
  onBeforeUnmount(() => { captures.delete(name); });
}

export function reloadReader() {
  const saved = Object.fromEntries([...captures].map(([name, capture]) => [name, capture()]));
  sessionStorage.setItem(key(), JSON.stringify(saved));
  location.reload();
}

export function finishReaderRestore() {
  sessionStorage.removeItem(key());
}
