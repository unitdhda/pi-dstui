# tui

Rich, interactive terminal UI components for pi agents — defined in a small Lisp DSL, persisted to disk, and rendered as full-screen overlays on demand.

Most agent interactions collapse to text: the agent asks a question, you type an answer, and both sides guess at structure. `tui` replaces that back-and-forth with purpose-built input widgets. Instead of typing `"option 2"` in response to a numbered list, you navigate a radio picker. Instead of describing a number with a note about the valid range, you turn a rotary dial. The agent gets a typed value; you get a clear, keyboard-driven UI.

This makes `tui` a single replacement for question-prompt plugins, checklist plugins, checkbox plugins, and any other extension whose job is structured input — while keeping the entire widget definition inside the conversation context as a tiny Lisp source file.

---

## Install

```sh
pi install npm:tui
```

Or for a project-local install:

```sh
pi install -l npm:tui
```

After install, pi loads the extension automatically. No configuration needed.

---

## Use cases

### Confirmation dialogs

Replace yes/no text prompts with a keyboard-navigable confirm widget. The agent defines it once and reuses it anywhere a destructive action needs approval.

### Radio and checklist pickers

Replace numbered-list answers with a real picker. The agent passes a list of options; you select with arrow keys and confirm with Enter. The return value is the chosen item, not a string to parse.

### Multi-step forms

Chain multiple overlays to collect structured input across several fields — filenames, environment names, feature flags — without a free-text round-trip for each one.

### Progress and status displays

Render progress bars, gauges, and live-updating dashboards during long-running tasks. Timers drive re-renders without waiting for a new tool call.

### Domain-specific controls

When a project has a recurring input pattern — selecting from a config enum, adjusting a numeric threshold, picking a deployment target — the agent can define a custom component for it once and save it to `.pi/ui-components/`. Every subsequent conversation in that project gets the control for free.

---

## pi tools

Installing `tui` registers two tools in the pi agent.

### `tui_define_component`

Saves a Lisp DSL module to `.pi/ui-components/<name>.lisp` and registers it in the runtime. The agent calls this to create or update a component definition.

```json
{
  "source": "(defcomponent confirm (message) ...)",
  "scope": "local",
  "module": "confirm"
}
```

| Parameter | Description |
|-----------|-------------|
| `source` | Full Lisp module source — one or more `defcomponent` / `defview` forms |
| `scope` | `"local"` (project, `.pi/ui-components/`) or `"global"` (`~/.pi/agent/ui-components/`). Default: `"local"` |
| `module` | File/module name. Inferred from the first `defcomponent` or `defview` name if omitted |

Global components are available in every project. Local components are scoped to the current working directory.

### `tui_create_dynamic_ui`

Launches a saved component by name as a full-screen overlay and returns the emitted value to the agent.

```json
{
  "componentId": "confirm-delete-123",
  "type": "confirm",
  "title": "Confirm deletion",
  "config": { "message": "Delete production database?" }
}
```

| Parameter | Description |
|-----------|-------------|
| `type` | Component name as registered by `tui_define_component` |
| `config` | Props object — keys map to the component's param list |
| `title` | Displayed in the overlay header |
| `componentId` | Unique identifier for this invocation |

Returns the value passed to `(emit ...)` in the DSL, or `null` if the user dismisses with Escape / Ctrl+C.

**Hotload:** the component's source file is re-read from disk on every `tui_create_dynamic_ui` call. Edit a `.lisp` file and the next invocation picks up the change without restarting the agent.

---

## Skill

Installing `tui` also registers the `tui-runtime-components` skill, which gives the agent:

- Full DSL syntax reference and layout primitives
- A component catalog with ready-to-use patterns (radio list, rotary encoder, progress gauge)
- Guidance on when to define a new component vs. reuse a saved one

The agent uses the skill automatically when writing DSL source — you do not need to instruct it.

---

## Hotload

Every `tui_create_dynamic_ui` call re-reads the component's source file from disk before instantiation:

```
.pi/ui-components/
  confirm.lisp          ← edit here, runs immediately on next call
  my-picker.lisp
  rotary-encoder.lisp
```

The load order:

1. Look up the component name in the in-memory index
2. Re-read its `.lisp` file from disk and re-compile
3. If not yet registered, scan `local` then `global` directories for `<name>.lisp`
4. Instantiate the freshly compiled `ComponentDef`

This means the agent can call `tui_define_component` to write a new version of a component, then immediately call `tui_create_dynamic_ui` to run it — all within the same message.

---

## Bundled components

The package ships three ready-to-use components in `.pi/ui-components/`:

| Component | Description |
|-----------|-------------|
| `radio-list` | Single-select list with keyboard navigation and optional pre-selection |
| `rotary-encoder` | Numeric dial with configurable min, max, step, and initial value |
| `progress-gauge` | Animated progress display driven by a timer |

The agent can use these directly or use them as templates when defining new ones.

---

## Writing your own components

See **[docs/dsl.md](docs/dsl.md)** for the full DSL reference — layout primitives, state, bindings, timers, control flow, and built-in functions.

---

## Programmatic API

The runtime is also importable as a library for use in other pi extensions or tools:

```ts
import { compileModule, instantiate, ModuleLoader } from "tui";
```

See **[docs/api.md](docs/api.md)** for the full API reference.

---

## Package structure

```
index.ts               pi extension entry — registers tui_define_component and tui_create_dynamic_ui
src/
  parser.ts            Lisp S-expression parser
  runtime.ts           DSL evaluator, layout engine, component instantiation
  loader.ts            ModuleLoader — persistence and hotload
  runner.ts            makeUiRunner — pi-tui overlay adapter
  index.ts             Public API exports
.pi/
  skills/
    tui-runtime-components/   Skill loaded by pi agent
  ui-components/              Saved component files (created at runtime)
docs/
  dsl.md               DSL language reference
  api.md               Programmatic API reference
```
