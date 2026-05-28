import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { instantiate, registerModule } from "./runtime.ts";

function mount(source: string, config: Record<string, unknown> = {}, callbacks?: Partial<Parameters<typeof instantiate>[2]>) {
  const def = registerModule(source).components[0]!;
  return instantiate(def, config, {
    done: () => {},
    cancel: () => {},
    requestRender: () => {},
    ...callbacks,
  });
}

function render(source: string, config: Record<string, unknown> = {}, width = 40) {
  return mount(source, config).render(width);
}

function stripAnsi(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, "");
}

test("row composes multiline children horizontally", () => {
  expect(render(`
(defcomponent demo ()
  (view
    (row
      (col (text "A1") (text "A2"))
      (text " | ")
      (col (text "B1") (text "B2")))))`)).toEqual(["A1 | B1", "A2   B2"]);
});

test("grid preserves multiline cells", () => {
  const lines = render(`
(defcomponent demo ()
  (view
    (grid :columns 2
      (col (text "L1") (text "L2"))
      (col (text "R1") (text "R2")))))`, {}, 20);
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatch(/^L1\s+R1$/);
  expect(lines[1]).toMatch(/^L2\s+R2$/);
});

test("flex-row basis and grow work", () => {
  expect(render(`
(defcomponent demo ()
  (view
    (flex-row :gap 1
      (item :basis 4 (text "x"))
      (item :grow 1 (text "y"))))`, {}, 10)[0]).toBe("x    y");
});

test("each plus use renders reusable rows", () => {
  expect(render(`
(defview option-row (focused label)
  (flex-row :gap 1
    (item :basis 2 (text (if focused ">" " ")))
    (item :grow 1 (text label))))

(defcomponent demo (items)
  (state (cursor 1))
  (view
    (each item items
      (use option-row (= cursor __index__) item))))`, { items: ["Apple", "Banana", "Cherry"] }, 20)).toEqual([
    "   Apple",
    ">  Banana",
    "   Cherry",
  ]);
});

test("modified CSI up key is recognized", () => {
  const component = mount(`
(defcomponent demo ()
  (state (value 0))
  (view (text (str value)))
  (bind :up (set! value (+ value 1))))`);
  expect(component.render(10)).toEqual(["0"]);
  component.handleInput?.("\u001b[1;1:2A");
  expect(component.render(10)).toEqual(["1"]);
});

test("keypresses trigger state updates and requestRender callbacks", () => {
  let renders = 0;
  const component = mount(`
(defcomponent demo ()
  (state (value 0))
  (view (text (str value)))
  (bind :right (set! value (+ value 1))))`, {}, {
    requestRender: () => { renders += 1; },
  });

  expect(component.render(10)).toEqual(["0"]);
  component.handleInput?.("\u001b[C");
  expect(component.render(10)).toEqual(["1"]);
  expect(renders).toBe(1);
});

test("rotary encoder responds to keypresses and emits on enter", () => {
  const source = readFileSync(".pi/ui-components/rotary-encoder.lisp", "utf8");
  let emitted: unknown = null;
  let renders = 0;
  const component = mount(source, {
    title: "Rotary Encoder",
    min: 0,
    max: 100,
    step: 5,
    value: 35,
  }, {
    done: (value) => { emitted = value; },
    requestRender: () => { renders += 1; },
  });

  expect(component.render(40).map(stripAnsi)).toContain("35");

  component.handleInput?.("l");
  expect(component.render(40).map(stripAnsi)).toContain("40");

  component.handleInput?.("\u001b[1;1:2A");
  expect(component.render(40).map(stripAnsi)).toContain("45");

  component.handleInput?.("\r");
  expect(emitted).toBe(45);
  expect(renders).toBe(3);
});

test("radio-list supports navigation, selection, emit, and cancel", () => {
  const source = readFileSync(".pi/ui-components/radio-list.lisp", "utf8");

  let emitted: unknown = null;
  const selected = mount(source, {
    title: "Choose",
    items: ["A", "B", "C"],
    selectedIndex: 0,
  }, {
    done: (value) => { emitted = value; },
  });

  selected.handleInput?.("\u001b[B");
  selected.handleInput?.(" ");
  selected.handleInput?.("\r");
  expect(emitted).toEqual(["B", 1]);

  for (const escapeKey of ["\u001b", "escape", "\u001b[27u", "\u001b[27;1u"]) {
    let cancelled = false;
    const cancelledComponent = mount(source, {
      title: "Choose",
      items: ["A", "B", "C"],
      selectedIndex: 0,
    }, {
      cancel: () => { cancelled = true; },
    });

    cancelledComponent.handleInput?.(escapeKey);
    expect(cancelled).toBe(true);
  }
});

test("escape ctrl+c and ctrl+d always cancel even without explicit bindings", () => {
  for (const key of ["\u001b", "escape", "\u001b[27u", "\u001b[27;1u", "\u0003", "\u0004", "ctrl+c", "ctrl+d"]) {
    let cancelled = false;
    const component = mount(`
(defcomponent demo ()
  (view (text "Hello")))`, {}, {
      cancel: () => { cancelled = true; },
    });

    component.handleInput?.(key);
    expect(cancelled).toBe(true);
  }
});
