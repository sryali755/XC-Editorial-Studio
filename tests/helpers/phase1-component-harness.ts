import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiscoveryStudioSession } from "../../lib/discovery-studio";
import type { PreparationVersion } from "../../lib/types";
import { seedStudioDiscovery, studioPack } from "../../lib/discovery-studio";
type Element = React.ReactElement<Record<string, unknown>>;
function loadComponent(
  filename: string,
  require: (name: string) => unknown,
  confirmBuild: () => boolean = () => true,
) {
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const componentModule = {
    exports: {} as {
      default: (props: Record<string, unknown>) => React.ReactNode;
    },
  };
  runInNewContext(`(function(require,module,exports){${code}\n})`, {
    console,
    crypto: globalThis.crypto,
    structuredClone,
    setTimeout,
    clearTimeout,
    window: { confirm: confirmBuild },
  })(require, componentModule, componentModule.exports);
  return componentModule.exports;
}
export function componentHarness(
  initial: DiscoveryStudioSession,
  generate: (request: Record<string, unknown>) => Promise<PreparationVersion>,
  root = path.resolve(__dirname, "../.."),
) {
  const slots: unknown[] = [];
  let cursor = 0;
  const effects: (() => unknown)[] = [];
  let confirms = true;
  let session = structuredClone(initial),
    tree: React.ReactNode;
  const filename = path.join(root, "components/DiscoveryInputPack.tsx"),
    realRequire = createRequire(filename);
  const hooks = {
    ...React,
    useRef(value: unknown) {
      const i = cursor++;
      return (slots[i] ??= { current: value });
    },
    useEffect(effect: () => unknown) {
      effects.push(effect);
    },
    useState(value: unknown) {
      const i = cursor++;
      if (!(i in slots))
        slots[i] = typeof value === "function" ? value() : value;
      return [
        slots[i],
        (next: unknown) => {
          slots[i] = typeof next === "function" ? next(slots[i]) : next;
        },
      ];
    },
  };
  const childRequire = (name: string): unknown => {
    if (name === "react") return React;
    // Do not eagerly load browser-only PDF worker/import.meta code. Extraction
    // is covered by existing local fixture tests; the real upload control and
    // its parent's onImport callback are retained here.
    if (name === "@/lib/document-import")
      return { DOCUMENT_ACCEPT: ".pdf,.docx,.pptx,.txt,.md,.csv" };
    const target = name.startsWith("@/")
      ? path.join(root, name.slice(2))
      : name.startsWith("./")
        ? path.join(root, "components", name.slice(2))
        : name;
    // Playwright's normal TSX transform produces browser-serializable JSX,
    // not React SSR elements. Compile actual child component sources to React
    // JSX here too; no child UI is replaced with a passing stub.
    if (existsSync(`${target}.tsx`))
      return loadComponent(`${target}.tsx`, childRequire);
    const imported = realRequire(target);
    return name === "@/lib/preparation"
      ? { ...imported, preparationService: { generate } }
      : imported;
  };
  const localRequire = (name: string): unknown =>
    name === "react" ? hooks : childRequire(name);
  const component = loadComponent(filename, localRequire, () => confirms);
  function render() {
    cursor = 0;
    tree = component.default({
      session,
      discovery: seedStudioDiscovery(studioPack(session)),
      aiMode: "mock",
      onExplore() {},
      onBuildActivity() {},
      async onBuildCommit(
        next: DiscoveryStudioSession,
        expected: DiscoveryStudioSession,
      ) {
        if (session !== expected)
          throw Error("Workspace changed; replacement discarded.");
        session = next;
      },
      onChange(
        change:
          | DiscoveryStudioSession
          | ((current: DiscoveryStudioSession) => DiscoveryStudioSession),
      ) {
        session = typeof change === "function" ? change(session) : change;
      },
    });
    effects.splice(0).forEach((effect) => effect());
    return tree;
  }
  render();
  return {
    confirmBuild(value: boolean) {
      confirms = value;
    },
    render,
    get session() {
      return session;
    },
    get tree() {
      return tree;
    },
    replace(value: DiscoveryStudioSession) {
      session = structuredClone(value);
      render();
    },
    html() {
      return renderToStaticMarkup(tree);
    },
    async settle() {
      for (let i = 0; i < 5; i++)
        await new Promise((resolve) => setImmediate(resolve));
      render();
    },
  };
}
function componentChildren(node: Element): React.ReactNode {
  return typeof node.type === "function" &&
    node.type.name === "DynamicInputPackDetails"
    ? (node.type as (props: Record<string, unknown>) => React.ReactNode)(
        node.props,
      )
    : (node.props.children as React.ReactNode);
}
export function nodes(
  node: React.ReactNode,
  predicate: (element: Element) => boolean,
): Element[] {
  if (Array.isArray(node))
    return node.flatMap((child) => nodes(child, predicate));
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  // The current Input Pack delegates its summary to this pure component.
  // Expand its actual JSX for structural assertions, retaining every assertion.
  const children = componentChildren(node);
  return [...(predicate(node) ? [node] : []), ...nodes(children, predicate)];
}
export function text(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return React.isValidElement<{ children?: React.ReactNode }>(node)
    ? text(componentChildren(node))
    : "";
}
export function button(tree: React.ReactNode, name: string) {
  const found = nodes(
    tree,
    (el) =>
      el.type === "button" &&
      (el.props["aria-label"] === name || text(el).trim() === name),
  );
  if (found.length !== 1)
    throw new Error(`Expected one button '${name}', found ${found.length}`);
  return found[0];
}
export function click(element: Element) {
  if (element.props.disabled) throw new Error("Control is disabled");
  (element.props.onClick as () => unknown)();
}
