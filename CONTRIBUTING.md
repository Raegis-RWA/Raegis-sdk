# Contributing to Aegis SDK

We welcome open-source contributions! As middleware, this SDK is critical for the frontend developer experience.

## Development Workflow
1. **Fork & Clone:** Fork the repo and clone it locally.
2. **Install Dependencies:** Run `npm install`.
3. **Branching:** Use `feat/`, `fix/`, or `chore/` prefixes.
4. **Testing:** You MUST write unit tests in `tests/` for any new methods added. PRs without test coverage will be rejected. For predictable SDK responses without live RPC, use the mock client from `@aegis/sdk/testing` (see `docs/testing.md`). Behavior changes should follow the [Test-First Contribution Guide](docs/test-first-contribution.md), including happy-path, negative-path, and no-test justification rules.
5. **Formatting:** Ensure `npm run lint` and `npm run format` pass before opening a PR.
6. **CI Verification:** Run `npm run check` locally to verify that build, unit tests, and runtime compatibility checks pass. PRs with failing GitHub Actions CI checks will not be reviewed or merged until all status checks are green (see [CI Pass Requirements](docs/ci-pass-requirements.md) and [CI Resolution Workflow](docs/ci-resolution-workflow.md)).

Search the codebase for `// TODO:` comments to find areas that need immediate help!

## Pull Request Evidence Checklist

All pull requests **must** follow the evidence checklist defined in the
[PR template](/.github/PULL_REQUEST_TEMPLATE.md). The checklist ensures that
every submission includes:

1. **Issue reference** — a link to the GitHub issue the PR addresses.
2. **Implementation summary** — what changed, why, and which files are affected.
3. **Tests** — new or updated tests (or a written justification if not applicable).
4. **Commands run** — pasted terminal output proving local verification passed.
5. **CI status** — confirmation that all GitHub Actions checks are green.
6. **Acceptance criteria audit** — each criterion from the issue mapped to
   implementation, test, documentation, and status evidence.

For detailed guidance on each item, see
[`docs/pr-evidence-checklist.md`](docs/pr-evidence-checklist.md).
Use the reusable
[`docs/acceptance-criteria-audit.md`](docs/acceptance-criteria-audit.md)
template for criterion-level evidence and incomplete criteria handling.

PRs that do not complete the checklist may be returned for revision before
review begins.

## Payment-Period Conduct

During and after GrantFox evaluation periods, contributors are expected to keep community channels free of repeated payment inquiries. Before raising any concern, self-review your contribution: confirm CI is green, all acceptance criteria are met, and you have checked the GrantFox platform directly for your evaluation status.

See [docs/payment-period-conduct.md](docs/payment-period-conduct.md) for the full conduct guidelines, self-review checklist, and escalation process.

---

## Updating API Reference Documentation

When you add or change a public method on `ComplianceModule`, `AssetModule`, `InvestorModule`, `EventsModule`, or an exported utility/type, update `docs/api-reference.md` (and `docs/investor-portfolio.md` if the investor read model changes; `docs/investor-eligibility.md` if eligibility explanation changes; `docs/contract-events.md` if event decoding changes). Review checklist:

- [ ] The signature block matches the method's actual TypeScript signature (parameter names, types, return type).
- [ ] The Parameters section lists every parameter, including optional ones and their defaults.
- [ ] The Returns section states what the `Promise` resolves to, including any fallback/sentinel values (e.g. `false`, `null`, a fallback object) — not just the "happy path" type.
- [ ] The Errors section lists every distinct throw path in the method body, and states whether it's a raw underlying SDK error, a plain `Error`, or a typed error class (e.g. `PortfolioError`).
- [ ] The example uses only placeholder keys/addresses (`G...`, `C...`, `S...`) — never a real secret key or mainnet contract ID.
- [ ] Anything the source leaves ambiguous, incomplete, or marked with a `// TODO` is called out as an explicit note rather than assumed or omitted.
- [ ] If the change affects compliance/whitelist-gated behavior, the compliance disclaimer at the top of `docs/api-reference.md` still accurately describes it.
- [ ] If the change affects investor eligibility explanations, follow the checklist in `docs/investor-eligibility.md` (all five statuses, safe messages, and no legal guarantee).
- [ ] If the change affects contract event decoding, follow the checklist in `docs/contract-events.md` (edge cases, unknown fallback, and security/compliance assumptions).
