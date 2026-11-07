# Change notes replace per-PR plugin versions

Every change under `plugin/` used to raise `plugin/package.json` and move its CHANGELOG lines under a new dated heading in the same PR. With several delivery sessions open at once, two PRs claimed the same version, and whichever landed second conflicted on those lines. Resolving it meant a base merge, a new version, the full maintainer gates, a fresh Verifier because the patch id changed, and CI again. Between 11-01 and 11-06, 13 post-open base updates touched the version or CHANGELOG. Each loop cost 9 to 45 minutes, and n concurrent PRs could pay up to n(n-1)/2 loops. Now each Update or Hand edit adds its own Change note, which records its version level, and CI requires a note in place of a higher version. A maintainer-run Plugin release folds the pending notes into CHANGELOG and raises the version once, through a normal PR. The version has had no runtime consumer since [ADR 0005](0005-install-by-plugin-link-from-a-clone.md) moved installs to `git pull` of a linked clone, so a version that lags behind main costs only CHANGELOG freshness.

## Considered Options

- Keep a Plugin release in every PR and make collisions cheaper with a scripted version change and Verdict reuse for differences limited to Plugin releases. Each collision would still rerun gates and CI, and the merge commits stay.
- Append to `## [Unreleased]` with a `merge=union` attribute. GitHub's server-side merge ignores `.gitattributes` merge drivers, so adjacent appends still conflict.
- Cut a Plugin release in a GitHub Actions job on every push to main. Rejected for a bot commit per landing, a job with `contents: write`, and a Plugin release commit that `check-register` never checks.
- Fold notes only into the next Update. Hand edits would have no version until an Update, whose cadence is not fixed.
- Let ship cut the Plugin release after landing. ship serves every project that installs vstack, and this rule belongs to the vstack repo alone.

## Consequences

- `check-register`'s `no-version-bump` class is replaced by a check that a `plugin/` change carries a Change note. A Plugin release consumes exactly the notes pending at the commit it was prepared on, once, and raises the version by the highest level among them. A note that lands while the Plugin release PR is open stays pending for the next Plugin release, so a Plugin release never needs preparing again and never deletes a note it did not fold.
- `vstack-maintain prepare` writes a Change note instead of the version and CHANGELOG heading. `docs/maintainer.md` describes the Plugin release command.
- Source conflicts and concurrent ADR numbers still collide; they are resolved when they happen.
