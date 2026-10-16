import { expect, test } from "bun:test";
import { cleanBrief, preprocessTinyMessage } from "../plugin/extensions/prompt-cleaner.ts";
import catalogFile from "../addon-questions.json";
import { parseAddonCatalog } from "../plugin/extensions/addon-catalog.ts";
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
test("the brief cleaner drops omp's assignment line and squeezes to 10,000 characters", () => {
  const output = cleanBrief("Complete assignment thoroughly:\n\nHEAD " + "x".repeat(600000) + " TAIL");
  expect(output.length).toBe(10_000);
  expect(output.startsWith("HEAD ")).toBe(true);
  expect(output.endsWith(" TAIL")).toBe(true);
  expect(output).toContain("chars omitted");
  const brief = `Role template. ${"Read the code. ".repeat(400)}Task data at the end.`;
  expect(cleanBrief(`Complete assignment thoroughly:\n\n${brief}`)).toBe(brief);
  expect(cleanBrief("Complete assignment thoroughly:\n\nFix the parser ```noise``` <system-reminder>noise</system-reminder> abcdef1234567890")).toBe("Fix the parser abcdef1");
});
test("stored corpus labels name Addon questions", () => {
  expect(samples.prompts.length).toBeGreaterThan(0);
  for (const prompt of samples.prompts) for (const name of [...prompt.expected, ...prompt.allowed]) expect(name in parseAddonCatalog(catalogFile).questions).toBe(true);
});
