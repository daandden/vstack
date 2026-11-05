import { mock } from "bun:test";

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
mock.module("@oh-my-pi/pi-tui", () => ({
  Markdown: class {
    constructor(readonly source: string) {}
    render() { return [this.source]; }
    describe() { return { kind: "md", text: this.source }; }
    invalidate() {}
  },
}));
mock.module("@oh-my-pi/pi-tui/theme", () => ({ getMarkdownTheme: () => ({}) }));
mock.module("@oh-my-pi/pi-tui/chrome", () => ({
  OverlayPanel: class {
    children: any[] = [];
    constructor(readonly title: string, readonly nativeRole: string) {}
    addChild(child: any) { this.children.push(child); }
    render(width: number) { return [`╭ ${this.title} ╮`, ...this.children.flatMap(child => child.render(width - 4)), "╰╯"]; }
    describe(cx: unknown) { return { kind: "card", head: this.title, children: this.children.map(child => child.describe(cx)) }; }
    invalidate() {}
  },
}));
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
