import { describe, expect, it } from "vitest";
import {
  buildModelMessages,
  interpretReply,
  modelReplySchema,
  type AiInput,
} from "../apps/api/src/provider";
import {
  EXAMPLES,
  applyOperations,
  cloneScene,
  defaultBehavior,
  validateScene,
  type Scene,
} from "../packages/core/src";

function input(scene = EXAMPLES[0]!.scene): AiInput {
  return {
    requestId: "pointer-motion",
    scene,
    selectedLayerIds: [scene.layers[0]!.id],
    instruction: "Make the selected text respond to my pointer",
    allowTextChanges: false,
    baseRevisionId: scene.revision.id,
    requestGeneration: 1,
    mutationEpoch: 1,
  };
}
function crowdedScene(): Scene {
  const scene = cloneScene(EXAMPLES[0]!.scene);
  scene.rendererVersion = "1.3.0";
  scene.layers = Array.from({ length: 20 }, (_, index) => ({
    id: `shape-${index}`,
    name: `Needle ${index}`,
    kind: "shape",
    shape: "rect",
    width: 42,
    height: 8,
    fill: "#FFFFFF",
    visible: index !== 1,
    locked: index === 2,
    opacity: index === 3 ? 0.4 : 1,
    layout: { x: 100 + index * 30, y: 500, rotationDeg: index === 4 ? 12 : 0 },
    behaviors: [],
  }));
  for (const [index, layer] of scene.layers.entries()) {
    if (index === 5) continue;
    const behavior = defaultBehavior(
      "pointerTurn",
      scene.timeline.durationMs,
      layer,
    );
    behavior.id = `turn-${index}`;
    if (index === 6) behavior.enabled = false;
    if (index === 7) {
      behavior.startMs = 1000;
      behavior.endMs = 4000;
    }
    layer.behaviors = [behavior];
  }
  return validateScene(scene);
}
function restoreLayers(user: Record<string, any>) {
  const defaults = user.omittedDefaults;
  if (!defaults) return user.scene.layers;
  return user.scene.layers.map((packed: Record<string, any>) => {
    const { layerPreset, behaviorIds, ...own } = packed;
    const layer = {
      ...(layerPreset ? user.layerPresets[layerPreset] : {}),
      ...own,
    };
    if (behaviorIds)
      layer.behaviors = layer.behaviors.map(
        (behavior: Record<string, unknown>, i: number) => ({
          ...behavior,
          id: behaviorIds[i],
        }),
      );
    return {
      ...defaults.layer,
      ...layer,
      layout: { ...defaults.layout, ...layer.layout },
      behaviors: (layer.behaviors ?? defaults.layer.behaviors).map(
        (behavior: Record<string, unknown>) => {
          const { preset, ...values } = behavior;
          return {
            ...defaults.behavior,
            ...(preset ? user.motionPresets[preset as string] : {}),
            ...values,
          };
        },
      ),
    };
  });
}

describe("pointer motion interpretation", () => {
  it.each([
    ["pressure", "amount", 0.5, "glyph"],
    ["pointerTurn", "angleDeg", 80, "glyph"],
  ] as const)(
    "accepts and tunes %s without changing wording or other layers",
    (motion, parameter, value, scope) => {
      const request = input(),
        before = cloneScene(request.scene),
        layerId = request.scene.layers[0]!.id;
      const reply = interpretReply(
        {
          kind: "edit",
          actions: [
            { action: "animate", layerId, motion },
            { action: "motionParameter", layerId, motion, parameter, value },
          ],
        },
        request,
      );
      if (reply.kind !== "edit") throw Error("Expected edit");
      const scene = applyOperations(request.scene, reply.operations).scene;
      expect(
        scene.layers[0]!.behaviors.find((b) => b.type === motion),
      ).toMatchObject({
        type: motion,
        scope,
        params: { [parameter]: value },
      });
      expect(scene.layers.slice(1)).toEqual(before.layers.slice(1));
      expect(request.scene).toEqual(before);
      const remove = interpretReply(
        { kind: "edit", actions: [{ action: "stop", layerId, motion }] },
        input(scene),
      );
      if (remove.kind !== "edit") throw Error("Expected edit");
      expect(
        applyOperations(
          scene,
          remove.operations,
        ).scene.layers[0]!.behaviors.some((b) => b.type === motion),
      ).toBe(false);
    },
  );

  it("turns shapes at layer scope and rejects text pressure on a shape atomically", () => {
    const request = input(crowdedScene()),
      layerId = request.scene.layers[0]!.id;
    const before = cloneScene(request.scene);
    const reply = interpretReply(
      {
        kind: "edit",
        actions: [{ action: "animate", layerId, motion: "pointerTurn" }],
      },
      request,
    );
    if (reply.kind !== "edit") throw Error("Expected edit");
    expect(
      applyOperations(request.scene, reply.operations).scene.layers[0]!
        .behaviors[0],
    ).toMatchObject({ type: "pointerTurn", scope: "layer" });
    expect(() =>
      interpretReply(
        {
          kind: "edit",
          actions: [
            { action: "opacity", layerId, value: 0.5 },
            { action: "animate", layerId, motion: "pressure" },
          ],
        },
        request,
      ),
    ).toThrow(/Glyph motion requires text/);
    expect(request.scene).toEqual(before);
  });

  it.each([
    ["pressure", "amount", 0.61],
    ["pressure", "radius", 601],
    ["pointerTurn", "angleDeg", 91],
    ["pointerTurn", "radius", 1001],
    ["pressure", "angleDeg", 30],
    ["pointerTurn", "amount", 0.5],
  ] as const)("rejects invalid %s %s=%s", (motion, parameter, value) => {
    const request = input();
    expect(() =>
      interpretReply(
        {
          kind: "edit",
          actions: [
            {
              action: "motionParameter",
              layerId: request.scene.layers[0]!.id,
              motion,
              parameter,
              value,
            },
          ],
        },
        request,
      ),
    ).toThrow();
  });

  it("keeps a closed motion vocabulary and reports verified capabilities", () => {
    const request = input();
    expect(
      modelReplySchema(request).safeParse({
        kind: "edit",
        actions: [
          {
            action: "animate",
            layerId: request.scene.layers[0]!.id,
            motion: "arbitraryShader",
          },
        ],
      }).success,
    ).toBe(false);
    const unsupported = interpretReply(
      { kind: "unsupported", explanation: "invented" },
      request,
    );
    expect(unsupported).toMatchObject({
      kind: "unsupported",
      explanation: expect.stringContaining("pointer-pressure"),
    });
  });
});

