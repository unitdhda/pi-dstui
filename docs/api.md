# API Reference

Import from the package root:

```ts
import { compileModule, instantiate, ModuleLoader, makeUiRunner } from "tui";
```

---

## Parser — `src/parser.ts`

```ts
parse(source: string): SExpr[]
```

Parses a Lisp source string into S-expressions. Throws on unmatched parentheses.

```ts
class Sym { constructor(name: string) }
class Kw  { constructor(name: string) }

isSym(value, name?: string): value is Sym
isKw(value,  name?: string): value is Kw
isList(value):               value is SExpr[]
```

Types:

```ts
type Atom  = number | string | boolean | null | Sym | Kw
type SExpr = Atom | SExpr[]
```

---

## Runtime — `src/runtime.ts`

### `compileModule`

Parse and compile source into `ComponentDef[]` and `ViewDef[]` without registering anything globally.

```ts
compileModule(source: string): { components: ComponentDef[]; views: ViewDef[] }
```

Throws if no `defcomponent` or `defview` form is found.

### `registerModule`

Compile and register into the global `viewDefs` / `componentDefs` maps so `(use ...)` and view calls work across modules.

```ts
registerModule(source: string): { components: ComponentDef[]; views: ViewDef[] }
```

### `registerComponent`

Convenience wrapper — registers a module and returns its first `ComponentDef`.

```ts
registerComponent(source: string): ComponentDef
```

### `instantiate`

Create a live component instance from a compiled definition.

```ts
instantiate(
  def: ComponentDef,
  config: Record<string, unknown>,
  callbacks: {
    done: (value: unknown) => void;
    cancel: () => void;
    requestRender: () => void;
  }
): Component & { dispose(): void }
```

The returned object implements the `Component` interface from `@earendil-works/pi-tui`:

```ts
component.render(width: number): string[]   // render to terminal lines
component.handleInput(data: string): void   // feed raw terminal bytes or key names
component.dispose(): void                   // clear all timers
```

Config keys are matched to DSL params by exact name, `snake_case`, and `camelCase`.

### `Env`

The evaluator environment. Supports lexical scoping via the `parent` constructor argument.

```ts
class Env {
  constructor(parent?: Env)
  get(name: string): unknown
  set(name: string, value: unknown): void
  update(name: string, value: unknown): boolean  // mutates in-scope; returns false if not found
}
```

### `evaluate`

Evaluate any S-expression against an environment.

```ts
evaluate(expr: SExpr, env: Env): unknown
```

### Global registries

```ts
viewDefs:      Map<string, { source: string; def: ViewDef }>
componentDefs: Map<string, { source: string; def: ComponentDef }>
```

Both are populated by `registerModule`. In most cases you should use `ModuleLoader` instead of touching these directly.

### Types

```ts
interface ComponentDef {
  name: string;
  params: string[];
  stateDefs: Array<[string, SExpr]>;
  viewExpr: SExpr;
  bindings: Array<{ key: string; body: SExpr }>;
  timers: Array<{ ms: SExpr; body: SExpr }>;
}

interface ViewDef {
  name: string;
  params: string[];
  body: SExpr;
}
```

---

## ModuleLoader — `src/loader.ts`

Manages a named registry of DSL modules with file-system persistence and on-demand hotload.

```ts
class ModuleLoader {
  constructor(localRoot: string)
}
```

`localRoot` is typically `join(process.cwd(), ".pi")`. Global modules live in `~/.pi/agent/ui-components/`.

### Methods

```ts
loadPersisted(scope: "local" | "global"): void
```

Scans `<root>/ui-components/*.lisp` and registers every valid module.

```ts
persist(scope: "local" | "global", module: string, source: string): ModuleEntry
```

Writes `<module>.lisp` to disk and registers it.

```ts
tryLoadByName(name: string): { scope; module; file; def: ComponentDef } | undefined
```

Resolves a component by name. If already registered, re-reads its source file from disk before returning (**hotload**). Falls back to loading `<name>.lisp` from the ui-components directory.

```ts
deleteAll(scope: "local" | "global"): void
```

Removes the ui-components directory for the given scope and clears all cached entries.

```ts
list(): ModuleEntry[]
```

Returns all registered modules sorted by scope then name.

```ts
moduleNameFromSource(source: string, fallback: string): string
```

Extracts the first component or view name from source without registering.

### `ModuleEntry`

```ts
interface ModuleEntry {
  scope: "local" | "global";
  module: string;
  file: string;
  source: string;
  components: Array<{ name: string; params: string[] }>;
  views: Array<{ name: string; params: string[] }>;
}
```

---

## `makeUiRunner` — `src/runner.ts`

Adapts a `ComponentDef` into the overlay runner format expected by `ctx.ui.custom()` in pi agent tools.

```ts
makeUiRunner(
  def: ComponentDef,
  config: Record<string, unknown>
): (tui, _theme, _keybindings, done) => OverlayWrapper
```

Handles all standard exit keys (`Escape`, `Ctrl+C`, `Ctrl+D`) in addition to bindings declared in the component. Pass the return value directly to `ctx.ui.custom<T>()`.

---

## Usage example

```ts
import { compileModule, instantiate } from "tui";

const source = `
(defcomponent confirm (message)
  (view
    (flex-col :gap 1
      (text message)
      (text "y = yes  n = no" :muted)))
  (bind :y (emit true))
  (bind :n (emit false)))
`;

const def = compileModule(source).components[0]!;

const component = instantiate(def, { message: "Delete this file?" }, {
  done: (value) => console.log("Result:", value),
  cancel: () => console.log("Cancelled"),
  requestRender: () => {},
});

console.log(component.render(60));
component.handleInput("y");
component.dispose();
```
