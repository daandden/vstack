import { mock } from "bun:test";

/** What the fake omp returns for the `smol` role and for each pi-ai completion. Tests set these. */
export const smol: {
  role: { model?: { provider: string; id: string; api: string; baseUrl: string }; thinkingLevel?: string };
  complete: (model: unknown, context: any, options: any) => Promise<unknown>;
} = {
  role: {},
  complete: async () => { throw new Error("No fake smol response"); },
};

/** One judgment that the extension sent through the candidate of omp's judge chain. */
export interface JudgeCall {
  request: { state: any; questions: Record<string, any> };
  /** The signal passed to the candidate's judge call. */
  signal?: AbortSignal;
  /** The signal passed to withCandidate. */
  chainSignal?: AbortSignal;
  /** The deps passed to resolveJudge. */
  deps: any;
}

/**
 * The fake judge chain of `@oh-my-pi/pi-coding-agent/judgment`. `kind` is the backend kind that withCandidate reports.
 * `respond` answers each candidate judge call. Tests set these and read `calls` and `resolved`.
 */
export const judge: {
  kind: string;
  respond: (request: JudgeCall["request"], signal?: AbortSignal) => Promise<unknown>;
  calls: JudgeCall[];
  resolved: any[];
  journaled: unknown[];
} = {
  kind: "native",
  respond: async () => { throw new Error("No fake judge response"); },
  calls: [],
  resolved: [],
  journaled: [],
};

/** Resets the fake judge to a native backend that answers each question with the given P(yes). */
export function judgeAnswers(scores: Record<string, number>): void {
  judge.kind = "native";
  judge.calls = [];
  judge.resolved = [];
  judge.journaled = [];
  judge.respond = async () => ({ answers: Object.fromEntries(Object.entries(scores).map(([name, noul]) => [name, { type: "noul", noul }])) });
}

const judgmentCache = { name: "shared judgment cache" };

mock.module("@oh-my-pi/pi-coding-agent", () => ({ settings: {} }));
mock.module("@oh-my-pi/pi-coding-agent/judgment", () => ({
  hasNativeJudge: (_settings: unknown, registry: any) => registry.nativeJudge,
  journalJudgmentUsage: (sessionManager: unknown) => {
    judge.journaled.push(sessionManager);
    return () => {};
  },
  sharedJudgmentCache: () => judgmentCache,
  resolveJudge: (deps: any) => {
    judge.resolved.push(deps);
    return {
      withCandidate: async (fn: (candidate: unknown, kind: string) => Promise<unknown>, options: { signal?: AbortSignal } = {}) => {
        const candidate = {
          judge: (request: JudgeCall["request"], callOptions: { signal?: AbortSignal } = {}) => {
            judge.calls.push({ request, signal: callOptions.signal, chainSignal: options.signal, deps });
            return judge.respond(request, callOptions.signal);
          },
        };
        return fn(candidate, judge.kind);
      },
    };
  },
}));
mock.module("@oh-my-pi/pi-coding-agent/config/model-resolver", () => ({
  getModelMatchPreferences: () => ({}),
  resolveModelRoleValue: (spec: string) => (spec === "@smol" ? smol.role : {}),
}));
mock.module("@oh-my-pi/pi-ai", () => ({ completeSimple: (model: unknown, context: unknown, options: unknown) => smol.complete(model, context, options) }));
