import { Pause, Play, RotateCcw, MousePointer2, Circle, X } from "lucide-react";
import { closePointerLoop } from "../../../packages/core/src";
import { useEditor } from "./store";
import { pointerRef } from "./CanvasStage";
export function Timeline({ onPreview }: { onPreview?: () => void } = {}) {
  const playing = useEditor((s) => s.playing),
    time = useEditor((s) => s.timeMs),
    duration = useEditor((s) => s.scene.timeline.durationMs),
    pointer = useEditor((s) => s.scene.pointer),
    live = useEditor((s) => s.livePointer),
    recording = useEditor((s) => s.recording);
  const changeDuration = (value: number) =>
    useEditor.getState().commit((scene) => {
      const old = scene.timeline.durationMs;
      scene.timeline.durationMs = value;
      scene.layers.forEach((l) =>
        l.behaviors.forEach((b) => {
          b.startMs = Math.round((b.startMs / old) * value);
          b.endMs = Math.round((b.endMs / old) * value);
        }),
      );
      if (scene.pointer.mode === "recorded")
        scene.pointer.samples = closePointerLoop(
          scene.pointer.samples.map((p) => ({
            ...p,
            timeMs: (p.timeMs / old) * value,
          })),
          value,
        );
    }, "Updated loop duration");
  return (
    <footer className="timeline">
      <div className="playback-buttons">
        <button
          className="icon-button"
          aria-label="Restart playback"
          onClick={() => {
            useEditor.getState().cancelRecording();
            useEditor.setState({ timeMs: 0, pausedPointer: undefined });
          }}
        >
          <RotateCcw size={15} />
        </button>
        <button
          className="play-button"
          aria-label={playing ? "Pause playback" : "Play poster"}
          onClick={() => {
            if (!playing) onPreview?.();
            useEditor.getState().setPlayback(!playing);
          }}
        >
          {playing ? (
            <Pause size={15} fill="currentColor" />
          ) : (
            <Play size={15} fill="currentColor" />
          )}
        </button>
      </div>
      <span className="time-code">
        {(time / 1000).toFixed(1).padStart(4, "0")}
        <small> / {(duration / 1000).toFixed(1)}s</small>
      </span>
      <div className="scrubber">
        <div className="timeline-ticks">
          <span>0</span>
          <span>{duration / 4000}</span>
          <span>{duration / 2000}</span>
          <span>{(duration * 3) / 4000}</span>
          <span>{duration / 1000}s</span>
        </div>
        <input
          type="range"
          aria-label="Playhead"
          min={0}
          max={duration}
          step={10}
          value={time}
          style={
            {
              "--progress": `${(time / duration) * 100}%`,
            } as React.CSSProperties
          }
          onChange={(e) => {
            useEditor.getState().enterEditMode();
            useEditor.setState({
              timeMs: Number(e.target.value),
              pausedPointer: undefined,
            });
          }}
        />
      </div>
      <label className="duration-control">
        Loop
        <select
          aria-label="Loop duration"
          value={duration}
          onChange={(e) => changeDuration(Number(e.target.value))}
        >
          {Array.from({ length: 81 }, (_, i) => 2000 + i * 100).map((d) => (
            <option value={d} key={d}>
              {(d / 1000).toFixed(1)}s
            </option>
          ))}
        </select>
      </label>
      <div className="pointer-control">
        <MousePointer2 size={14} />
        <select
          aria-label="Pointer mode"
          value={live ? "live" : pointer.mode}
          onChange={(e) => {
            useEditor.getState().cancelRecording();
            const mode = e.target.value;
            if (mode === "live") {
              useEditor.setState({
                livePointer: true,
                pausedPointer: undefined,
              });
              return;
            }
            useEditor.setState({ livePointer: false });
            if (mode === "fixed")
              useEditor.getState().commit((s) => {
                s.pointer = {
                  mode: "fixed",
                  sample: pointerRef.current ?? {
                    x: s.artboard.width / 2,
                    y: s.artboard.height / 2,
                    presence: 1,
                  },
                };
              }, "Pointer frozen");
            if (mode === "disabled")
              useEditor.getState().commit((s) => {
                s.pointer = { mode: "disabled" };
              }, "Pointer disabled");
            useEditor.setState({ pausedPointer: undefined });
          }}
        >
          <option value="disabled">Pointer off</option>
          <option value="live">Live pointer</option>
          <option value="fixed">Fixed pointer</option>
          {pointer.mode === "recorded" && (
            <option value="recorded">Recorded loop</option>
          )}
        </select>
        <button
          className={`record-button ${recording ? "active" : ""}`}
          title={
            recording
              ? "Cancel recording and keep the previous path"
              : "Record a single pointer loop"
          }
          aria-label={
            recording ? "Cancel pointer recording" : "Record pointer loop"
          }
          onClick={() => {
            if (recording) useEditor.getState().cancelRecording();
            else {
              onPreview?.();
              useEditor.getState().beginRecording();
            }
          }}
        >
          {recording ? (
            <X size={12} />
          ) : (
            <Circle size={10} fill="currentColor" />
          )}
          {recording ? "Cancel" : "Record"}
        </button>
      </div>
    </footer>
  );
}
