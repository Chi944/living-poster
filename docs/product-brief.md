Build Living Poster: a creative tool where typography behaves like its meaning.

I want a visually distinctive portfolio project demonstrating frontend graphics, full-stack engineering, AI-assisted creative editing, and reliable asynchronous state management.

Build entirely from scratch in a new project. Do not reuse or modify my existing projects.

Target a polished first release achievable in roughly 1–2 weeks.

FOR THIS FIRST TURN

Plan only. Inspect the development environment and propose the architecture, scene format, rendering approach, interface direction, implementation milestones, and acceptance criteria.

Resolve routine choices yourself. Ask only questions that materially affect the build. Do not implement during this planning turn.

PRODUCT EXPERIENCE

Users create animated typographic posters through a combination of natural language and direct manipulation.

Example requests:
- Make “gravity” pull the other words toward it.
- Make “panic” scatter, then slowly regroup.
- Let the headline float while the supporting text stays still.
- Make these letters move in a wave.
- Have the words move away from my cursor.
- Keep the animation, but make the layout calmer.

The central workflow is:

Choose a starting composition → enter text → describe a visual change → see the poster update → adjust it directly → scrub or play the animation → save and share/export.

The application should feel like a considered creative instrument. Give the canvas prominence and make the controls precise and understandable.

FIRST-RELEASE SCOPE

Support:
- One portrait artboard format.
- Text layers and simple geometric shapes.
- A small curated selection of properly licensed, bundled fonts.
- Colour, size, alignment, position, rotation, and layer order.
- A short looping timeline.
- Play, pause, scrubbing, and restart.
- Undo/redo and saved revisions.
- Six curated example compositions.
- Saved projects and shareable read-only presentations.

Use procedural graphics. External image or video generation is not required for the first release.

ANIMATION VOCABULARY

Implement a small, composable set of behaviours:
1. Float.
2. Orbit.
3. Wave.
4. Scatter and reassemble.
5. Attract toward a point or designated anchor.
6. Repel from the pointer.

Define each behaviour precisely, including its parameters, time range, composition order, and limits.

Keep motion bounded so layers cannot accidentally disappear permanently or destabilise the renderer.

Separate base layout from animated transforms.

AI EDITING

Use a real model integration to translate creative requests into structured edits to the scene.

The model must work within a validated scene language. Do not execute arbitrary generated JavaScript, CSS, shaders, or HTML.

Every edit should:
- Refer to stable layer identifiers.
- Target a specific scene revision.
- Preserve unrelated content and styling.
- Preserve the user's wording unless text changes were requested.
- Validate references, ranges, and supported behaviours.
- Apply as one undoable operation.
- Produce a concise explanation of what changed.

Clearly show affected layers.

Routine valid edits can apply immediately with undo. Ask for clarification when a request has materially different interpretations.

Handle unsupported requests by explaining the available alternative.

Prevent delayed model responses from overwriting newer manual or AI edits.

SCENE FORMAT

Design and document a versioned scene schema containing:
- Artboard dimensions and background.
- Stable layer IDs.
- Text and shape properties.
- Layout and typography.
- Behaviour definitions and parameters.
- Timeline information.
- A reproducible random seed where needed.
- Asset/font references.
- Scene revision information.

Validate scenes both on the server and before rendering.

Reject missing references and unsupported values. Define how conflicting behaviours compose.

Keep scene files independent from conversational history.

RENDERING

Choose a rendering approach that supports crisp typography, smooth interaction, and reliable exports.

Use one authoritative scene evaluator for preview and export.

For ordinary timeline animations, the same scene, seed, and time should produce the same result.

Treat pointer interaction explicitly:
- Live pointer movement is an input.
- For repeatable playback or export, use a recorded pointer path or a clearly explained fixed-input mode.
- Do not claim deterministic replay without preserving the relevant inputs.

Load fonts before measuring text or exporting.

Keep animation work separate from ordinary interface updates. Avoid rerendering the entire application every frame.

Provide useful performance diagnostics during development and measure performance on representative scenes.

EDITOR EXPERIENCE

Provide:
- Direct selection and dragging.
- Keyboard nudging and deletion.
- A clear layer list.
- An inspector for selected layers.
- Typography and colour controls.
- Timeline scrubbing.
- AI instruction history linked to scene revisions.
- Undo/redo across both manual and AI edits.
- Visible loading, error, and recovery states.
- Keyboard-accessible controls and readable contrast.
- Reduced-motion behaviour for the application interface.

Make canvas coordinates independent of browser display size.

Allow creators to continue editing manually when AI requests fail.

SAVING AND EXPORT

Core deliverables:
- Browser draft recovery.
- Persistent saved scene revisions.
- Read-only share links.
- PNG export of a selected frame.
- A downloadable animated HTML presentation using the validated renderer.

Exported presentations should work without model API calls or embedded credentials.

Treat poster text as text, not executable markup.

Keep export rendering consistent with the preview.

Add video export only after the core workflow is complete and tested. It is a stretch feature for this release.

BACKEND AND RELIABILITY

Choose a lean TypeScript-friendly stack and verify current official documentation before implementing APIs.

Implement:
- Server-side model credentials.
- Validated request and response schemas.
- Bounded request sizes and model spending.
- Persistent scene revisions.
- Safe retry behaviour.
- Protection against stale edits.
- Private authoring access and explicit sharing.
- Useful error logging without exposing private content.

If credentials are unavailable, provide clearly labelled example scenes and keep manual editing fully functional. Do not pretend that preset responses are live AI generation.

EVALUATION

Create a held-out set of editing instructions with independently specified expected effects.

Include:
- Requests targeting one specific layer.
- Ambiguous references.
- Multiple requested changes.
- Unsupported effects.
- Requests that should preserve the text.
- Rapid corrections while an earlier request is pending.
- Missing fonts and invalid scene data.

Measure:
- Valid structured-edit rate.
- Correct target selection.
- Preservation of unrelated properties.
- Stale-response rejection.
- Model latency and cost.

Use human review to assess whether creative interpretations match the request. Do not use the same model's approval as the sole quality measure.

Test undo/redo, save/reload, deterministic playback, pointer recording, share isolation, and export fidelity.

BUILD SEQUENCE AFTER PLANNING

1. Scene schema and deterministic renderer.
2. Manual editor and curated examples.
3. Structured AI editing.
4. Revision history, persistence, and sharing.
5. Exports, evaluation, and visual polish.

DELIVERABLES

A working creative application, example posters, setup instructions, scene-format documentation, architecture diagram, meaningful tests, evaluation results, and a portfolio case study.

Include a 60-second demo showing a natural-language edit, a manual refinement, undo, and an export.

Prepare the implementation plan now.