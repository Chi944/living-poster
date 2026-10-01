import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  X,
  FlaskConical,
} from "lucide-react";
import {
  compileScene,
  evaluateScene,
  paintFrame,
  reviseScene,
  samplePointer,
  type Scene,
  type Behavior,
  type PointerSample,
} from "../../../packages/core/src";
import { MOTION_RECIPES, recipeBehaviors } from "./motion-recipes";
import { useEditor, updateLayer } from "./store";

export function applyMotionRecipe(
  layerId: string,
  recipeId: string,
  behaviors?: Behavior[],
) {
  const recipe = MOTION_RECIPES.find((item) => item.id === recipeId);
  if (!recipe) return false;
  const scene = useEditor.getState().scene;
  const applied = updateLayer(
    layerId,
    (layer) => {
      layer.behaviors = behaviors
        ? structuredClone(behaviors)
        : recipeBehaviors(
            recipeId,
            layer,
            scene.timeline.durationMs,
            scene.artboard,
          );
    },
    `${recipe.label} applied · click the canvas to edit, or Undo to restore the previous motion.`,
  );
  if (applied) {
    useEditor.setState({
      timeMs: 0,
      ...(recipe.pointer ? { livePointer: true } : {}),
    });
    useEditor.getState().setPlayback(true);
  }
  return applied;
}

function Preview({
  scene,
  playing,
  pointerEffect,
  time,
  onTime,
}: {
  scene: Scene;
  playing: boolean;
  pointerEffect: boolean;
  time: number;
  onTime: (value: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(time);
  const pointer = useRef<PointerSample | null>(null);
  const compiled = useMemo(() => compileScene(scene), [scene]);
  useEffect(() => {
    clock.current = time;
  }, [time]);
  useEffect(() => {
    if (playing) pointer.current = null;
  }, [playing]);
  useEffect(() => {
    let animation = 0,
      last = performance.now(),
      lastUi = 0;
    const draw = (now: number) => {
      if (playing && !document.hidden)
        clock.current =
          (clock.current + Math.min(80, now - last)) %
          scene.timeline.durationMs;
      last = now;
      if (!document.hidden && canvas.current) {
        const phase = (clock.current / scene.timeline.durationMs) * Math.PI * 2;
        const demoPointer = {
          x: scene.artboard.width * (0.5 + Math.sin(phase) * 0.28),
          y: scene.artboard.height * (0.5 + Math.cos(phase) * 0.12),
          presence: 1,
        };
        const activePointer = pointerEffect
          ? (pointer.current ?? demoPointer)
          : samplePointer(scene, clock.current);
        const context = canvas.current.getContext("2d");
        if (context) {
          const scale = canvas.current.width / scene.artboard.width;
          paintFrame(
            context,
            evaluateScene(compiled, {
              timeMs: clock.current,
              pointer: activePointer,
            }),
            scale,
          );
          if (pointerEffect && activePointer) {
            context.save();
            context.scale(scale, scale);
            context.beginPath();
            context.arc(
              activePointer.x,
              activePointer.y,
              12 / scale,
              0,
              Math.PI * 2,
            );
            context.strokeStyle = "#ffffff";
            context.lineWidth = 2 / scale;
            context.stroke();
            context.beginPath();
            context.arc(
              activePointer.x,
              activePointer.y,
              14 / scale,
              0,
              Math.PI * 2,
            );
            context.strokeStyle = "#101b2e";
            context.lineWidth = 1 / scale;
            context.stroke();
            context.restore();
          }
        }
        if (playing && now - lastUi > 100) {
          onTime(clock.current);
          lastUi = now;
        }
      }
      animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animation);
  }, [compiled, scene, playing, pointerEffect, onTime]);
  return (
    <canvas
      ref={canvas}
      className="motion-preview"
      aria-label="Motion preview"
      tabIndex={0}
      width={Math.round(
        scene.artboard.width * Math.min(1, 1000 / scene.artboard.height),
      )}
      height={Math.round(
        scene.artboard.height * Math.min(1, 1000 / scene.artboard.height),
      )}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointer.current = {
          x: ((event.clientX - rect.left) / rect.width) * scene.artboard.width,
          y: ((event.clientY - rect.top) / rect.height) * scene.artboard.height,
          presence: 1,
        };
      }}
      onPointerLeave={() => {
        pointer.current = null;
      }}
      onKeyDown={(event) => {
        if (
          !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
            event.key,
          )
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const old = pointer.current ?? {
          x: scene.artboard.width / 2,
          y: scene.artboard.height / 2,
          presence: 1,
        };
        pointer.current = {
          x: Math.max(
            0,
            Math.min(
              scene.artboard.width,
              old.x +
                (event.key === "ArrowRight"
                  ? 40
                  : event.key === "ArrowLeft"
                    ? -40
                    : 0),
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              scene.artboard.height,
              old.y +
                (event.key === "ArrowDown"
                  ? 40
                  : event.key === "ArrowUp"
                    ? -40
                    : 0),
            ),
          ),
          presence: 1,
        };
      }}
    />
  );
}

