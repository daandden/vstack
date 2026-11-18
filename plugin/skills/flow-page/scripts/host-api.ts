import type { QuestionView, View } from "./model.ts";
import type { Runtimes } from "./live.ts";
export type { Observations } from "./observations.ts";
export type { Comments } from "./comments.ts";
export type { Learning } from "./learning.ts";

export type Content = Omit<View, "questions"> & { questions: QuestionView[]; runtimes: Runtimes };
export type Versions = { revision: number; observationVersion: string; hostGeneration: string; readerGeneration: string };
export type PickerPresence = { key: string; flow: string; stage: string; session: string; picker: string; questions: string[]; expires: number };
export type Presence = { presences: PickerPresence[] };
export type HostError = { error: string };

