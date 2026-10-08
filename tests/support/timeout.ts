import { setDefaultTimeout } from "bun:test";

// Process tests start real `omp`, `git`, and `bun` processes; under load they pass 5 s.
setDefaultTimeout(30_000);
