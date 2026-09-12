import { describe, expect, it } from "vitest";
import {
  buildModelMessages,
  interpretReply,
  modelReplySchema,
  type AiInput,
} from "../apps/api/src/provider";
import {
  applyOperations,
  EXAMPLES,
  resizeScene,
} from "../packages/core/src/index";

function input(scene = EXAMPLES[0].scene): AiInput {
  return {
    requestId: "motion-v2",
    scene,
    selectedLayerIds: [scene.layers[0].id],
    instruction: "Make the selected layer pulse",
    allowTextChanges: false,
    baseRevisionId: scene.revision.id,
    requestGeneration: 1,
    mutationEpoch: 1,
  };
}

describe("extended local model vocabulary", () => {
  for (const [motion, parameter, value] of [
    ["pulse", "amount", 0.25],
    ["pendulum", "angleDeg", 18],
    ["bounce", "height", 50],
    ["reveal", "minOpacity", 0.2],
  ] as const) {
    it(`validates and applies ${motion} with explicit tuning`, () => {
      const request = input();
      const layerId = request.scene.layers[0].id;
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
      expect(reply.kind).toBe("edit");
      if (reply.kind !== "edit") return;
      const next = applyOperations(request.scene, reply.operations, {
        allowTextChanges: false,
      }).scene;
      expect(next.rendererVersion).toBe("1.1.0");
      const behavior = next.layers[0].behaviors.find(
        (behavior) => behavior.type === motion,
      )!;
      expect((behavior.params as Record<string, unknown>)[parameter]).toBe(
        value,
      );
      expect(next.layers.slice(1)).toEqual(request.scene.layers.slice(1));
      expect(() =>
        interpretReply(
          {
            kind: "edit",
            actions: [
              {
                action: "motionParameter",
                layerId,
                motion,
                parameter,
                value: 10000,
              },
            ],
          },
          request,
        ),
      ).toThrow();
    });
  }
  it("accepts positions beyond the old portrait edge on a landscape canvas", () => {
    const request = input(resizeScene(EXAMPLES[0].scene, 1920, 1080));
    expect(
      modelReplySchema(request).safeParse({
        kind: "edit",
        actions: [
          {
            action: "position",
            layerId: request.scene.layers[0].id,
            axis: "x",
            value: 1700,
          },
        ],
      }).success,
    ).toBe(true);
  });
  it("centers default attraction on the selected canvas dimensions", () => {
    const request = input(resizeScene(EXAMPLES[0].scene, 1920, 1080));
    const layerId = request.scene.layers[0].id;
    const reply = interpretReply(
      {
        kind: "edit",
        actions: [{ action: "animate", layerId, motion: "attract" }],
      },
      request,
    );
    expect(reply.kind).toBe("edit");
    if (reply.kind !== "edit") return;
    const next = applyOperations(request.scene, reply.operations).scene;
    const behavior = next.layers
      .find((layer) => layer.id === layerId)!
      .behaviors.find((behavior) => behavior.type === "attract");
    expect(behavior).toMatchObject({
      type: "attract",
      params: { anchor: { type: "point", x: 960, y: 540 } },
    });
    expect(next.layers.slice(1)).toEqual(request.scene.layers.slice(1));
  });
  it("keeps all starter scenes within the bounded model context", () => {
    for (const example of EXAMPLES)
      expect(() => buildModelMessages(input(example.scene))).not.toThrow();
  });
});
