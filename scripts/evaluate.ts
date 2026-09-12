import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createOllamaProvider, type AiInput } from "../apps/api/src/provider";
import {
  applyOperations,
  defaultBehavior,
  newId,
  validateScene,
  type Scene,
  type TextLayer,
  type Layer,
} from "../packages/core/src/index";

interface EvaluationCase {
  id: string;
  category: string;
  instruction: string;
  preset?: string;
  selected?: string[];
  expectedKind?: "clarify" | "unsupported";
  targets?: string[];
  required?: {
    layer: string;
    behavior?: string;
    anchor?: string;
    path?: string;
    value?: unknown;
  }[];
  allowed?: Record<string, string[]>;
}

export function evaluationScene(preset?: string): Scene {
  const makeText = (
    id: string,
    name: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
  ): TextLayer => ({
    id,
    name,
    kind: "text",
    text,
    visible: true,
    locked: false,
    opacity: 1,
    layout: { x, y, rotationDeg: 0 },
    behaviors: [],
    fill: "#20211f",
    fontId: "space-regular",
    fontSize,
    lineHeight: 1.2,
    trackingEm: 0,
    align: "center",
  });
  const layers: Layer[] = [
    makeText("layer-headline", "Headline", "GRAVITY", 540, 550, 144),
    makeText("layer-subtitle", "Subtitle", "A STUDY IN MOTION", 540, 900, 40),
    {
      ...makeText(
        "layer-caption",
        "Caption",
        "Words have weight.",
        100,
        1210,
        24,
      ),
      align: "left",
    },
    {
      id: "layer-circle",
      name: "Circle",
      kind: "shape",
      shape: "ellipse",
      visible: true,
      locked: false,
      opacity: 1,
      layout: { x: 540, y: 720, rotationDeg: 0 },
      behaviors: [],
      fill: "#a83220",
      width: 80,
      height: 80,
    },
    makeText("layer-label", "Label", "2026", 900, 120, 18),
  ];
  if (preset === "headline-float") {
    const b = defaultBehavior("float", 6000, layers[0]);
    b.id = "behavior-existing-float";
    layers[0].behaviors = [b];
  }
  if (preset === "duplicate-headline")
    layers.push(
      makeText("layer-duplicate", "Second headline", "GRAVITY", 540, 1050, 70),
    );
  return validateScene({
    schemaVersion: 1,
    rendererVersion: "1.0.0",
    id: "evaluation-scene",
    revision: { id: "evaluation-revision", parentId: null },
    seed: 42873,
    artboard: { width: 1080, height: 1350, background: "#f3f0e8" },
    timeline: { durationMs: 6000, fps: 30, loop: true },
    fonts: [{ id: "space-regular", assetHash: "bundled-v1" }],
    layers,
    pointer: { mode: "disabled" },
  });
}

function at(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (v, key) =>
        v && typeof v === "object"
          ? (v as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}
function equal(a: unknown, b: unknown) {
  return typeof a === "string" &&
    typeof b === "string" &&
    a.startsWith("#") &&
    b.startsWith("#")
    ? a.toLowerCase() === b.toLowerCase()
    : JSON.stringify(a) === JSON.stringify(b);
}
function changedPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (equal(a, b)) return [];
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) ||
    Array.isArray(b)
  )
    return [prefix];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((key) =>
    changedPaths(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      prefix ? `${prefix}.${key}` : key,
    ),
  );
}

