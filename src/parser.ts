export type Atom = number | string | boolean | null | Sym | Kw;
export type SExpr = Atom | SExpr[];

export class Sym {
  constructor(public name: string) {}
  toString() { return this.name; }
}

export class Kw {
  constructor(public name: string) {}
  toString() { return `:${this.name}`; }
}

export function isSym(value: unknown, name?: string): value is Sym {
  return value instanceof Sym && (name === undefined || value.name === name);
}

export function isKw(value: unknown, name?: string): value is Kw {
  return value instanceof Kw && (name === undefined || value.name === name);
}

export function isList(value: unknown): value is SExpr[] {
  return Array.isArray(value);
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isSymbolChar(ch: string): boolean {
  return ch !== "" && !isWhitespace(ch) && ch !== "(" && ch !== ")" && ch !== '"' && ch !== ";";
}

export function parse(source: string): SExpr[] {
  let pos = 0;
  const peek = () => source[pos] ?? "";
  const next = () => source[pos++] ?? "";

  function skip() {
    while (pos < source.length) {
      if (isWhitespace(peek())) {
        next();
        continue;
      }
      if (peek() === ";") {
        while (pos < source.length && peek() !== "\n") next();
        continue;
      }
      break;
    }
  }

  function readString(): string {
    next();
    let out = "";
    while (pos < source.length && peek() !== '"') {
      if (peek() === "\\") {
        next();
        const ch = next();
        if (ch === "n") out += "\n";
        else if (ch === "t") out += "\t";
        else out += ch;
      } else {
        out += next();
      }
    }
    if (peek() === '"') next();
    return out;
  }

  function readAtom(): Atom {
    if (peek() === '"') return readString();
    let token = "";
    while (isSymbolChar(peek())) token += next();
    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "nil") return null;
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
    if (token.startsWith(":")) return new Kw(token.slice(1));
    return new Sym(token);
  }

  function readExpr(): SExpr {
    skip();
    if (peek() === "(") {
      next();
      const list: SExpr[] = [];
      while (true) {
        skip();
        if (peek() === ")" || peek() === "") break;
        list.push(readExpr());
      }
      if (peek() === ")") next();
      return list;
    }
    if (peek() === "'") {
      next();
      return [new Sym("quote"), readExpr()];
    }
    return readAtom();
  }

  const exprs: SExpr[] = [];
  while (true) {
    skip();
    if (pos >= source.length) break;
    exprs.push(readExpr());
  }
  return exprs;
}
