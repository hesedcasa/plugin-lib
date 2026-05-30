# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Compile TypeScript (clears dist/ first)
npm test               # Run tests with mocha (ts-node, no compile needed)
npm run pre-commit     # format + find-deadcode (the full pre-commit check)
```

Run a single test file:

```bash
npx mocha --forbid-only "test/config.test.ts"
```

## oclif Documentation

Before implementing any oclif-related functionality, fetch current docs:

```bash
sdkck context7 getContext /oclif/core "<your question>"
# e.g. sdkck context7 getContext /oclif/core "how to define flags and args"
```

## oclif CLI Commands

Common `oclif` CLI commands for plugin development (run from a consumer plugin repo, not this library):

```bash
# Scaffold a new command file
oclif generate command {name}
# e.g. oclif generate command auth:add
# e.g. oclif generate command auth:add --commands-dir src/commands

# Scaffold a new hook file
oclif generate hook {name} --event {event}
# events: init | prerun | postrun | command_not_found
# e.g. oclif generate hook validate_auth --event prerun

# Regenerate the oclif manifest (needed after adding/removing commands)
oclif manifest
```

## Testing Documentation

Before writing or modifying tests, fetch current docs for the test stack:

```bash
sdkck context7 getContext /mochajs/mocha "<your question>"
# e.g. sdkck context7 getContext /mochajs/mocha "how to use before/after hooks"

sdkck context7 getContext /chaijs/chaijs.github.io "<your question>"
# e.g. sdkck context7 getContext /chaijs/chaijs.github.io "deep equal assertions"

sdkck context7 getContext /sinonjs/sinon "<your question>"
# e.g. sdkck context7 getContext /sinonjs/sinon "how to stub a method on an object"
```

## Architecture

This is an **oclif plugin library** — a shared utility package consumed by other oclif-based CLI plugins in the Hesed ecosystem. It is not a runnable CLI itself.

### Module layout

<!-- prettier-ignore -->
| File | Responsibility |
|------|---------------|
| `src/config.ts` | `createProfileManager` — reads/writes a JSON config file at `<configDir>/<bin>-config.json`. Supports multi-profile storage (`{ profiles: {...}, defaultProfile: "..." }`) with backward-compat for legacy `{ auth: {...} }` format. |
| `src/auth.ts` | `createAuth*Command` factories — return oclif `Command` subclasses for add/update/delete/list/profile/test auth commands. Callers pass `AuthCommandOptions` (field definitions, `testConnection` fn, `clearClients` fn). |
| `src/api.ts` | `buildAuthHeader` (Bearer vs Basic depending on whether `email` is set), `createApiClient` (singleton factory with lazy init and `clearClients`). |
| `src/format.ts` | `formatAsToon` — thin wrapper around `@toon-format/toon` encoder. |
| `src/index.ts` | Re-exports everything public. |

### Key design patterns

**Auth command factory pattern:** Consumers call `createAuthAddCommand({ fields, serviceName, testConnection, clearClients })` to get a ready-made oclif Command class. `fields` is an array of `FieldDef` objects (name, type, description, optional char/default/required) that drive both CLI flag generation and interactive prompts. If `fields` is omitted, legacy defaults (apiToken, email, host) are used.

**Profile storage format:** Config is stored at `<oclif configDir>/<bin>-config.json`. The current format is `{ profiles: { <name>: <AuthConfig> }, defaultProfile: <name> }`. `createProfileManager` handles migration from the old `{ auth: {...} }` format transparently.

**Generic typing:** `createProfileManager<T>` and `AuthCommandOptions<T>` are generic over the auth config shape so consumers can extend `AuthConfig` with additional fields without losing type safety.

### Testing

Tests use mocha + chai + sinon. No real filesystem access — `fs-extra` methods (`readJSON`, `outputJSON`) are stubbed via sinon sandboxes. Tests are in `test/` and import directly from `src/` (ts-node handles transpilation at test time, so no build step is needed to run tests).
