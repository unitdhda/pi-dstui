import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { compileModule, registerModule, type ComponentDef, type ViewDef } from "./runtime.ts";

export type Scope = "local" | "global";

export interface ModuleEntry {
  scope: Scope;
  module: string;
  file: string;
  source: string;
  components: Array<{ name: string; params: string[] }>;
  views: Array<{ name: string; params: string[] }>;
}

const GLOBAL_ROOT = join(homedir(), ".pi", "agent");

function pathsFor(scope: Scope, localRoot: string) {
  const root = scope === "global" ? GLOBAL_ROOT : localRoot;
  return { root, dir: join(root, "ui-components") };
}

function moduleKey(scope: Scope, module: string) {
  return `${scope}:${module}`;
}

export class ModuleLoader {
  private modules = new Map<string, ModuleEntry>();
  private componentIndex = new Map<string, { scope: Scope; module: string; file: string; def: ComponentDef }>();
  private viewIndex = new Map<string, { scope: Scope; module: string; file: string; def: ViewDef }>();

  constructor(private localRoot: string) {}

  private paths(scope: Scope) {
    return pathsFor(scope, this.localRoot);
  }

  private clearIndices(scope: Scope, module: string) {
    const existing = this.modules.get(moduleKey(scope, module));
    if (!existing) return;
    for (const c of existing.components) this.componentIndex.delete(c.name);
    for (const v of existing.views) this.viewIndex.delete(v.name);
  }

  private register(scope: Scope, module: string, file: string, source: string): ModuleEntry {
    this.clearIndices(scope, module);
    const compiled = registerModule(source);
    const entry: ModuleEntry = {
      scope,
      module,
      file,
      source,
      components: compiled.components.map((d) => ({ name: d.name, params: d.params })),
      views: compiled.views.map((d) => ({ name: d.name, params: d.params })),
    };
    this.modules.set(moduleKey(scope, module), entry);
    for (const def of compiled.components) this.componentIndex.set(def.name, { scope, module, file, def });
    for (const def of compiled.views) this.viewIndex.set(def.name, { scope, module, file, def });
    return entry;
  }

  moduleNameFromSource(source: string, fallback: string): string {
    const compiled = compileModule(source);
    return compiled.components[0]?.name ?? compiled.views[0]?.name ?? fallback;
  }

  loadPersisted(scope: Scope): void {
    const { dir } = this.paths(scope);
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".lisp")) continue;
      try {
        const source = readFileSync(join(dir, file), "utf8");
        const module = file.replace(/\.lisp$/, "") || this.moduleNameFromSource(source, "module");
        this.register(scope, module, file, source);
      } catch {
        // ignore malformed modules
      }
    }
  }

  persist(scope: Scope, module: string, source: string): ModuleEntry {
    const { dir } = this.paths(scope);
    mkdirSync(dir, { recursive: true });
    const file = `${module}.lisp`;
    writeFileSync(join(dir, file), source, "utf8");
    return this.register(scope, module, file, source);
  }

  deleteAll(scope: Scope): void {
    const { dir } = this.paths(scope);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    for (const [id, entry] of [...this.modules.entries()]) {
      if (entry.scope !== scope) continue;
      this.clearIndices(entry.scope, entry.module);
      this.modules.delete(id);
    }
  }

  list(): ModuleEntry[] {
    return [...this.modules.values()].sort(
      (a, b) => a.scope.localeCompare(b.scope) || a.module.localeCompare(b.module),
    );
  }

  /**
   * Looks up a component by name. If already registered, re-reads its file
   * from disk before returning (hotload). Falls back to loading a same-named
   * .lisp file from the ui-components directory if not yet registered.
   */
  tryLoadByName(name: string): { scope: Scope; module: string; file: string; def: ComponentDef } | undefined {
    const known = this.componentIndex.get(name);
    if (known) {
      const filePath = join(this.paths(known.scope).dir, known.file);
      if (!existsSync(filePath)) return undefined;
      try {
        const source = readFileSync(filePath, "utf8");
        this.register(known.scope, known.module, known.file, source);
        return this.componentIndex.get(name);
      } catch {
        return undefined;
      }
    }

    for (const scope of ["local", "global"] as const) {
      const { dir } = this.paths(scope);
      const directFile = join(dir, `${name}.lisp`);
      if (!existsSync(directFile)) continue;
      try {
        const source = readFileSync(directFile, "utf8");
        this.register(scope, name, `${name}.lisp`, source);
        const found = this.componentIndex.get(name);
        if (found) return found;
      } catch {
        // ignore malformed modules
      }
    }

    return this.componentIndex.get(name);
  }
}
