## Description

<!-- Provide a concise description of the changes made and the motivation behind them. -->

## Related Issue / Context

<!-- Link any related issues or discussions (e.g. Closes #123, Fixes #456). -->

## Type of Change

- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing behavior to change)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Agent skills update

## Definition of Done (Maintainer Checklist)

Please verify the following before requesting review:

- [ ] **Tests:** New or updated unit tests added in `src/__tests__/`.
- [ ] **Test Execution:** Ran `npm test` and all suites pass cleanly.
- [ ] **Linter:** Ran `npm run lint` and resolved all errors.
- [ ] **CLI Parity:** If any parameter was added or modified in `exportToPptx()`, the equivalent flag is wired into `bin/cli-exporter-core.js` and tested in `src/__tests__/cli-exporter.test.js`.
- [ ] **Changelog:** Added an entry under `## [Unreleased]` in `CHANGELOG.md` following the Keep a Changelog format.
- [ ] **Documentation:** Updated relevant documentation (`Readme.md`, `USAGE.md`, and subpackage READMEs if applicable).
- [ ] **Skills & Whitelists:** If DOM styling, layout, or parameter rules changed, updated `packages/dom-to-pptx-skills/skills/dom-to-pptx-skill/` files (`SKILL.md`, `STYLE_WHITELIST.md`, `VALIDATION.md`).
- [ ] **Packaging Verification:** Verified package builds and exports with `npm pack --dry-run`.
