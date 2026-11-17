import { createHash } from "node:crypto";
import { setResponseHeader } from "h3";

export default defineNitroPlugin(nitro => {
  if (import.meta.prerender) return;
  nitro.hooks.hook("render:before", async context => {
    const { host, flowRequest } = await import("../utils/flow-host");
    const request = flowRequest(context.event);
    const response = await host.flow(request.method === "HEAD" ? new Request(request, { method: "GET" }) : request, "shell");
    if (response.status !== 200) {
      context.response = { body: await response.text(), statusCode: response.status, headers: Object.fromEntries(response.headers) };
      return;
    }
    context.event.context.flowPage = await response.json();
    for (const [name, value] of response.headers) setResponseHeader(context.event, name, value);
  });
  nitro.hooks.hook("render:html", (html, { event }) => {
    const page = event.context.flowPage;
    if (!page) return;
    html.head.push(`<meta name="flow-host-generation" content="${page.hostGeneration}"><meta name="flow-reader-generation" content="${page.readerGeneration}">`);
  });
  nitro.hooks.hook("render:response", (response, { event }) => {
    if (!event.context.flowPage) return;
    const hashes = [...String(response.body).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter(([, attributes]) => !/\bsrc\s*=|application\/json/.test(attributes!))
      .map(([, , body]) => `'sha256-${createHash("sha256").update(body!).digest("base64")}'`);
    const policy = String(event.node.res.getHeader("content-security-policy"));
    response.headers ??= {};
    response.headers["content-security-policy"] = policy.replace(/script-src[^;]*/, `script-src 'self' ${hashes.join(" ")}`);
  });
});
