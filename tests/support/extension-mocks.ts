import { mock } from "bun:test";
mock.module("@oh-my-pi/pi-coding-agent", () => ({ settings: {} }));
mock.module("@oh-my-pi/pi-coding-agent/judgment", () => ({ hasNativeJudge: (_settings: unknown, registry: any) => registry.nativeJudge }));
