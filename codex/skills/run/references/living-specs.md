# Living specs

Read this on a spec's last wave when `specs.enabled` is true, after merging the worker
branches and before `emet assess`. Write requirement deltas from the spec's S# items, merge them
and commit the result on the integration branch.

1. Run `emet spec-merge --spec <id> --deltas-dir`; it prints the directory for the deltas.
2. Write one file per area there, `<area>.md`. Read the current `<specs.dir>/<area>.md` first to
   decide whether each requirement is ADDED, MODIFIED or REMOVED.
3. Use only these sections, each holding requirements and their scenarios:

   ```
   ## ADDED Requirements
   ## MODIFIED Requirements
   ## REMOVED Requirements

   ### Requirement: <descriptive name>
   Source: #<spec> S<n>

   #### Scenario: <name>
   ```

4. Never use `S<n>` as a requirement or scenario name; name it descriptively and give the S# in
   the `Source: #<spec> S<n>` line of the body.
5. A MODIFIED requirement keeps every existing scenario name.
6. Run `emet spec-merge --spec <id>`, then commit `specs.dir` with exactly
   `docs: 📝 update living specs for spec #<id>`.
7. On exit 1 (a conflict or a lost scenario; nothing was written) fix the deltas once and rerun.
   If it fails again, land without the update and flag it in the report.
