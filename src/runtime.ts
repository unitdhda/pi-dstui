import type { Component } from "@earendil-works/pi-tui";
import { isKillerInput } from "./exit.ts";
import { type SExpr, Sym, Kw, isKw, isList, isSym, parse } from "./parser.ts";

export class Env {
  private values = new Map<string, unknown>();
  constructor(private parent?: Env) {}

  get(name: string): unknown {
    if (this.values.has(name)) return this.values.get(name);
    return this.parent?.get(name);
  }

  set(name: string, value: unknown) {
    this.values.set(name, value);
  }

  update(name: string, value: unknown): boolean {
    if (this.values.has(name)) {
      this.values.set(name, value);
      return true;
    }
    return this.parent?.update(name, value) ?? false;
  }
}

export interface ComponentDef {
  name: string;
  params: string[];
  stateDefs: Array<[string, SExpr]>;
  viewExpr: SExpr;
  bindings: Array<{ key: string; body: SExpr }>;
  timers: Array<{ ms: SExpr; body: SExpr }>;
}

export interface ViewDef {
  name: string;
  params: string[];
  body: SExpr;
}

const STYLES: Record<string, (text: string) => string> = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  muted: (s) => `\x1b[90m${s}\x1b[0m`,
  accent: (s) => `\x1b[36m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  inverse: (s) => `\x1b[7m${s}\x1b[0m`,
};

function styleText(style: unknown, text: string): string {
  if (style instanceof Kw && STYLES[style.name]) return STYLES[style.name]!(text);
  if (typeof style === "string" && STYLES[style]) return STYLES[style]!(text);
  return text;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Sym) return value.name;
  if (value instanceof Kw) return `:${value.name}`;
  if (Array.isArray(value)) return value.map(str).join("");
  return String(value);
}

function installBuiltins(env: Env) {
  env.set("+", (...args: unknown[]) => args.reduce((sum, value) => sum + num(value), 0));
  env.set("-", (...args: unknown[]) => args.length === 1 ? -num(args[0]) : num(args[0]) - args.slice(1).reduce((sum, value) => sum + num(value), 0));
  env.set("*", (...args: unknown[]) => args.reduce((prod, value) => prod * num(value), 1));
  env.set("/", (a: unknown, b: unknown) => num(b) === 0 ? 0 : num(a) / num(b));
  env.set("mod", (a: unknown, b: unknown) => num(b) === 0 ? 0 : num(a) % num(b));
  env.set("abs", (a: unknown) => Math.abs(num(a)));
  env.set("round", (a: unknown) => Math.round(num(a)));
  env.set("floor", (a: unknown) => Math.floor(num(a)));
  env.set("ceil", (a: unknown) => Math.ceil(num(a)));
  env.set("min", (...args: unknown[]) => Math.min(...args.map(num)));
  env.set("max", (...args: unknown[]) => Math.max(...args.map(num)));
  env.set("clamp", (v: unknown, lo: unknown, hi: unknown) => Math.max(num(lo), Math.min(num(hi), num(v))));
  env.set("ratio", (v: unknown, lo: unknown, hi: unknown) => {
    const min = num(lo);
    const max = num(hi);
    const span = max - min;
    return span === 0 ? 1 : (num(v) - min) / span;
  });

  env.set("<", (a: unknown, b: unknown) => num(a) < num(b));
  env.set(">", (a: unknown, b: unknown) => num(a) > num(b));
  env.set("<=", (a: unknown, b: unknown) => num(a) <= num(b));
  env.set(">=", (a: unknown, b: unknown) => num(a) >= num(b));
  env.set("=", (a: unknown, b: unknown) => a === b || num(a) === num(b));
  env.set("not", (a: unknown) => !a);
  env.set("and", (...args: unknown[]) => args.every(Boolean));
  env.set("or", (...args: unknown[]) => args.find(Boolean) ?? false);

  env.set("str", (...args: unknown[]) => args.map(str).join(""));
  env.set("join", (sep: unknown, list: unknown) => Array.isArray(list) ? list.map(str).join(str(sep)) : "");
  env.set("repeat", (s: unknown, count: unknown) => str(s).repeat(Math.max(0, num(count))));
  env.set("pad", (s: unknown, width: unknown, fill?: unknown) => str(s).padStart(num(width), str(fill ?? " ")));
  env.set("pad-end", (s: unknown, width: unknown, fill?: unknown) => str(s).padEnd(num(width), str(fill ?? " ")));

  env.set("len", (value: unknown) => Array.isArray(value) ? value.length : typeof value === "string" ? value.length : 0);
  env.set("nth", (list: unknown, index: unknown) => Array.isArray(list) ? list[num(index)] : undefined);
  env.set("list", (...args: unknown[]) => args);
  env.set("append", (list: unknown, item: unknown) => Array.isArray(list) ? [...list, item] : [item]);
  env.set("slice", (list: unknown, start: unknown, end?: unknown) => Array.isArray(list) ? (end === undefined ? list.slice(num(start)) : list.slice(num(start), num(end))) : []);
  env.set("swap", (list: unknown, a: unknown, b: unknown) => {
    if (!Array.isArray(list)) return list;
    const out = [...list];
    const i = num(a);
    const j = num(b);
    if (i >= 0 && i < out.length && j >= 0 && j < out.length) [out[i], out[j]] = [out[j], out[i]];
    return out;
  });
  env.set("splice-move", (list: unknown, from: unknown, to: unknown) => {
    if (!Array.isArray(list)) return list;
    const out = [...list];
    const i = num(from);
    const j = num(to);
    if (i < 0 || i >= out.length || j < 0 || j >= out.length || i === j) return out;
    const [item] = out.splice(i, 1);
    out.splice(j, 0, item);
    return out;
  });
  env.set("field", (obj: unknown, key: unknown) => obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>)[str(key)] : undefined);
}

export function evaluate(expr: SExpr, env: Env): unknown {
  if (expr === null) return null;
  if (typeof expr === "number" || typeof expr === "boolean" || typeof expr === "string") return expr;
  if (expr instanceof Kw) return expr;
  if (expr instanceof Sym) return env.get(expr.name);
  if (!isList(expr) || expr.length === 0) return null;

  const head = expr[0];

  if (isSym(head, "quote")) return expr[1];
  if (isSym(head, "if")) return evaluate(evaluate(expr[1]!, env) ? expr[2]! : (expr[3] ?? null), env);

  if (isSym(head, "cond")) {
    for (let i = 1; i < expr.length; i++) {
      const clause = expr[i];
      if (!isList(clause) || clause.length < 2) continue;
      if (isSym(clause[0], "else") || evaluate(clause[0]!, env)) {
        let result: unknown = null;
        for (let j = 1; j < clause.length; j++) result = evaluate(clause[j]!, env);
        return result;
      }
    }
    return null;
  }

  if (isSym(head, "when")) {
    if (!evaluate(expr[1]!, env)) return null;
    let result: unknown = null;
    for (let i = 2; i < expr.length; i++) result = evaluate(expr[i]!, env);
    return result;
  }

  if (isSym(head, "let")) {
    const child = new Env(env);
    if (isList(expr[1])) {
      for (const binding of expr[1]) {
        if (isList(binding) && binding.length >= 2 && isSym(binding[0])) child.set(binding[0].name, evaluate(binding[1]!, child));
      }
    }
    let result: unknown = null;
    for (let i = 2; i < expr.length; i++) result = evaluate(expr[i]!, child);
    return result;
  }

  if (isSym(head, "do")) {
    let result: unknown = null;
    for (let i = 1; i < expr.length; i++) result = evaluate(expr[i]!, env);
    return result;
  }

  if (isSym(head, "set!")) {
    if (!isSym(expr[1])) return null;
    const value = evaluate(expr[2]!, env);
    if (!env.update(expr[1].name, value)) env.set(expr[1].name, value);
    return value;
  }

  if (isSym(head, "fn")) {
    const params = isList(expr[1]) ? expr[1].filter((value): value is Sym => value instanceof Sym).map((value) => value.name) : [];
    const body = expr.slice(2);
    return (...args: unknown[]) => {
      const child = new Env(env);
      params.forEach((param, index) => child.set(param, args[index]));
      let result: unknown = null;
      for (const form of body) result = evaluate(form, child);
      return result;
    };
  }

  if (isSym(head, "emit")) {
    const emit = env.get("__emit__") as ((value: unknown) => void) | undefined;
    const value = evaluate(expr[1]!, env);
    emit?.(value);
    return value;
  }

  if (isSym(head, "cancel")) {
    const cancel = env.get("__cancel__") as (() => void) | undefined;
    cancel?.();
    return null;
  }

  const fn = evaluate(head, env);
  const args = expr.slice(1).map((value) => evaluate(value!, env));
  return typeof fn === "function" ? fn(...args) : null;
}

type Cell = { char: string; style?: unknown };
type Grid = Cell[][];

type LayoutNode =
  | { type: "empty" }
  | { type: "text"; text: string; style?: unknown }
  | { type: "bar"; value: number; width: number; cursor: string; fill: string; empty: string; style?: unknown }
  | { type: "spacer"; size: number }
  | { type: "stack"; direction: "row" | "col"; gap: number; children: LayoutNode[] }
  | { type: "grid"; columns: number; gap: number; children: LayoutNode[] }
  | { type: "item"; basis: number; grow: number; children: LayoutNode[] }
  | { type: "each"; varName: string; listExpr: SExpr; body: SExpr };

function cell(char: string, style?: unknown): Cell {
  return { char, style };
}

function blankRow(width: number): Cell[] {
  return Array.from({ length: width }, () => cell(" "));
}

function textRow(text: string, style?: unknown): Cell[] {
  return [...text].map((ch) => cell(ch, style));
}

function gridWidth(grid: Grid): number {
  return grid.reduce((max, row) => Math.max(max, row.length), 0);
}

function gridHeight(grid: Grid): number {
  return grid.length;
}

function padRow(row: Cell[], width: number): Cell[] {
  return row.length >= width ? row.slice(0, width) : [...row, ...blankRow(width - row.length)];
}

function padGrid(grid: Grid, width: number): Grid {
  return grid.map((row) => padRow(row, width));
}

function hstack(grids: Grid[], gap: number): Grid {
  if (grids.length === 0) return [[]];
  const widths = grids.map(gridWidth);
  const height = Math.max(1, ...grids.map(gridHeight));
  const out: Grid = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    for (let i = 0; i < grids.length; i++) {
      if (i > 0) row.push(...blankRow(gap));
      row.push(...padRow(grids[i]?.[y] ?? [], widths[i] ?? 0));
    }
    out.push(row);
  }
  return out;
}

function vstack(grids: Grid[], gap: number): Grid {
  const out: Grid = [];
  for (let i = 0; i < grids.length; i++) {
    if (i > 0) for (let g = 0; g < gap; g++) out.push([]);
    out.push(...grids[i]!);
  }
  return out;
}

function sameStyle(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return a instanceof Kw && b instanceof Kw && a.name === b.name;
}

function flatten(grid: Grid, width: number): string[] {
  return grid.map((row) => {
    const cells = row.slice(0, width);
    let end = cells.length;
    while (end > 0 && cells[end - 1]!.char === " " && !cells[end - 1]!.style) end -= 1;
    let out = "";
    let buffer = "";
    let currentStyle: unknown = undefined;
    for (let i = 0; i < end; i++) {
      const c = cells[i]!;
      if (!sameStyle(currentStyle, c.style)) {
        if (buffer) out += currentStyle ? styleText(currentStyle, buffer) : buffer;
        currentStyle = c.style;
        buffer = "";
      }
      buffer += c.char;
    }
    if (buffer) out += currentStyle ? styleText(currentStyle, buffer) : buffer;
    return out;
  });
}

function argsOf(args: SExpr[]): { positional: SExpr[]; named: Record<string, SExpr> } {
  const positional: SExpr[] = [];
  const named: Record<string, SExpr> = {};
  let i = 0;
  while (i < args.length) {
    if (isKw(args[i]) && i + 1 < args.length) {
      named[(args[i] as Kw).name] = args[i + 1]!;
      i += 2;
    } else {
      positional.push(args[i]!);
      i += 1;
    }
  }
  return { positional, named };
}

function resolveStyle(named: Record<string, SExpr>, env: Env, positional: SExpr[] = []): unknown {
  let style = named.style ? evaluate(named.style, env) : undefined;
  for (const name of Object.keys(STYLES)) {
    if (named[name] !== undefined && evaluate(named[name]!, env)) style = new Kw(name);
  }
  if (style === undefined) {
    for (const part of positional) if (isKw(part) && STYLES[part.name]) return part;
  }
  return style;
}

function buildSequence(forms: SExpr[], env: Env): LayoutNode {
  const children = forms.map((form) => buildLayout(form, env)).filter((child) => child.type !== "empty");
  if (children.length === 0) return { type: "empty" };
  if (children.length === 1) return children[0]!;
  return { type: "stack", direction: "col", gap: 0, children };
}

export const viewDefs = new Map<string, { source: string; def: ViewDef }>();
export const componentDefs = new Map<string, { source: string; def: ComponentDef }>();

function buildViewCall(name: string, args: SExpr[], env: Env): LayoutNode {
  const view = viewDefs.get(name)?.def;
  if (!view) return { type: "empty" };
  const child = new Env(env);
  view.params.forEach((param, index) => child.set(param, args[index] === undefined ? null : evaluate(args[index]!, env)));
  return buildLayout(view.body, child);
}

function buildLayout(expr: SExpr, env: Env): LayoutNode {
  if (!isList(expr) || expr.length === 0) return { type: "empty" };
  const head = expr[0];
  if (!isSym(head)) return { type: "empty" };
  const name = head.name;

  if (name === "use") {
    const target = expr[1];
    if (isSym(target)) return buildViewCall(target.name, expr.slice(2), env);
    if (typeof target === "string") return buildViewCall(target, expr.slice(2), env);
    return { type: "empty" };
  }

  if (name === "text") {
    const { positional, named } = argsOf(expr.slice(1));
    return {
      type: "text",
      text: positional.map((part) => str(evaluate(part, env))).join(""),
      style: resolveStyle(named, env, positional),
    };
  }

  if (name === "bar") {
    const { positional, named } = argsOf(expr.slice(1));
    return {
      type: "bar",
      value: num(evaluate(positional[0] ?? 0, env)),
      width: named.width ? Math.max(1, num(evaluate(named.width, env))) : 20,
      cursor: named.cursor ? str(evaluate(named.cursor, env)) : "●",
      fill: named.fill ? str(evaluate(named.fill, env)) : "━",
      empty: named.empty ? str(evaluate(named.empty, env)) : "─",
      style: resolveStyle(named, env),
    };
  }

  if (name === "spacer") return { type: "spacer", size: Math.max(1, num(evaluate(expr[1] ?? 1, env))) };

  if (name === "row" || name === "col") {
    const { positional } = argsOf(expr.slice(1));
    return { type: "stack", direction: name, gap: 0, children: positional.map((part) => buildLayout(part, env)).filter((child) => child.type !== "empty") };
  }

  if (name === "flex-row" || name === "flex-col") {
    const { positional, named } = argsOf(expr.slice(1));
    return {
      type: "stack",
      direction: name === "flex-row" ? "row" : "col",
      gap: named.gap ? Math.max(0, num(evaluate(named.gap, env))) : 0,
      children: positional.map((part) => buildLayout(part, env)).filter((child) => child.type !== "empty"),
    };
  }

  if (name === "grid") {
    const { positional, named } = argsOf(expr.slice(1));
    return {
      type: "grid",
      columns: named.columns ? Math.max(1, num(evaluate(named.columns, env))) : 2,
      gap: named.gap ? Math.max(0, num(evaluate(named.gap, env))) : 2,
      children: positional.map((part) => buildLayout(part, env)).filter((child) => child.type !== "empty"),
    };
  }

  if (name === "item") {
    const { positional, named } = argsOf(expr.slice(1));
    return {
      type: "item",
      basis: named.basis ? Math.max(0, num(evaluate(named.basis, env))) : 0,
      grow: named.grow ? Math.max(0, num(evaluate(named.grow, env))) : 0,
      children: positional.map((part) => buildLayout(part, env)).filter((child) => child.type !== "empty"),
    };
  }

  if (name === "each") {
    return {
      type: "each",
      varName: isSym(expr[1]) ? expr[1].name : "it",
      listExpr: expr[2]!,
      body: expr.length > 4 ? [new Sym("do"), ...expr.slice(3)] : expr[3]!,
    };
  }

  if (name === "do") return buildSequence(expr.slice(1), env);

  if (name === "let") {
    const child = new Env(env);
    if (isList(expr[1])) {
      for (const binding of expr[1]) {
        if (isList(binding) && binding.length >= 2 && isSym(binding[0])) child.set(binding[0].name, evaluate(binding[1]!, child));
      }
    }
    return buildSequence(expr.slice(2), child);
  }

  if (name === "when") return evaluate(expr[1]!, env) ? buildSequence(expr.slice(2), env) : { type: "empty" };
  if (name === "if") return buildLayout(evaluate(expr[1]!, env) ? expr[2]! : (expr[3] ?? null), env);

  if (name === "cond") {
    for (let i = 1; i < expr.length; i++) {
      const clause = expr[i];
      if (!isList(clause) || clause.length < 2) continue;
      if (isSym(clause[0], "else") || evaluate(clause[0]!, env)) return buildSequence(clause.slice(1), env);
    }
    return { type: "empty" };
  }

  if (viewDefs.has(name)) return buildViewCall(name, expr.slice(1), env);
  return { type: "empty" };
}

function renderNode(node: LayoutNode, env: Env, width: number): Grid {
  switch (node.type) {
    case "empty":
      return [];
    case "text":
      return [textRow(node.text, node.style)];
    case "spacer":
      return Array.from({ length: node.size }, () => [] as Cell[]);
    case "bar": {
      const value = Math.max(0, Math.min(1, node.value));
      const pos = Math.round(value * Math.max(0, node.width - 1));
      const row: Cell[] = [];
      for (let i = 0; i < node.width; i++) {
        if (i === pos) row.push(cell(node.cursor, node.style));
        else if (i < pos) row.push(cell(node.fill, node.style));
        else row.push(cell(node.empty, new Kw("muted")));
      }
      return [row];
    }
    case "stack": {
      if (node.direction === "col") return vstack(node.children.map((child) => renderNode(child, env, width)), node.gap);
      const children = node.children;
      const basis = children.map((child) => child.type === "item" ? child.basis : 0);
      let fixedWidth = Math.max(0, children.length - 1) * node.gap;
      let totalGrow = 0;
      const staticGrids: Array<Grid | null> = [];

      for (let i = 0; i < children.length; i++) {
        const child = children[i]!;
        if (child.type === "item" && child.grow > 0) {
          totalGrow += child.grow;
          fixedWidth += basis[i]!;
          staticGrids.push(null);
        } else if (child.type === "item") {
          const inner = vstack(child.children.map((part) => renderNode(part, env, child.basis || width)), 0);
          const sized = child.basis > 0 ? padGrid(inner, child.basis) : inner;
          staticGrids.push(sized);
          fixedWidth += gridWidth(sized);
        } else {
          const grid = renderNode(child, env, width);
          staticGrids.push(grid);
          fixedWidth += gridWidth(grid);
        }
      }

      const remaining = Math.max(0, width - fixedWidth);
      const out: Grid[] = [];
      let used = 0;
      let growSeen = 0;

      for (let i = 0; i < children.length; i++) {
        const child = children[i]!;
        if (child.type === "item" && child.grow > 0) {
          growSeen += child.grow;
          const extra = growSeen === totalGrow ? remaining - used : Math.floor((remaining * child.grow) / totalGrow);
          used += extra;
          const alloc = child.basis + extra;
          const inner = vstack(child.children.map((part) => renderNode(part, env, alloc)), 0);
          out.push(padGrid(inner, alloc));
        } else {
          out.push(staticGrids[i] ?? []);
        }
      }

      return hstack(out, node.gap);
    }
    case "grid": {
      const cellWidth = Math.max(4, Math.floor((width - Math.max(0, node.columns - 1) * node.gap) / node.columns));
      const rows: Grid[] = [];
      for (let i = 0; i < node.children.length; i += node.columns) {
        const chunk = node.children.slice(i, i + node.columns).map((child) => padGrid(renderNode(child, env, cellWidth), cellWidth));
        rows.push(hstack(chunk, node.gap));
      }
      return vstack(rows, 0);
    }
    case "item": {
      const childWidth = node.basis || width;
      return padGrid(vstack(node.children.map((child) => renderNode(child, env, childWidth)), 0), childWidth);
    }
    case "each": {
      const list = evaluate(node.listExpr, env);
      if (!Array.isArray(list)) return [];
      return vstack(list.map((item, index) => {
        const child = new Env(env);
        child.set(node.varName, item);
        child.set("__index__", index);
        return renderNode(buildLayout(node.body, child), child, width);
      }), 0);
    }
  }
}

function readParams(expr: SExpr | undefined): string[] {
  return isList(expr) ? expr.filter((value): value is Sym => value instanceof Sym).map((value) => value.name) : [];
}

function compileComponentForm(expr: SExpr[]): ComponentDef {
  const name = isSym(expr[1]) ? expr[1].name : "unnamed";
  const params = readParams(expr[2]);
  const stateDefs: Array<[string, SExpr]> = [];
  let viewExpr: SExpr = [new Sym("col")];
  const bindings: Array<{ key: string; body: SExpr }> = [];
  const timers: Array<{ ms: SExpr; body: SExpr }> = [];

  for (let i = 3; i < expr.length; i++) {
    const form = expr[i];
    if (!isList(form) || form.length === 0) continue;
    const head = form[0];
    if (isSym(head, "state")) {
      for (let j = 1; j < form.length; j++) {
        const binding = form[j];
        if (isList(binding) && binding.length >= 2 && isSym(binding[0])) stateDefs.push([binding[0].name, binding[1]!]);
      }
    }
    if (isSym(head, "view")) viewExpr = form.length === 2 ? form[1]! : [new Sym("col"), ...form.slice(1)];
    if (isSym(head, "bind")) {
      const key = isKw(form[1]) ? form[1].name : typeof form[1] === "string" ? form[1] : isSym(form[1]) ? form[1].name : null;
      if (key) bindings.push({ key, body: form.length === 3 ? form[2]! : [new Sym("do"), ...form.slice(2)] });
    }
    if (isSym(head, "every")) timers.push({ ms: form[1]!, body: form.length === 3 ? form[2]! : [new Sym("do"), ...form.slice(2)] });
  }

  return { name, params, stateDefs, viewExpr, bindings, timers };
}

function compileViewForm(expr: SExpr[]): ViewDef {
  return {
    name: isSym(expr[1]) ? expr[1].name : "unnamed-view",
    params: readParams(expr[2]),
    body: expr.length === 4 ? expr[3]! : [new Sym("col"), ...expr.slice(3)],
  };
}

export function compileModule(source: string): { components: ComponentDef[]; views: ViewDef[] } {
  const exprs = parse(source);
  const components: ComponentDef[] = [];
  const views: ViewDef[] = [];
  for (const expr of exprs) {
    if (!isList(expr) || expr.length === 0) continue;
    if (isSym(expr[0], "defcomponent")) components.push(compileComponentForm(expr));
    if (isSym(expr[0], "defview")) views.push(compileViewForm(expr));
  }
  if (components.length === 0 && views.length === 0) throw new Error("No (defcomponent ...) or (defview ...) found");
  return { components, views };
}

export function registerModule(source: string): { components: ComponentDef[]; views: ViewDef[] } {
  const compiled = compileModule(source);
  for (const view of compiled.views) viewDefs.set(view.name, { source, def: view });
  for (const component of compiled.components) componentDefs.set(component.name, { source, def: component });
  return compiled;
}

export function registerComponent(source: string): ComponentDef {
  const compiled = registerModule(source);
  if (!compiled.components[0]) throw new Error("No (defcomponent ...) found");
  return compiled.components[0];
}

function normalizeKey(data: string): string {
  const raw = data;
  const lower = raw.toLowerCase();

  if (raw === "\r" || raw === "\n" || lower === "return" || lower === "enter") return "enter";
  if (raw === "\u001b" || raw === "\u001b\u001b" || lower === "escape" || lower === "esc") return "escape";
  if (raw === "\t" || lower === "tab") return "tab";
  if (raw === " ") return "space";
  if (raw === "\u007f" || raw === "\b" || lower === "backspace") return "backspace";
  if (raw === "\u001b[3~" || lower === "delete") return "delete";

  const kitty = raw.match(/^\u001b\[([0-9]+)(?:;[0-9:]+)?u$/);
  if (kitty) {
    const codepoint = Number(kitty[1]);
    if (codepoint === 27) return "escape";
    if (codepoint === 13) return "enter";
    if (codepoint === 9) return "tab";
    if (codepoint === 32) return "space";
    if (codepoint === 127 || codepoint === 8) return "backspace";
    if (codepoint >= 33 && codepoint <= 126) return String.fromCharCode(codepoint).toLowerCase();
  }

  const csi = raw.match(/^\u001b\[[0-9;:]*([ABCDHF])$/);
  if (csi) {
    const final = csi[1];
    if (final === "A") return "up";
    if (final === "B") return "down";
    if (final === "C") return "right";
    if (final === "D") return "left";
    if (final === "H") return "home";
    if (final === "F") return "end";
  }

  const app = raw.match(/^\u001bO([ABCDHF])$/);
  if (app) {
    const final = app[1];
    if (final === "A") return "up";
    if (final === "B") return "down";
    if (final === "C") return "right";
    if (final === "D") return "left";
    if (final === "H") return "home";
    if (final === "F") return "end";
  }

  if (lower === "arrowup") return "up";
  if (lower === "arrowdown") return "down";
  if (lower === "arrowleft") return "left";
  if (lower === "arrowright") return "right";
  if (lower === "pageup" || lower === "page-up") return "page-up";
  if (lower === "pagedown" || lower === "page-down") return "page-down";

  if (raw.length === 2 && raw.startsWith("\u001b")) return `alt+${raw.slice(1).toLowerCase()}`;
  if (raw.length === 1) {
    const code = raw.charCodeAt(0);
    if (code >= 1 && code <= 26) return `ctrl+${String.fromCharCode(code + 96)}`;
    return lower;
  }

  return lower;
}

function matchKey(data: string, key: string): boolean {
  const normalized = normalizeKey(data);
  const wanted = key.toLowerCase();
  if (normalized === wanted) return true;
  if (wanted === "left" && (normalized === "h" || normalized === "a")) return true;
  if (wanted === "right" && (normalized === "l" || normalized === "d")) return true;
  if (wanted === "up" && normalized === "k") return true;
  if (wanted === "down" && normalized === "j") return true;
  return false;
}

export function instantiate(
  def: ComponentDef,
  config: Record<string, unknown>,
  callbacks: { done: (value: unknown) => void; cancel: () => void; requestRender: () => void },
): Component & { dispose(): void } {
  const env = new Env();
  installBuiltins(env);
  env.set("__emit__", callbacks.done);
  env.set("__cancel__", callbacks.cancel);

  for (const param of def.params) {
    const snake = param.replace(/-/g, "_");
    const camel = param.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    env.set(param, config[param] ?? config[snake] ?? config[camel] ?? null);
  }

  for (const [name, expr] of def.stateDefs) env.set(name, evaluate(expr, env));

  const timers: ReturnType<typeof setInterval>[] = [];
  for (const timer of def.timers) {
    const ms = Math.max(1, num(evaluate(timer.ms, env)) || 1000);
    timers.push(setInterval(() => {
      evaluate(timer.body, env);
      callbacks.requestRender();
    }, ms));
  }

  return {
    render(width: number): string[] {
      const root = buildLayout(def.viewExpr, env);
      return flatten(renderNode(root, env, width), width);
    },
    handleInput(data: string): void {
      const key = normalizeKey(data);
      if (key === "escape" || key === "ctrl+c" || key === "ctrl+d" || isKillerInput(data)) {
        callbacks.cancel();
        return;
      }

      for (const binding of def.bindings) {
        if (!matchKey(data, binding.key)) continue;
        evaluate(binding.body, env);
        callbacks.requestRender();
        return;
      }
    },
    invalidate(): void {},
    dispose(): void {
      for (const timer of timers) clearInterval(timer);
    },
  };
}
