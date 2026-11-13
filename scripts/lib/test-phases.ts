export const BROWSER_TESTS = "tests/**/*.browser.test.ts";
export const READER_PREPARATION = ["candidate-reader-readiness", "candidate-reader-build"] as const;
export const NON_BROWSER = "non-browser";
export const browserPhase = (file: string) => `browser:${file}`;

/** Browser test files under `root`, sorted. */
export const browserTests = (root: string) => Array.from(new Bun.Glob(BROWSER_TESTS).scanSync({ cwd: root })).sort();

/** Every phase a complete `scripts/test.ts` run reports for the checkout at `root`. */
export function requiredTestPhases(root: string): string[] {
  const browsers = browserTests(root);
  return [...(browsers.length ? READER_PREPARATION : []), NON_BROWSER, ...browsers.map(browserPhase)];
}
