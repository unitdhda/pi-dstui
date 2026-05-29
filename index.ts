import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { join } from "node:path";
import { ModuleLoader } from "./src/loader.ts";
import { makeUiRunner } from "./src/runner.ts";

export { makeUiRunner } from "./src/runner.ts";

const LOCAL_ROOT = join(process.cwd(), ".pi");
const LOCAL_SKILLS_ROOT = join(LOCAL_ROOT, "skills");

export default function (pi: ExtensionAPI) {
  const loader = new ModuleLoader(LOCAL_ROOT);
  loader.loadPersisted("global");
  loader.loadPersisted("local");

  pi.on("resources_discover", async () => ({
    skillPaths: [LOCAL_SKILLS_ROOT],
  }));

  pi.registerTool({
    name: "tui_define_component",
    label: "TUI Define Component",
    description: "Register and save a Lisp UI DSL module with defcomponent/defview forms.",
    promptSnippet: "Save or update a local Lisp DSL module for the TUI runtime.",
    promptGuidelines: ["Use tui_define_component to save or update DSL modules under .pi/ui-components/."],
    parameters: Type.Object({
      source: Type.String({ description: "Lisp DSL source" }),
      scope: Type.Optional(Type.Union([Type.Literal("local"), Type.Literal("global")])),
      module: Type.Optional(Type.String({ description: "Module/file name override" })),
    }),
    async execute(_toolCallId, params) {
      try {
        const scope = (params.scope ?? "local") as "local" | "global";
        const module = (params.module || loader.moduleNameFromSource(params.source, "module")).replace(/\.lisp$/, "");
        const entry = loader.persist(scope, module, params.source);
        return {
          content: [{ type: "text", text: `Saved ${scope} module ${module}` }],
          details: { success: true, ...entry },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Failed to save module: ${message}` }],
          details: { success: false, error: message },
        };
      }
    },
  });

  pi.registerTool({
    name: "tui_create_dynamic_ui",
    label: "TUI Create Dynamic UI",
    description: "Run a registered DSL component by name.",
    promptSnippet: "Run a saved TUI DSL component by name with config props.",
    promptGuidelines: [
      "Use tui_create_dynamic_ui to launch a saved DSL component after tui_define_component or after editing a .lisp file.",
    ],
    parameters: Type.Object({
      componentId: Type.String({ description: "Unique instance id" }),
      type: Type.String({ description: "Registered component name" }),
      title: Type.String({ description: "UI title" }),
      config: Type.Record(Type.String(), Type.Any(), { description: "Component config/props" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const found = loader.tryLoadByName(params.type);
      if (!found) {
        return {
          content: [{ type: "text", text: `Unknown component: ${params.type}` }],
          details: { success: false, error: "unknown_component", type: params.type },
        };
      }

      const result = await ctx.ui.custom<unknown>(makeUiRunner(found.def, params.config ?? {}));
      const resultText = (() => { try { return JSON.stringify(result); } catch { return String(result); } })();
      return {
        content: [{ type: "text", text: `Ran ${params.type}\nresult: ${resultText}` }],
        details: {
          success: true,
          componentId: params.componentId,
          type: params.type,
          title: params.title,
          result,
        },
      };
    },
  });
}
