# Aegis SDK Reviewer Quality Checklist

This checklist is designed for Aegis SDK maintainers and reviewers to ensure high implementation standards, test reliability, and overall quality before merging any pull request.

## 1. Scope & Acceptance Criteria
- [ ] **Acceptance Criteria Met**: Does the PR directly fulfill all criteria defined in the linked issue?
- [ ] **No Scope Creep**: Are changes strictly focused on the issue without unnecessary refactoring or unrelated edits?

## 2. Implementation & Architecture Quality
- [ ] **Code Quality**: Does the code adhere to project styling, naming conventions, and TypeScript/Rust standards?
- [ ] **Error Handling**: Are errors, edge cases, and unexpected inputs handled gracefully?
- [ ] **SDK API Design**: Are exports, public methods, and signatures backwards-compatible or properly versioned?
- [ ] **Security & Performance**: Are there any exposed secrets, memory leaks, or inefficient operations?

## 3. Test Coverage & Evidence
- [ ] **Unit / Integration Tests**: Are there unit or integration tests covering the new functionality or bug fix?
- [ ] **Test Execution**: Do all existing and newly added tests pass cleanly?
- [ ] **Test Evidence**: Has the author provided command outputs or logs demonstrating test execution?

## 4. CI/CD & Build Verification
- [ ] **CI Pipeline Green**: Are all automated CI checks (linter, build, matrix tests) passing?
- [ ] **Build Check**: Does `npm run build` (or `cargo build`) complete without warnings or errors?

## 5. Documentation & Developer Experience
- [ ] **Docs Updated**: Are inline JSDoc/RustDoc comments and explicit documentation in `docs/` updated?
- [ ] **README Updated**: Is the `README.md` updated if public APIs, usage patterns, or configuration changed?
- [ ] **Changelog / Release Notes**: Are breaking changes or notable updates logged if applicable?
