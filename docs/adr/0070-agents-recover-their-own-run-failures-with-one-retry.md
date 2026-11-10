# Agents recover their own run's failures with one retry

32 of the user's 414 touches in the newest vstack sessions unblocked an infrastructure failure, such as a Flow question the picker lost, a Verifier clone that lacked inputs, or ovnfs daemon trouble. Now an agent repairs what its own run owns and retries the failed step once. It may start the Local Flow host when none is running, restart a host that this run started in its own isolated `--home` namespace, republish and ask again a question the picker lost, rebuild a Verifier's clone inputs, or read branch state again. It stops for the user when recovery would restart something other sessions share, such as the normal Local Flow host, which serves every session of the operating-system user, the ovnfs daemon, or global omp settings. It also stops when recovery would weaken proof or acceptance, or when the retry fails. The stop shows what was tried. A missing answer is still never consent, and while an answer is pending the agent waits as before.

## Considered Options

- Retry twice. The user asked for one retry.
- Also restart shared services. A restart can break checkouts in the user's other running sessions.
- Start independent work before an ask, or proceed with the recommendation after a timeout. The user chose to keep waiting.
