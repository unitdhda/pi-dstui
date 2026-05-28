import { expect, mock, test } from "bun:test";
import { registerModule } from "./src/runtime.ts";

mock.module("typebox", () => ({
  Type: {
    Object: (...args: unknown[]) => ({ kind: "Object", args }),
    String: (...args: unknown[]) => ({ kind: "String", args }),
    Optional: (value: unknown) => ({ kind: "Optional", value }),
    Union: (value: unknown) => ({ kind: "Union", value }),
    Literal: (value: unknown) => ({ kind: "Literal", value }),
    Record: (...args: unknown[]) => ({ kind: "Record", args }),
    Any: () => ({ kind: "Any" }),
  },
}));

mock.module("@earendil-works/pi-tui", () => ({
  getKeybindings: () => ({
    matches: (data: string, action: string) => {
      if (action === "tui.select.cancel") return data === "\u001b" || data === "escape";
      if (action === "app.interrupt") return data === "\u0003" || data === "ctrl+c";
      if (action === "app.exit") return data === "\u0004" || data === "ctrl+d";
      return false;
    },
  }),
  matchesKey: (data: string, key: string) => data === key,
  Key: {
    ctrl: (ch: string) => `ctrl+${ch}`,
  },
}));

async function mountWrapper(source: string, config: Record<string, unknown> = {}) {
  const { makeUiRunner } = await import("./index.ts");
  const def = registerModule(source).components[0]!;
  const renders: number[] = [];
  const results: unknown[] = [];

  const runner = makeUiRunner(def, config);
  const wrapper = runner({
    requestRender: () => { renders.push(1); },
    setFocus: () => {},
  }, null, null, (value: unknown) => { results.push(value); });

  return { wrapper, renders, results };
}

test("synthetic escape closes wrapper ui", async () => {
  const { wrapper, results } = await mountWrapper(`
(defcomponent demo ()
  (view (text "Hello")))`);

  wrapper.handleInput("\u001b");
  expect(results).toEqual([null]);
});

test("synthetic named escape closes wrapper ui", async () => {
  const { wrapper, results } = await mountWrapper(`
(defcomponent demo ()
  (view (text "Hello")))`);

  wrapper.handleInput("escape");
  expect(results).toEqual([null]);
});

test("synthetic ctrl+c closes wrapper ui", async () => {
  const { wrapper, results } = await mountWrapper(`
(defcomponent demo ()
  (view (text "Hello")))`);

  wrapper.handleInput("ctrl+c");
  expect(results).toEqual([null]);
});

test("synthetic raw ctrl+c closes wrapper ui", async () => {
  const { wrapper, results } = await mountWrapper(`
(defcomponent demo ()
  (view (text "Hello")))`);

  wrapper.handleInput("\u0003");
  expect(results).toEqual([null]);
});

test("synthetic ctrl+d closes wrapper ui", async () => {
  const { wrapper, results } = await mountWrapper(`
(defcomponent demo ()
  (view (text "Hello")))`);

  wrapper.handleInput("\u0004");
  expect(results).toEqual([null]);
});

test("synthetic arrow key still reaches component", async () => {
  const { wrapper, results } = await mountWrapper(`
(defcomponent demo ()
  (state (value 0))
  (view (text (str value)))
  (bind :right (set! value (+ value 1))))`);

  wrapper.handleInput("\u001b[C");
  expect(wrapper.render(10)).toEqual(["1"]);
  expect(results).toEqual([]);
});
