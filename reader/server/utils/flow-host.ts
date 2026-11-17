import { defineEventHandler, type H3Event } from "h3";
import type { FlowHost } from "#flow/host-entry.ts";

const runtime: { host: FlowHost } = await import(process.env.VSTACK_FLOW_MODULE!);
export const host = runtime.host;
export const flowRequest = (event: H3Event): Request => event.context.flowRequest;
export const flowHandler = (handler: (request: Request) => Response | Promise<Response>) => defineEventHandler(async event => {
  try { return await handler(flowRequest(event)); }
  catch (error) { return host.failure(error); }
});

export const controlHandler = (path: string, methods: readonly string[], handler: (request: Request) => Response | Promise<Response>) =>
  flowHandler(request => new URL(request.url).pathname === path && methods.includes(request.method) ? handler(request) : host.missing());
