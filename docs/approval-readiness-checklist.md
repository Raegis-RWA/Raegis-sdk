# Aegis SDK Issue Approval Readiness Checklist

> Use this checklist before considering an issue ready for maintainer evaluation,
> GrantFox campaign evaluation, or payment review.
>
> **A merged pull request is still subject to evaluation.** Merge confirms that a
> maintainer accepted the repository change — it does not automatically prove reward
> eligibility, campaign completion, or payment readiness.

---

## 1. Implementation Completeness

- [ ] Every behavior described in the issue is addressed in the PR diff.
- [ ] Each acceptance criterion from the linked issue is either satisfied or explicitly deferred with a follow-up issue reference.
- [ ] The PR scope matches the issue — no unrelated refactors, formatting fixes, or feature additions are bundled in.
- [ ] Changed files are listed in the PR description with a short explanation of what each one contributes.
- [ ] No placeholder logic, `TODO` comments, or stub implementations are left behind without a documented follow-up path.

---

## 2. Testing Expectations

- [ ] Every new or changed runtime behavior has at least one focused unit test covering the happy path.
- [ ] At least one meaningful failure path or edge case is tested for each behavior change.
- [ ] Tests use the `@aegis/sdk/testing` mock client for Soroban/Stellar interactions — live RPC is not required to run the suite.
- [ ] Test descriptions describe the scenario, not just "should work" or "returns a value."
- [ ] Docs-only, metadata-only, and comment-only changes include a written no-test justification in the PR description.
- [ ] `npm run verify` passes locally, or the PR explains why a narrower command (`npm test`, `npm run check`) is sufficient.

---

## 3. CI Status Expectations

- [ ] All required GitHub Actions checks are green on the PR's head commit.
- [ ] The Node 20 and Node 22 matrix jobs in `.github/workflows/runtime-compatibility.yml` both pass.
- [ ] If any check is failing due to an unrelated external issue (e.g., a flaky network probe), the PR description links to the failing job URL and explains why it is not caused by this change.
- [ ] TypeScript compilation (`npm run build`) succeeds with no errors.
- [ ] Lint and format checks (`npm run lint`, `npm run format`) produce no new violations.
- [ ] Runtime compatibility probes (`npm run test:compat`) pass for all supported environments.

---

## 4. Acceptance Criteria Review

- [ ] The PR description reproduces every acceptance criterion from the linked issue.
- [ ] Each criterion is individually checked off with the specific file path, test name, or documentation section that satisfies it.
- [ ] An [acceptance criteria traceability table](acceptance-criteria-traceability.md) is included, mapping each criterion to SDK modules, tests, docs, and behaviour verification.
- [ ] Criteria that were out of scope are marked deferred with a reason and a follow-up issue number.
- [ ] No criterion is marked complete based solely on documentation unless the issue explicitly asks for documentation.

---

## 5. Documentation

- [ ] Public SDK behavior changes are reflected in `docs/api-reference.md` with updated signatures, parameters, return types, and examples.
- [ ] New contributor-facing workflows, processes, or concepts are documented under `docs/`.
- [ ] `README.md` is updated if the change introduces new top-level capabilities or changes the contributor workflow.
- [ ] Deprecated exports use `@deprecated` JSDoc annotations.
- [ ] Links in all modified or newly created docs are valid (no broken internal references).

---

## 6. Known Limitations

- [ ] Any edge case intentionally excluded from scope is documented in the PR description or as a reviewer note before merge.
- [ ] Compatibility constraints (runtime environments, Stellar network versions, Soroban protocol versions) are listed if relevant.
- [ ] Follow-up issues are opened and linked for work that is deferred rather than silently dropped.

---

## Contributor Self-Review Summary

Before requesting review, confirm all of the following:

- [ ] The PR uses `Closes #<issue>` in the description, or explains partial scope with `Relates to #<issue>`.
- [ ] Acceptance criteria are copied into the PR description and checked one by one.
- [ ] Tests cover the expected behavior and at least one meaningful negative path.
- [ ] `npm run verify` passed locally (or the narrower command is justified).
- [ ] All CI checks are green, or unrelated failures are linked and explained.
- [ ] Known limitations, compatibility notes, and follow-up issues are listed.

---

## Merged Does Not Mean Evaluated

A merge confirms that a maintainer accepted the repository change. It does **not** automatically prove:

- Reward eligibility under the current GrantFox campaign.
- Campaign completion or payment readiness.
- That all acceptance criteria were satisfied at review time.

Evaluation after merge may still consider whether:

1. The issue was assigned or eligible under campaign rules.
2. The PR closed the issue's acceptance criteria — not just nearby docs or code.
3. Test and CI evidence was present at the time of review.
4. Follow-up fixes were required after merge.
5. Submitted evidence is public, durable, and straightforward to verify.

**A clean merge history is not a substitute for meeting acceptance criteria.**

---

## Related Documentation

- [Issue Approval Readiness](issue-approval-readiness.md) — companion checklist with per-area evidence guidelines
- [Pull Request Evidence Checklist](pr-evidence-checklist.md)
- [Pull Request Reviewer Checklist](reviewer-checklist.md)
- [Test-First Contribution Guide](test-first-contribution-guide.md)
- [CI Pass Requirements](ci-pass-requirements.md)
- [Acceptance Criteria Traceability](acceptance-criteria-traceability.md)
- [Verification Command](verification.md)
- [Contributor Evaluation Policy](contributor-evaluation-policy.md)
