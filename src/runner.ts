import { getKeybindings, matchesKey, Key } from "@earendil-works/pi-tui";
import { instantiate, type ComponentDef } from "./runtime.ts";
import { isKillerInput } from "./exit.ts";

export function makeUiRunner(def: ComponentDef, config: Record<string, unknown>) {
  return (
    tui: { requestRender: () => void; setFocus: (component: never) => void },
    _theme: unknown,
    _keybindings: unknown,
    done: (value: unknown) => void,
  ) => {
    const component = instantiate(def, config, {
      done,
      cancel: () => done(null),
      requestRender: () => tui.requestRender(),
    });

    const wrapper = {
      focused: false,
      render(width: number) {
        return component.render(width);
      },
      invalidate() {
        component.invalidate?.();
      },
      handleInput(data: string) {
        const kb = getKeybindings();
        if (
          kb.matches(data, "tui.select.cancel") ||
          kb.matches(data, "app.interrupt") ||
          kb.matches(data, "app.exit") ||
          matchesKey(data, Key.ctrl("c")) ||
          matchesKey(data, Key.ctrl("d")) ||
          isKillerInput(data)
        ) {
          done(null);
          return;
        }

        component.handleInput?.(data);
        tui.requestRender();
      },
      dispose() {
        component.dispose();
      },
    };

    tui.setFocus(wrapper as never);
    tui.requestRender();
    return wrapper;
  };
}
