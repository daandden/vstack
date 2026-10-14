import { mock } from "bun:test";

/** What the fake omp returns for the `smol` role and for each pi-ai completion. Tests set these. */
export const smol: {
  role: { model?: { provider: string; id: string; api: string; baseUrl: string }; thinkingLevel?: string };
  complete: (model: unknown, context: any, options: any) => Promise<unknown>;
} = {
  role: {},
  complete: async () => { throw new Error("No fake smol response"); },
};

mock.module("@oh-my-pi/pi-coding-agent", () => ({ settings: {} }));
mock.module("@oh-my-pi/pi-coding-agent/judgment", () => ({ hasNativeJudge: (_settings: unknown, registry: any) => registry.nativeJudge }));
mock.module("@oh-my-pi/pi-coding-agent/config/model-resolver", () => ({
  getModelMatchPreferences: () => ({}),
  resolveModelRoleValue: (spec: string) => (spec === "@smol" ? smol.role : {}),
}));
mock.module("@oh-my-pi/pi-ai", () => ({ completeSimple: (model: unknown, context: unknown, options: unknown) => smol.complete(model, context, options) }));
