import { useEffect, useMemo, useRef, useState } from "react";
import {
  compileScene,
  evaluateScene,
  paintFrame,
  hitTest,
  closePointerLoop,
  samplePointer,
  type Scene,
  type PointerSample,
  type Frame,
  type RecordedSample,
} from "../../../packages/core/src";
import { useEditor } from "./store";
export const pointerRef: { current: PointerSample | null } = { current: null };
export function PosterPreview({
  scene,
  timeMs = 0,
  className = "",
}: {
  scene: Scene;
  timeMs?: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    try {
      const ctx = canvas.current?.getContext("2d");
      if (ctx)
        paintFrame(
          ctx,
          evaluateScene(compileScene(scene), {
            timeMs,
            pointer: samplePointer(scene, timeMs),
          }),
          0.2,
        );
    } catch {}
  }, [scene, timeMs]);
  return (
    <canvas
      ref={canvas}
      width={216}
      height={270}
      className={className}
      aria-hidden="true"
    />
  );
}
export function CanvasStage({ ready }: { ready: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    frame = useRef<Frame | null>(null),
    drag = useRef<{ x: number; y: number; id: number } | null>(null),
    record = useRef<RecordedSample[]>([]),
    lastRecord = useRef(-1);
  const scene = useEditor((s) => s.scene),
    selected = useEditor((s) => s.selected),
    affected = useEditor((s) => s.affected),
    recording = useEditor((s) => s.recording);
  const [error, setError] = useState(""),
    [fit, setFit] = useState(0);
  const holder = useRef<HTMLDivElement>(null);
  const compiled = useMemo(() => {
    if (!ready) return null;
    try {
      const result = compileScene(scene);
      return { result, error: "" };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : "Could not render this scene.",
      };
    }
  }, [scene, ready]);
  useEffect(() => {
    if (compiled) setError(compiled.error);
  }, [compiled]);
  useEffect(() => {
    const resize = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      setFit(Math.min((box.width - 80) / 1080, (box.height - 76) / 1350));
    });
    if (holder.current) resize.observe(holder.current);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    if (recording) {
      record.current = [];
      lastRecord.current = -1;
    }
  }, [recording]);
  useEffect(() => {
    let animation = 0,
      last = performance.now(),
      lastUi = 0;
    const draw = (now: number) => {
      const state = useEditor.getState();
      let t = state.timeMs;
      const delta = Math.min(80, now - last);
      last = now;
      if (state.playing && !document.hidden) {
        t += delta;
        if (t >= state.scene.timeline.durationMs && state.recording) {
          const samples = record.current.filter(
            (p) => p.timeMs < state.scene.timeline.durationMs,
          );
          const start = samples[0] ?? {
            timeMs: 0,
            x: 540,
            y: 675,
            presence: 0,
          };
          if (!samples.length) samples.push(start);
          samples.push({
            ...(pointerRef.current ?? start),
            timeMs: state.scene.timeline.durationMs,
          });
          useEditor.setState({
            recording: false,
            playing: false,
            timeMs: 0,
            livePointer: false,
          });
          try {
            const path = closePointerLoop(
              samples,
              state.scene.timeline.durationMs,
            );
            state.commit((d) => {
              d.pointer = {
                mode: "recorded",
                samples: path,
                seamPolicy: "blend-250ms",
              };
            }, "Recorded one pointer loop · 0.25 s loop blend");
          } catch (error) {
            useEditor.setState({
              notice:
                error instanceof Error
                  ? error.message
                  : "Recording failed. The previous path is preserved.",
            });
          }
          t = 0;
        } else t %= state.scene.timeline.durationMs;
        // The animation clock lives outside React; only the timeline subscribes to these updates.
        useEditor.setState({ timeMs: t });
      }
      if (
        useEditor.getState().recording &&
        Math.floor(t / 17) > lastRecord.current
      ) {
        record.current.push({
          timeMs: record.current.length
            ? Math.min(state.scene.timeline.durationMs - 1, Math.floor(t))
            : 0,
          ...(pointerRef.current ?? { x: 540, y: 675, presence: 0 }),
        });
        lastRecord.current = Math.floor(t / 17);
      }
      if (compiled?.result && canvas.current) {
        try {
          const next = evaluateScene(compiled.result, {
            timeMs: t,
            pointer: state.livePointer
              ? pointerRef.current
              : samplePointer(state.scene, t),
          });
          frame.current = next;
          const ctx = canvas.current.getContext("2d");
          if (ctx) {
            const scale = canvas.current.width / 1080;
            paintFrame(ctx, next, scale);
            ctx.save();
            ctx.scale(scale, scale);
            for (const id of [...state.selected, ...state.affected]) {
              const box = next.bounds[id];
              if (!box) continue;
              ctx.strokeStyle = state.affected.includes(id)
                ? "#5a7538"
                : "#a83220";
              ctx.lineWidth = 2 / Math.max(fit, 0.1);
              ctx.setLineDash([6 / Math.max(fit, 0.1), 4 / Math.max(fit, 0.1)]);
              ctx.strokeRect(
                box.x - 7,
                box.y - 7,
                box.width + 14,
                box.height + 14,
              );
            }
            ctx.restore();
          }
        } catch (e) {
          if (now - lastUi > 1000) {
            setError(e instanceof Error ? e.message : "Render error");
            lastUi = now;
          }
        }
      }
      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animation);
  }, [compiled, fit]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(1080, ((event.clientX - rect.left) * 1080) / rect.width),
      ),
      y: Math.max(
        0,
        Math.min(1350, ((event.clientY - rect.top) * 1350) / rect.height),
      ),
      presence: 1,
    };
  };
  return (
    <div className="stage" ref={holder}>
      <div className="stage-meta">
        <span>ARTBOARD 01</span>
        <span>1080 × 1350</span>
      </div>
      <div
        className="artboard-wrap"
        style={{
          width: Math.max(120, 1080 * fit),
          height: Math.max(150, 1350 * fit),
        }}
      >
        <canvas
          ref={canvas}
          className="artboard"
          width={Math.round(
            Math.max(120, 1080 * fit) * Math.min(devicePixelRatio, 2),
          )}
          height={Math.round(
            Math.max(150, 1350 * fit) * Math.min(devicePixelRatio, 2),
          )}
          aria-label="Poster artboard. Select and drag a layer; use the Layers panel for keyboard editing."
          tabIndex={0}
          onPointerDown={(event) => {
            const p = point(event);
            pointerRef.current = p;
            if (useEditor.getState().recording) return;
            const id = frame.current ? hitTest(frame.current, p.x, p.y) : null;
            const state = useEditor.getState();
            if (event.shiftKey) state.select(id, true);
            else if (!id || !state.selected.includes(id)) state.select(id);
            if (id && !state.scene.layers.find((l) => l.id === id)?.locked) {
              state.beginGesture();
              drag.current = { x: p.x, y: p.y, id: event.pointerId };
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerMove={(event) => {
            const p = point(event);
            pointerRef.current = p;
            if (drag.current)
              useEditor
                .getState()
                .moveGesture(p.x - drag.current.x, p.y - drag.current.y);
          }}
          onPointerUp={(event) => {
            if (drag.current) {
              useEditor.getState().endGesture();
              drag.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            useEditor.getState().endGesture(true);
            drag.current = null;
          }}
          onPointerLeave={() => {
            pointerRef.current = pointerRef.current
              ? { ...pointerRef.current, presence: 0 }
              : null;
          }}
        />
        {!ready && <div className="canvas-message">Setting the type…</div>}
      </div>
      {error && (
        <div className="render-error" role="alert">
          {error}
          <span>Adjust the text size or position to fit the artboard.</span>
        </div>
      )}
      <div className="stage-bottom">
        <span>
          {recording ? (
            <>
              <i className="record-dot" /> RECORDING ONE LOOP
            </>
          ) : selected.length ? (
            `${selected.length} LAYER${selected.length > 1 ? "S" : ""} SELECTED`
          ) : (
            "A LITTLE MOTION. A LOT OF CHARACTER."
          )}
        </span>
        <span>{Math.round(fit * 100)}% · FIT</span>
      </div>
      <p className="sr-only">
        {scene.layers
          .map((layer) =>
            layer.kind === "text"
              ? layer.text
              : `${layer.name}, ${layer.shape}`,
          )
          .join(". ")}
      </p>
    </div>
  );
}
