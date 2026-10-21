import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as React from "react";
import { nodes } from "./phase1-component-harness";
import type { DiscoveryState, StrategyInputPack } from "../../lib/types";
import type { generateDiscoveryVersion } from "../../lib/discovery";

// Actual feature/orchestration, dependency-injected only at the model boundary.
// Card DOM is exercised separately by the guarded browser suite.
export function featureHarness(
  initial: DiscoveryState,
  initialPack: StrategyInputPack,
  generate: typeof generateDiscoveryVersion,
) {
  const filename = path.resolve(
    __dirname,
    "../../components/InsightDiscoveryFeature.tsx",
  );
  const require = createRequire(filename),
    slots: unknown[] = [],
    effects: (() => unknown)[] = [];
  let cursor = 0,
    state = structuredClone(initial),
    pack = structuredClone(initialPack),
    tree: React.ReactNode;
  const hooks = {
    ...React,
    useMemo: (factory: () => unknown) => factory(),
    useRef: (value: unknown) => {
      const i = cursor++;
      return (slots[i] ??= { current: value });
    },
    useState: (value: unknown) => {
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
    useEffect: (effect: () => unknown, deps: unknown[]) => {
      const i = cursor++,
        prior = slots[i] as unknown[] | undefined;
      if (!prior || deps.some((dep, at) => !Object.is(dep, prior[at]))) {
        slots[i] = deps;
        effects.push(effect);
      }
    },
  };
  const ui = () => null;
  const localRequire = (name: string): unknown => {
    if (name === "react") return hooks;
    if (
      name === "./DiscoveryRoundTableV2" ||
      name === "./InsightDiscoveryWorkspace"
    )
      return { default: ui, __esModule: true };
    if (name === "./useDiscoveryDialog") return { useDiscoveryDialog() {} };
    const actual = require(
      name.startsWith("@/")
        ? path.resolve(__dirname, "../..", name.slice(2))
        : name,
    );
    return name === "@/lib/discovery"
      ? { ...actual, generateDiscoveryVersion: generate }
      : actual;
  };
  const componentModule = {
    exports: {} as {
      default: (props: Record<string, unknown>) => React.ReactNode;
    },
  };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  runInNewContext(`(function(require,module,exports){${code}\n})`, {
    console,
    crypto: globalThis.crypto,
    structuredClone,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
  })(localRequire, componentModule, componentModule.exports);
  function render() {
    cursor = 0;
    tree = componentModule.exports.default({
      open: true,
      autoStart: false,
      presentation: "page",
      state,
      pack,
      briefLine: state.humanBriefLine ?? "",
      onStateChange: (next: DiscoveryState) => {
        state = next;
      },
      getCurrentState: () => state,
      getCurrentPack: () => pack,
      onClose() {},
      onApprove() {},
    });
    effects.splice(0).forEach((effect) => effect());
  }
  render();
  return {
    render,
    get state() {
      return state;
    },
    replace(next: DiscoveryState, nextPack = pack) {
      state = structuredClone(next);
      pack = structuredClone(nextPack);
      render();
      render();
    },
    get handlers() {
      render();
      return nodes(
        tree,
        (node) => typeof node.props.onRunLens === "function",
      )[0].props as unknown as {
        onRunLens: (
          request: Parameters<
            typeof import("../../lib/discovery-state").beginDiscoveryRequest
          >[1],
        ) => Promise<boolean>;
        onRefreshAll: () => Promise<void>;
        onRetryLens: (lens: string) => Promise<boolean>;
        busy: string[];
      };
    },
  };
}
