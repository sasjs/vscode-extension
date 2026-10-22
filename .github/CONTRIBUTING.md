# Contributing

Contributions to the SASjs VS Code extension are warmly welcomed. This guide covers getting it running, the layout of the code, what CI enforces, and how a release is cut.

For using the extension, see the [README](../README.md). For the linting engine itself, see [sasjs/lint](https://github.com/sasjs/lint).

## Bootstrap

Lifecycle scripts are disabled on install (`.npmrc` sets `ignore-scripts=true`, so no dependency `postinstall` runs automatically). Node 22 or later is required, declared as `engines.node` in `package.json` and pinned by `.nvmrc` for `nvm use`. After cloning, bootstrap once with:

```bash
npm ci
npm run setup
```

`npm run setup` generates the SAS snippets (`degit` + `npx sasjs snippets`) and wires the local git hooks. Snippets are gitignored, so a fresh clone has none until this runs - CI runs the same step after `npm ci`.

The extension itself needs VS Code 1.96 or later (`engines.vscode`).

## Run and debug the extension

```bash
npm run esbuild-watch    # bundle src/ into out/, rebuild on change
```

Press `F5` to launch an Extension Development Host with the extension loaded, then run any command from the palette (`Ctrl+Shift+P`, type `SASjs`). Reload the host window with `Ctrl+R` to pick up a rebuild; set breakpoints in `src/` and read the debug console for output.

`npm run vscode:prepublish` is the production build: `build.ts` bundles with esbuild and stages what the packaged extension needs next to `out/extension.js` - the Doxygen layout and the SAS language server's node tree, which is spawned over IPC on activation. A change that only works after a full build (rather than `esbuild-watch`) usually means something was added to that staging step.

`npm run compile` runs `tsc` for type checking and for the integration test harness, which loads compiled output.

## Where things live

- `src/extension.ts` - activation; registers the commands.
- `src/commands/` - one folder per command group: `execute-code`, `format`, `docs`, `compileBuildDeploy`, `sync-directories`, the target commands, and `addRemoveComment`.
- `src/lint/` - the linter integration (`lint.ts`), which drives the Problems panel.
- `src/commands/format/FormatCommand.ts` - registers the SAS document formatting provider that format-on-save calls.
- `src/languageServer/` - staging and spawning the language server.
- `src/doxy/` - Doxygen doc generation.
- `src/syntaxes/` - the TextMate grammar and language configuration.
- `src/utils/` - shared helpers, including `getLintConfig.ts` for configuration precedence.
- `src/test/` - the integration harness; `src/__mocks__/` - jest mocks.
- `build.ts` - the esbuild bundle and the `out/` staging step.
- `package.json` - the manifest: commands, keybindings, menus, configuration, grammars, snippets.

## Tests

Two different harnesses, and only one of them is the CI gate:

```bash
npm run test:unit    # jest over src/**/*.spec.ts, with coverage - this is what CI runs
npm test             # the VS Code integration harness (node ./out/test/runTest.js)
```

`npm run test:unit` is fast and needs no editor. `npm test` compiles first (`pretest` runs `compile` and `lint`) and then drives a real VS Code instance, so it is slower and is the right tool when behaviour depends on the editor API rather than on a pure function.

There is **no enforced coverage threshold**: `jest.config.js` keeps `coverageThreshold` commented out. Write the tests a change needs rather than relying on a gate to catch their absence.

When changing lint behaviour, the specs under `src/lint/` and `src/commands/format/` are the ones that pin it.

## Lint and style

```bash
npm run lint    # eslint src
```

ESLint configuration lives in `eslint.config.mjs` and `.eslintrc.json`; `.prettierrc` holds formatting settings for your editor, but Prettier is not a project dependency and there is no `npm run prettier` - format with your editor if it is configured, and keep the diff to the change you are making.

## Dependencies

`.npmrc` sets `save-exact=true` as well as `ignore-scripts=true`, so dependencies are pinned exactly rather than by range. Keep it that way: a lockfile churn PR that also widens ranges is hard to review.

The `@sasjs/*` packages (`adapter`, `cli`, `lint`, `sas-language`, `utils`) are pinned to RELEASED versions on npm. Never point one at a git branch, a local path or an unreleased version - `npm ci` in CI installs from the registry and will fail, and the extension would ship against something nobody else can reproduce. When you bump one, bump them together, then run `npm run test:unit` and `npm run vscode:prepublish` before pushing.

Note that a feature added to `@sasjs/lint` only appears in this extension once this repo bumps that dependency: the published lint version is what users get.

The release toolchain is deliberately separate: `release/package.json` carries its own lockfile and is installed with `npm ci --prefix release`. It holds `semantic-release` and the VSCE plugin so their advisories never enter the extension package's `npm audit`.

## Git hooks

The repo ships hooks in `.git-hooks/`:

- `pre-commit` - scans staged changes for secrets with gitleaks
- `commit-msg` - checks the commit message is a [Conventional Commit](https://www.conventionalcommits.org/en/v1.0.0/#summary)

`npm run setup` points git at them. If you skipped `setup`, or your commits are not being checked, run:

```bash
git config core.hooksPath ./.git-hooks
```

The pre-commit hook needs the `@nogoo9/gitleaks` devDependency installed, so make sure `npm ci` has run before your first commit.

## CI and releasing

`run-tests.yml` runs: a production-scoped `npm audit --omit=dev --audit-level=low`, `release/audit.mjs`, `npm ci`, a full-history gitleaks scan, `npm run setup`, `npm run lint`, `npm run test:unit` and `npm run vscode:prepublish`. The gitleaks step is the reason its checkout sets `fetch-depth: 0` - a depth-1 tree would scan only the head commit. `run-tests-windows.yml` is a portability check rather than a second gate: it runs `npm ci`, `npm run setup`, `npm run test:unit` and `npm run vscode:prepublish` only, so audit, lint and the secret scan are the Linux job's work. Green CI is the merge bar; the local hooks are convenience.

Merging to `main` runs `publish.yml`: `npm ci`, `npm run setup`, `npm run vscode:prepublish`, `npm audit signatures`, `release/audit.mjs`, `npm ci --prefix release`, then `semantic-release` with `semantic-release-vsce`, which packages the `.vsix`, attaches it to the GitHub release and publishes it.

Only `feat:`, `fix:` and `perf:` commits cut a release - a `docs:` or `chore:` PR publishes nothing, which is correct rather than a failure. Because the repo squash-merges, the PR TITLE decides the version, so keep it conventional and judge the type by what users see.

## The lint integration

Diagnostics come from `@sasjs/lint` reading the open document as text; the language server reports none of its own. Both this extension's formatter and the language server's formatting are registered for SAS, and VS Code's default-formatter setting picks between them.

Lint configuration is resolved in this order (`src/utils/getLintConfig.ts`):

1. `.sasjslint` in the project root
2. `~/.sasjslint`
3. the `sasjs-for-vscode.lintConfig` setting - used only when neither file can be read
4. the built-in defaults from `@sasjs/lint`

The extension setting is a fallback rather than a layer: if either `.sasjslint` file exists, the setting is not consulted.
