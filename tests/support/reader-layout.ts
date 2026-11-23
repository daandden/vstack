import type { Page } from "playwright-core";

export function useWideReaderFont(page: Page) {
  return page.addStyleTag({ content: `
    @font-face {
      font-family: "Wide reader";
      src: local("Verdana"), local("DejaVu Sans");
      size-adjust: 125%;
    }
    :root {
      --font-sans: "Wide reader", monospace !important;
      --font-heading: var(--font-sans) !important;
      letter-spacing: 0.06em;
    }
  ` });
}

export function waitForReaderLayout(page: Page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    // Let ResizeObserver measure the new layout and Vue render the packed bar.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}