describe("lossless bounded scene context", () => {
  it("preserves complete small-poster JSON without compaction", () => {
    const request = input(),
      messages = buildModelMessages(request),
      user = JSON.parse(messages[1]!.content);
    expect(user).toEqual({
      instruction: request.instruction,
      selectedLayerIds: request.selectedLayerIds,
      allowTextChanges: false,
      scene: {
        artboard: request.scene.artboard,
        timeline: request.scene.timeline,
        layers: request.scene.layers,
      },
    });
    expect(messages[0]!.content).not.toContain("COMPACT SCENE:");
  });

  it("removes only declared defaults and reconstructs every layer exactly", () => {
    const request = input(crowdedScene()),
      before = cloneScene(request.scene);
    request.selectedLayerIds = ["shape-2", "shape-7"];
    const messages = buildModelMessages(request),
      user = JSON.parse(messages[1]!.content),
      defaults = user.omittedDefaults;
    expect(defaults).toBeDefined();
    expect(messages[0]!.content).toContain("COMPACT SCENE:");
    expect(user.selectedLayerIds).toEqual(request.selectedLayerIds);
    expect(user.instruction).toBe(request.instruction);
    const restored = restoreLayers(user);
    expect(restored).toEqual(request.scene.layers);
    expect(request.scene).toEqual(before);
    expect(user.scene.artboard).toEqual(request.scene.artboard);
    expect(user.scene.timeline).toEqual(request.scene.timeline);
    expect(
      messages.reduce(
        (sum, message) =>
          sum + new TextEncoder().encode(message.content).byteLength,
        0,
      ),
    ).toBeLessThanOrEqual(13000);
  });

  it("fits every template without dropping selected or unselected layer identities", () => {
    let sawPresets = false;
    for (const example of EXAMPLES) {
      const request = input(example.scene),
        messages = buildModelMessages(request),
        user = JSON.parse(messages[1]!.content);
      expect(
        user.scene.layers.map((layer: { id: string }) => layer.id),
      ).toEqual(example.scene.layers.map((layer) => layer.id));
      expect(
        messages.reduce(
          (sum, message) =>
            sum + new TextEncoder().encode(message.content).byteLength,
          0,
        ),
      ).toBeLessThanOrEqual(13000);
      sawPresets ||= !!user.motionPresets;
      expect(restoreLayers(user)).toEqual(example.scene.layers);
    }
    expect(sawPresets).toBe(true);
  });

  it("still rejects oversized meaningful context instead of truncating it", () => {
    const request = input(crowdedScene());
    request.instruction = "Keep all layers. ".repeat(1000);
    expect(() => buildModelMessages(request)).toThrow(/too large/);
    request.instruction = "Make the poster brighter";
    request.scene.layers = Array.from({ length: 64 }, (_, index) => ({
      ...request.scene.layers[index % 20]!,
      id: `dense-${index}`,
    }));
    expect(() => buildModelMessages(request)).toThrow(/too large/);
  });
});
