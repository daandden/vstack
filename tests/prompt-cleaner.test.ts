import { expect, test } from "bun:test";
import { preprocessTinyMessage } from "../plugin/extensions/prompt-cleaner.ts";
import questions from "../addon-questions.json";
import samples from "../sample-prompts.json";
test("cleaner keeps code-only requests, inline code, tilde fences and unpaired tags", () => {
  expect(preprocessTinyMessage("```const x = 1;``` ")).toBe("```const x = 1;```");
  expect(preprocessTinyMessage("Use `x`, ~~~y~~~ and <Header/>" )).toBe("Use `x`, ~~~y~~~ and <Header/>");
});
test("cleaner bounds raw and clean windows, shortens hashes and preserves both ends", () => {
  const output = preprocessTinyMessage("HEAD " + "x".repeat(600000) + " TAIL");
  expect(output.length).toBe(2000);
  expect(output.startsWith("HEAD ")).toBe(true);
  expect(output.endsWith(" TAIL")).toBe(true);
  expect(output).toContain("chars omitted");
  expect(preprocessTinyMessage("One  two\n\n\nthree abcdef1234567890")).toBe("One two\n\nthree abcdef1");
});
test("stored corpus labels name Addon questions", () => {
  expect(samples.prompts.length).toBeGreaterThan(0);
  for (const prompt of samples.prompts) for (const name of [...prompt.expected, ...prompt.allowed]) expect(name in questions).toBe(true);
});