export function MotionPlayground({
  layerId,
  ready,
  onApply,
}: {
  layerId: string;
  ready: boolean;
  onApply?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Scene | null>(null);
  const [recipeId, setRecipeId] = useState("pressure");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const recipe = MOTION_RECIPES.find((item) => item.id === recipeId)!;
  const layer = source?.layers.find((item) => item.id === layerId);
  const choices = MOTION_RECIPES.filter(
    (item) =>
      (!item.textOnly || layer?.kind === "text") &&
      (category === "all" ||
        (category === "pointer"
          ? item.pointer
          : category === "type"
            ? item.textOnly
            : !item.pointer && !item.textOnly)),
  );
  const pages = Math.max(1, Math.ceil(choices.length / 6));
  const preview = useMemo(() => {
    if (!source) return { scene: null, error: "" };
    try {
      const scene = reviseScene(source);
      const target = scene.layers.find((item) => item.id === layerId)!;
      target.behaviors = recipeBehaviors(
        recipeId,
        target,
        scene.timeline.durationMs,
        scene.artboard,
      );
      compileScene(scene);
      return { scene, error: "" };
    } catch (error) {
      return {
        scene: null,
        error:
          error instanceof Error ? error.message : "Cannot preview this layer.",
      };
    }
  }, [source, recipeId, layerId]);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
    setPlaying(false);
  };
  return (
    <>
      <button
        className="motion-playground-launch"
        aria-label="Open motion playground"
        disabled={!ready}
        onClick={() => {
          useEditor.getState().enterEditMode();
          const current = useEditor.getState().scene;
          setSource(current);
          setCategory("all");
          setPage(0);
          setTime(0);
          setPlaying(false);
          setRecipeId(
            current.layers.find((item) => item.id === layerId)?.kind === "text"
              ? "pressure"
              : "pointer-turn",
          );
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        <FlaskConical size={22} />
        <span>
          <strong>Motion playground</strong>
          <small>Try responsive type before you apply it</small>
        </span>
        <ArrowRight size={17} />
      </button>
      <dialog
        ref={dialog}
        className="motion-dialog"
        aria-label="Motion playground"
        onCancel={() => {
          setOpen(false);
          setPlaying(false);
        }}
        onClose={() => {
          setOpen(false);
          setPlaying(false);
        }}
      >
        <header>
          <div>
            <h2>Motion playground</h2>
            <p>Explore on your poster. Apply when it feels right.</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close motion playground"
            onClick={close}
          >
            <X size={19} />
          </button>
        </header>
        {open && (
          <div className="motion-lab-body">
            <div className="motion-lab-stage">
              <div className="motion-preview-holder">
                {preview.scene ? (
                  <Preview
                    scene={preview.scene}
                    playing={playing}
                    pointerEffect={!!recipe.pointer}
                    time={time}
                    onTime={setTime}
                  />
                ) : (
                  <p role="alert">{preview.error}</p>
                )}
              </div>
              <div className="motion-preview-transport">
                <button
                  aria-label={
                    playing ? "Pause motion preview" : "Play motion preview"
                  }
                  onClick={() => setPlaying(!playing)}
                  disabled={!preview.scene}
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <input
                  aria-label="Preview time"
                  type="range"
                  min={0}
                  max={(source?.timeline.durationMs ?? 6000) - 1}
                  value={time}
                  onChange={(event) => {
                    setPlaying(false);
                    setTime(Number(event.target.value));
                  }}
                />
                <span>{(time / 1000).toFixed(1)}s</span>
              </div>
              <p className="motion-preview-hint">
                {recipe.pointer
                  ? "Move over the preview, or focus it and use arrow keys. Play moves the demo pointer."
                  : "Play or scrub to see the full loop."}
              </p>
            </div>
            <div className="motion-lab-controls">
              <label className="motion-category">
                Show
                <select
                  aria-label="Motion category"
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setPage(0);
                  }}
                >
                  <option value="all">All motion</option>
                  <option value="pointer">Pointer responsive</option>
                  <option value="type">Typography</option>
                  <option value="ambient">Ambient motion</option>
                </select>
              </label>
              <div className="motion-lab-choices">
                {choices.slice(page * 6, page * 6 + 6).map((item) => (
                  <button
                    key={item.id}
                    aria-label={`Preview ${item.label}`}
                    aria-pressed={recipeId === item.id}
                    onClick={() => {
                      setRecipeId(item.id);
                      setTime(0);
                    }}
                  >
                    <span aria-hidden="true">{item.symbol}</span>
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="motion-lab-pagination">
                <button
                  aria-label="Previous motion page"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  <ArrowLeft size={16} />
                </button>
                <span>
                  {page + 1} / {pages}
                </span>
                <button
                  aria-label="Next motion page"
                  disabled={page === pages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="motion-recipe-detail" aria-live="polite">
                <span>
                  {recipe.pointer
                    ? "Responds to your pointer"
                    : "Repeating motion"}
                </span>
                <h3>{recipe.label}</h3>
                <p>{recipe.description}.</p>
              </div>
              <p className="motion-apply-note">
                Replaces motion on “{layer?.name}”. Your text and layout stay in
                place. Undo restores the previous motion.
              </p>
              <button
                className="button motion-apply"
                aria-label={`Apply ${recipe.label} animation`}
                disabled={!preview.scene}
                onClick={() => {
                  const behaviors = preview.scene?.layers.find(
                    (item) => item.id === layerId,
                  )?.behaviors;
                  if (
                    behaviors &&
                    applyMotionRecipe(layerId, recipeId, behaviors)
                  ) {
                    close();
                    onApply?.();
                  }
                }}
              >
                Apply {recipe.label}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