async function run() {
  const caseSet = process.env.EVAL_CASES || "evals/held-out.json";
  const casesText = await readFile(caseSet, "utf8");
  const cases = JSON.parse(casesText) as EvaluationCase[];
  const model = process.env.OLLAMA_MODEL || "qwen3:4b";
  const provider = createOllamaProvider("http://127.0.0.1:11434", model);
  const available = await provider.available();
  if (!available.available) throw new Error(available.reason);
  const selectedCases = process.env.EVAL_LIMIT
    ? cases.slice(0, Number(process.env.EVAL_LIMIT))
    : cases;
  const results: Record<string, unknown>[] = [];
  const startedAt = new Date().toISOString();
  for (const item of selectedCases) {
    const scene = evaluationScene(item.preset);
    const input: AiInput = {
      requestId: newId(),
      scene,
      selectedLayerIds: scene.layers
        .filter((l) => item.selected?.includes(l.name))
        .map((l) => l.id),
      instruction: item.instruction,
      allowTextChanges: false,
      baseRevisionId: scene.revision.id,
      requestGeneration: 1,
      mutationEpoch: 0,
    };
    const started = performance.now();
    try {
      const output = await provider.generate(
        input,
        AbortSignal.timeout(90_000),
      );
      const response = output.result;
      let targetCorrect = response.kind === "edit",
        preservationCorrect = true,
        effectsCorrect = response.kind === "edit";
      const failures: string[] = [];
      if (response.kind !== (item.expectedKind ?? "edit"))
        failures.push(
          `Expected ${item.expectedKind ?? "edit"}, received ${response.kind}`,
        );
      if (response.kind === "edit") {
        const applied = applyOperations(scene, response.operations, {
          allowTextChanges: false,
        });
        const targets = [
          ...new Set(
            response.operations.map(
              (op) => scene.layers.find((l) => l.id === op.layerId)!.name,
            ),
          ),
        ].sort();
        targetCorrect = equal(targets, [...(item.targets ?? [])].sort());
        for (const layer of scene.layers) {
          const next = applied.scene.layers.find((l) => l.id === layer.id)!;
          const changes = changedPaths(layer, next);
          if (
            changes.some(
              (path) =>
                !(item.allowed?.[layer.name] ?? []).some(
                  (allowed) =>
                    path === allowed || path.startsWith(`${allowed}.`),
                ),
            )
          )
            preservationCorrect = false;
          if (
            layer.kind === "text" &&
            (next.kind !== "text" || layer.text !== next.text)
          )
            preservationCorrect = false;
          if (item.preset === "headline-float")
            for (const behavior of layer.behaviors)
              if (
                !equal(
                  behavior,
                  next.behaviors.find((b) => b.id === behavior.id),
                )
              )
                preservationCorrect = false;
        }
        for (const expected of item.required ?? []) {
          const layer = applied.scene.layers.find(
            (l) => l.name === expected.layer,
          );
          if (!layer) {
            effectsCorrect = false;
            continue;
          }
          if (expected.path && !equal(at(layer, expected.path), expected.value))
            effectsCorrect = false;
          if (expected.behavior) {
            const b = layer.behaviors.find(
              (b) => b.type === expected.behavior && b.enabled,
            );
            if (!b) effectsCorrect = false;
            if (
              expected.anchor &&
              (!b ||
                !("anchor" in b.params) ||
                b.params.anchor.type !== "layer" ||
                b.params.anchor.layerId !==
                  scene.layers.find((l) => l.name === expected.anchor)?.id)
            )
              effectsCorrect = false;
          }
        }
        if (!targetCorrect) failures.push("Incorrect targets");
        if (!preservationCorrect) failures.push("Unrelated properties changed");
        if (!effectsCorrect) failures.push("Required effect missing or wrong");
      }
      const result = {
        id: item.id,
        category: item.category,
        valid: true,
        passed: !failures.length,
        targetCorrect,
        preservationCorrect,
        effectsCorrect,
        latencyMs: Math.round(performance.now() - started),
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
        cost: 0,
        failures,
        response,
      };
      results.push(result);
      console.log(
        `${item.id}: ${result.passed ? "PASS" : "FAIL"} ${result.latencyMs} ms${failures.length ? ` (${failures.join("; ")})` : ""}`,
      );
    } catch (error) {
      results.push({
        id: item.id,
        category: item.category,
        valid: false,
        passed: false,
        latencyMs: Math.round(performance.now() - started),
        cost: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(
        `${item.id}: ERROR ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  const latencies = results
    .map((r) => r.latencyMs as number)
    .sort((a, b) => a - b);
  const determinates = results.filter(
    (r) => !["ambiguous", "unsupported"].includes(r.category as string),
  );
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    model,
    runtime: "Ollama local",
    cost: 0,
    caseSet,
    caseSetSha256: createHash("sha256").update(casesText).digest("hex"),
    providerSha256: createHash("sha256")
      .update(await readFile("apps/api/src/provider.ts"))
      .digest("hex"),
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    valid: results.filter((r) => r.valid).length,
    correctTargets: determinates.filter(
      (r) => r.targetCorrect && r.passed !== undefined,
    ).length,
    determinateCases: determinates.length,
    preserved: determinates.filter((r) => r.preservationCorrect).length,
    p50LatencyMs: latencies[Math.floor(latencies.length * 0.5)],
    p95LatencyMs:
      latencies[
        Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)
      ],
    humanReview:
      "Pending independent human creative review; not replaced by automated checks.",
    results,
  };
  await mkdir("evals/results", { recursive: true });
  const filename = `evals/results/${startedAt.replaceAll(":", "-").replaceAll(".", "-")}-${model.replace(/[^a-z0-9-]/gi, "-")}.json`;
  await writeFile(filename, JSON.stringify(report, null, 2));
  console.log(
    `Saved ${filename}\n${report.passed}/${report.total} passed; ${report.valid}/${report.total} valid; p95 ${report.p95LatencyMs} ms; API cost $0.`,
  );
}
if (process.argv[1]?.endsWith("evaluate.ts")) await run();
