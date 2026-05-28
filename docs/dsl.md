# DSL Reference

Components and views are written in a minimal Lisp dialect — S-expressions with keywords (`:accent`), symbols, strings, numbers, and booleans.

---

## Module forms

### `defcomponent`

Interactive component with state, a view, key bindings, and optional timers.

```lisp
(defcomponent picker (title items)
  (state
    (cursor 0))

  (view
    (flex-col :gap 1
      (text title :accent)
      (each item items
        (option-row (= cursor __index__) item))))

  (bind :up    (set! cursor (max 0 (- cursor 1))))
  (bind :down  (set! cursor (min (- (len items) 1) (+ cursor 1))))
  (bind :enter (emit (list (nth items cursor) cursor)))
  (bind :escape (cancel)))
```

### `defview`

Pure, reusable layout fragment — no state or bindings.

```lisp
(defview option-row (focused label)
  (flex-row :gap 1
    (item :basis 2 (text (if focused ">" " ")))
    (item :grow 1 (text label :style (if focused :bold :muted)))))
```

Use inside a component view with `(use option-row ...)` or `(option-row ...)`.

---

## Layout primitives

### `text`

```lisp
(text "Hello")
(text value :accent)
(text label :style :muted)
(text "Bold" :bold true)
```

Styles: `:bold` `:dim` `:muted` `:accent` `:red` `:yellow` `:green` `:blue` `:magenta` `:cyan` `:inverse`

### `spacer`

```lisp
(spacer)     ; 1 blank line
(spacer 2)   ; 2 blank lines
```

### `row` / `col`

Natural horizontal / vertical stack with no flex sizing.

```lisp
(row (text "A") (text "B"))
(col (text "A") (text "B"))
```

### `flex-row` / `flex-col`

Flex container with optional gap.

```lisp
(flex-row :gap 1
  (item :basis 6 (text "Label"))
  (item :grow 1  (text "Value")))

(flex-col :gap 1
  (text "Line A")
  (text "Line B"))
```

### `item`

Flex child with fixed basis and/or grow factor.

```lisp
(item :basis 6 (text "Label"))   ; fixed 6-column width
(item :grow 1  (text "Fill"))    ; fills remaining space
(item :basis 4 :grow 1 (text "x")) ; fixed minimum + grow
```

### `grid`

Uniform-width columns.

```lisp
(grid :columns 2 :gap 2
  (col (text "L1") (text "L2"))
  (col (text "R1") (text "R2")))
```

### `bar`

Progress or range indicator, `value` is 0–1.

```lisp
(bar 0.5 :width 20)
(bar (ratio current min max) :width 24 :cursor "●" :fill "━" :empty "─" :style :accent)
```

---

## Control flow

### `use`

```lisp
(use option-row focused label)
```

### `each`

Iterates a list. `__index__` is available inside the body.

```lisp
(each item items
  (text item))

(each item items
  (option-row (= cursor __index__) item))
```

### `let`

```lisp
(let ((label "Gain") (pct (ratio value min max)))
  (flex-row :gap 1
    (text label :muted)
    (bar pct :width 20)))
```

### `if` / `when` / `cond`

```lisp
(if selected (text "on") (text "off"))

(when error (text error :red))

(cond
  ((< r 0.34) (text "low"  :green))
  ((< r 0.67) (text "mid"  :yellow))
  (else        (text "high" :red)))
```

### `do`

```lisp
(do
  (text "A")
  (text "B"))
```

---

## State and events

### `state`

```lisp
(state
  (cursor 0)
  (checked false)
  (value 50))
```

### `bind`

```lisp
(bind :left   (set! value (- value step)))
(bind :right  (set! value (+ value step)))
(bind :space  (set! checked (not checked)))
(bind :enter  (emit value))
(bind :escape (cancel))
```

Keys: `up` `down` `left` `right` `enter` `escape` `space` `tab` `backspace` and any single character.

### `every`

Repeating timer in milliseconds.

```lisp
(every 500
  (set! tick (mod (+ tick 1) 8)))
```

### `set!`

Mutate a state variable. The view re-renders automatically after each bound key or timer.

```lisp
(set! cursor (clamp (+ cursor 1) 0 (- (len items) 1)))
```

### `emit`

Resolve the component and return a value to the caller.

```lisp
(emit value)
(emit (list selected-label selected-index))
```

### `cancel`

Dismiss the component and return `null`.

```lisp
(cancel)
```

---

## Built-in functions

**Math:** `+ - * / mod abs round floor ceil min max clamp ratio`

`clamp(v lo hi)` — constrain `v` to `[lo, hi]`
`ratio(v lo hi)` — normalize `v` to 0–1 within `[lo, hi]`

**Compare:** `< > <= >= =`

**Logic:** `not and or`

**Strings:** `str join repeat pad pad-end`

```lisp
(str "Value: " current)
(pad-end label 12)
(repeat "─" width)
```

**Lists:** `len nth list append slice swap splice-move`

```lisp
(nth items cursor)
(len items)
(append items "new entry")
```

**Objects:** `field`

```lisp
(field record "name")
```

---

## Complete example — radio list

```lisp
(defview radio-option (focused selected label)
  (flex-row :gap 1
    (item :basis 2 (text (if focused ">" " ")))
    (item :basis 4 (text (if selected "(•)" "( )") :style (if selected :accent :muted)))
    (item :grow 1  (text label :style (if focused :bold :muted)))))

(defcomponent radio-list (title items selected-index)
  (state
    (cursor (if selected-index selected-index 0))
    (checked (if selected-index selected-index 0)))

  (view
    (flex-col :gap 1
      (text title :accent)
      (each item items
        (radio-option (= cursor __index__) (= checked __index__) item))
      (text "↑ ↓ navigate  Space select  Enter confirm" :muted)))

  (bind :up    (set! cursor (max 0 (- cursor 1))))
  (bind :down  (set! cursor (min (- (len items) 1) (+ cursor 1))))
  (bind :space (set! checked cursor))
  (bind :enter (emit (list (nth items checked) checked)))
  (bind :escape (cancel)))
```
