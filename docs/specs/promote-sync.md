### Requirement: The sync pull request opens only when main carries content develop lacks

Source: #978 S1

`emet promote` opens a `main` to `develop` sync pull request only when the `develop...main` comparison lists at least one changed file; merge commits alone do not count.

#### Scenario: Only merge commits differ

- **WHEN** `main` is ahead of `develop` by merge commits and the comparison lists no files
- **THEN** no sync pull request opens and `syncPrNumber` is `null`

#### Scenario: Main carries a changed file

- **WHEN** the comparison lists at least one file
- **THEN** the sync pull request opens

### Requirement: The sync pull request merges with the configured merge method

Source: #978 S2

The sync pull request merges with `pr.mergeMethod` (`squash`, `merge` or `rebase`, default `squash`), while the promote pull request keeps a merge commit.

#### Scenario: Squash-only develop

- **WHEN** `pr.mergeMethod` is `squash`
- **THEN** the sync merge call carries `--squash` and the promote merge call carries `--merge`

### Requirement: A skipped sync says why

Source: #978 S3

When no sync opens because only merge commits differ, the outcome and the journaled `promote` event carry a `syncReason` naming that cause.

#### Scenario: No content to bring back

- **WHEN** the comparison lists no files
- **THEN** `syncReason` is "develop already carries the content of main; only merge commits differ" and `syncMerged` is `false`

### Requirement: The promote hold marker lives under the git common directory

Source: #978 S4

`emet promote --spec <id> --hold` writes the marker at `<git common dir>/.emet/runs/<id>/no-promote`, and a spec is held when the marker exists there, at the earlier `promote hold marker` path or at the per-checkout legacy path.

#### Scenario: Hold written

- **WHEN** `--hold` runs
- **THEN** the marker exists at the first path

#### Scenario: Marker from an older emet

- **WHEN** only the earlier path holds a marker
- **THEN** the spec is held
