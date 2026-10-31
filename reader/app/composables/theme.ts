// The reader follows the system color scheme until the reader picks Light (Catppuccin Latte) or Dark (Catppuccin
// Mocha). The pick is kept in this browser; System clears it.
export type Theme = "system" | "light" | "dark";
const KEY = "flow-reader:theme";

export const theme = ref<Theme>("system");

function apply(t: Theme) {
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function startTheme() {
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  theme.value = saved === "light" || saved === "dark" ? saved : "system";
  apply(theme.value);
  watch(theme, (t) => {
    apply(t);
    try {
      if (t === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {}
  });
}
