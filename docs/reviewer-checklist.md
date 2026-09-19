# Pull Request Reviewer Checklist

This document provides a comprehensive reviewer checklist for Pull Requests submitted to the **Aegis SDK** repository (`@axionvera/aegis-sdk`).

Maintainers and reviewers should use this guide to ensure high standards of quality, security, performance, and documentation consistency before approving and merging any contribution.

---

## 📋 Quick Checklist Overview

- [ ] **1. Code Implementation & Quality**
- [ ] **2. Unit Tests & Coverage**
- [ ] **3. CI & Build Compatibility**
- [ ] **4. Documentation & API Reference**
- [ ] **5. Security, Compliance & Safety**
- [ ] **6. Acceptance Criteria & Final Verification**

---

## 1. Code Implementation & Quality

- **TypeScript Standards:** Code strictly adheres to TypeScript guidelines with clear type definitions, avoiding `any` or loose typing unless explicitly justified.
- **API Contracts:** Function signatures, return types, and module exports match existing design patterns without breaking public contracts unintentionally.
- **Code Organization & Formatting:** Follows repository structure (`src/`, `docs/`, `tests/`) and satisfies `npm run lint` and `npm run format`.
- **Error Handling:** Exceptions are typed where appropriate (e.g., `PortfolioError`) and throw paths handle unexpected states without silent failures or swallowing errors.
- **Side Effects & State:** Local state transitions and Soroban contract calls do not introduce unintended side effects on main loop execution.

---

## 2. Unit Tests & Coverage

- **Test Coverage:** All new or updated public methods and modules include comprehensive unit tests under `tests/`.
- **Mock Client Usage:** Tests leverage `@aegis/sdk/testing` mock capabilities for deterministic Soroban/Stellar network tests without live RPC dependencies (see [`docs/testing.md`](testing.md)).
- **Edge Cases & Failure Paths:** Tests cover network failures, unauthorized address calls, fallback/sentinel values, and invalid parameters.
- **Test Suite Execution:** All tests pass cleanly when running `npm test`.

---

## 3. CI & Build Compatibility

- **Release Gate Validation:** Running `npm run check` succeeds locally, including:
  - TypeScript compilation (`npm run build`).
  - Unit test suite execution (`npm test -- --runInBand`).
  - Runtime compatibility check (`npm run test:compat`) across target environments.
- **CI Workflow Alignment:** PR satisfies GitHub Actions workflows (e.g. Node 20 & 22 matrix check in `.github/workflows/runtime-compatibility.yml`).
- **Dependencies:** No unnecessary third-party dependencies are added. `package.json` updates are justified and lockfiles are clean.

---

## 4. Documentation & API Reference

- **API Reference Updates:** If public SDK methods or types are added or modified, [`docs/api-reference.md`](api-reference.md) is updated according to the guidelines in [`CONTRIBUTING.md`](../CONTRIBUTING.md#updating-api-reference-documentation):
  - [ ] Signature block matches TypeScript signature.
  - [ ] Parameters section lists all parameters and defaults.
  - [ ] Returns section documents resolved `Promise` types including fallback values.
  - [ ] Errors section lists distinct throw paths.
  - [ ] Examples use sanitised placeholder keys (`G...`, `C...`, `S...`).
- **README & Guides:** Related documentation files (e.g., `README.md`, `docs/role-discovery.md`, `docs/release-checklist.md`) are updated to reflect behavior changes.
- **Deprecations:** Deprecated exports use `@deprecated` JSDoc annotations and runtime dev warnings.

---

## 5. Security, Compliance & Safety

- **Secret Key Protection:** Secret keys or private seeds (`S...`) are NEVER committed to version control or hardcoded in tests/examples. Any example that constructs a `Keypair` for a signing/write operation must load it from an environment variable or secret manager (e.g. `Keypair.fromSecret(process.env.AEGIS_ISSUER_SECRET!)`), not a literal string, and must carry an explicit "never hardcode a real secret" warning comment.
- **Admin/Privileged Examples Are Labelled:** Any example demonstrating `mint`, `transfer`, or another operation that requires issuer/admin authority on the contract must be visibly marked as privileged (e.g. a `⚠️ Privileged operation` note) so it isn't mistaken for a safe default to copy into a read-only context. See the README's [Quickstart](../README.md#quickstart) (read-only, no keypair) vs. [Privileged Operations](../README.md#privileged-operations-admin--issuer) split for the pattern to follow.
- **RPC Request Shape:** Examples and source that call `simulateTransaction` pass a built `Transaction` (via `Account` + `TransactionBuilder`, see `src/utils/simulation.ts`) directly — never a bare contract-call operation or a `{ transaction: ... }` wrapper object cast through `as any`.
- **RWA Protocol Compliance:** Compliance and whitelist-gated behaviors (e.g., KYC checks, transfer restrictions) maintain security guarantees and accurate disclaimers.
- **Input Validation:** Public endpoints validate user inputs (public keys, contract IDs, transaction parameters) prior to RPC invocation.
- **Examples Audit Trail:** `README.md`, `docs/migration-guide.md`, and `examples/migration/*.ts` are the current canonical examples reviewed against the criteria above (see issue #66). When adding a new example, review it against this list before merging.

---

## 6. Acceptance Criteria & Final Verification

- **PR Description:** The PR description clearly explains *what* was changed, *why* it was changed, and references applicable GitHub Issues (e.g., `Closes #XX`).
- **Clean Git History:** Commits are clear, descriptive, and squashed or structured cleanly.
- **Final Pre-Flight Check:** Maintainer has verified:
  ```bash
  npm run lint
  npm run check
  ```
