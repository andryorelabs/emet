# Roadmap

Direction, not a promise. Shipped work is in [CHANGELOG.md](CHANGELOG.md); decisions are in [docs/adr/](docs/adr/README.md). Open work is tracked as issues on [GitHub](https://github.com/andryorelabs/emet/issues).

## Now

- Hold the repository to the shared standard: toolchain pins, the full lint baseline, repo settings and rulesets as code, and per-file coverage floors.
- Harden the CLI contract: one exit-code map, a `--json` envelope on every command and strict flag parsing.
- Harden releases: signed tags, native smoke runs per binary target, an SBOM and build provenance.
- Harden the Website: a hash-based CSP, quality checks on every site PR and an accessibility gate. See [ACCESSIBILITY.md](ACCESSIBILITY.md).

## Next

- More translations of the guide on the Website, kept in parity by `bun run i18n:status`.
- Contributor docs: where to start, review process and a stability policy.

## Not planned

See the non-goals in [PRODUCT.md](PRODUCT.md).

## Suggesting something

Open an issue, or ask through [SUPPORT.md](.github/SUPPORT.md). Larger changes follow [GOVERNANCE.md](GOVERNANCE.md).
