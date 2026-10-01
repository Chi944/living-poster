# Reel study · 1 October 2026

Source: [designlab.anirudh's Instagram reel](https://www.instagram.com/reel/DaWuiBsTrh3/), supplied by the owner. The approximately 27.8-second video was reviewed through locally extracted frames across its full duration. The research video, metadata and contact sheets remain in Git-ignored `data/reel-study/`. No source footage, screenshots, logos, portfolio content, component source or paid assets are included in the application.

## What the video shows

Times are approximate. These are observations of visible demonstrations, not an assertion that their implementation details, performance or licensing can be determined from the reel.

| Time            | Visible evidence                                                                                            | Useful lesson for Living Poster                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 00:00–00:01.5   | A small animated loading illustration beside code                                                           | A visible result makes a motion tool easier to understand than a code sample alone.                                           |
| 00:01.5–00:02.5 | **Text Pressure**: individual letters expand and narrow as the pointer moves                                | Let people try a localized response directly on their own typography.                                                         |
| 00:03–00:04     | **Particle Typography**: a word disperses into curved point trails and reforms                              | Show the full departure and return before committing an effect; retain readable words and reversible editing.                 |
| 00:04.5–00:05.5 | **Magnet Lines**: a field of short lines turns around the pointer                                           | Pointer direction can influence orientation, independently of position.                                                       |
| 00:06–00:07.5   | **Lanyard**: a suspended card swings and is dragged                                                         | A simple physical metaphor communicates interaction quickly.                                                                  |
| 00:08–00:09     | **Evil Eye**: an animated fiery eye                                                                         | One clear focal effect is easier to read than many competing effects.                                                         |
| 00:09.5–00:10   | **Infinite Menu**: a spatial gallery of circular image tiles                                                | Preview options in context, with an obvious current selection.                                                                |
| 00:10.5–00:11   | **Decrypted Text**: changing characters resolve toward readable text                                        | Timing and reveal can add character, but the editor must preserve the author's actual wording.                                |
| 00:11.5–00:15.5 | Loader and motion-component galleries                                                                       | Group choices by intent and offer live previews before application.                                                           |
| 00:16–00:19     | A gallery of website references with varied editorial layouts                                               | Offer distinct starting compositions instead of adding every effect to one design.                                            |
| 00:19.5–00:21   | Code and an assisted editing interface                                                                      | The reel shows a development workflow; it does not establish that a paid model or service is necessary for the visual result. |
| 00:22–00:27.8   | A finished dark portfolio with large white/magenta typography, pointer-distorted words and a suspended card | Pair strong type hierarchy with a focused interaction and a restrained palette.                                               |

The component names above are transcribed from visible headings. The review does not claim to reproduce the audio, identify every small gallery tile, or verify the creator's underlying code. The final portfolio's particle lettering and 3D card are visibly more complex than Living Poster's bounded 2D renderer.

## Adaptations in this project

The **Motion playground** applies the reel's preview-first workflow to the existing poster editor. It previews a selected layer in a copy of the current scene, offers motion categories and short pages, and keeps the main document unchanged until **Apply**. Closing the preview leaves the scene intact. Applying a recipe replaces the selected layer's motion as one undoable change, so experiments remain easy to revise.

Two original behaviors extend the native Canvas renderer:

- **Text pressure** scales individual glyphs according to their proximity to the pointer. It uses the existing bundled fonts and bounded transforms; it does not download a variable font or reproduce the source component's weight interpolation.
- **Magnetic turn** rotates text glyphs or a shape toward the pointer within an explicit angle limit. It adapts the directional response seen in Magnet Lines without copying that component's code or requiring a separate line-grid renderer.

The existing **Scatter**, **Pendulum** and **Soft reveal** recipes provide related departure/return, swing and reveal ideas. They remain procedural poster effects: Scatter is not a particle simulation, Pendulum is not 3D rope physics, and Soft reveal does not scramble or replace the author's text. The fiery-eye shader, infinite 3D gallery and portfolio loading screen are not added to the editing interface.

Three editable compositions turn these ideas into starting points: **UNDER PRESSURE**, **FIELD STUDY** and **OPEN STUDIO**. They use original type arrangements and primitive shapes, alongside the existing 19 bundled font styles. The workspace's saved design-memory IDs were read and resolved before implementation. Its guidance on useful previews, bounded motion and focused selection informed the adaptation; the poster editor keeps its compact tools and saved design preferences are unchanged.

## Free implementation and verification

All additions use the existing TypeScript, React and native Canvas/CSS stack. There are no new paid integrations, remote assets, model calls, API keys or library component downloads. Reference media remains research material only. The new behaviors use the same scene evaluation path for editing, presentations and offline exports.

The regression coverage is in `tests/e2e/reel-playground.spec.ts`: preview isolation, one-step apply/undo, filters and pagination, keyboard access, reduced-motion playback and mobile access. Core motion and export tests cover the underlying scene behavior separately. Current test results and any remaining limits are recorded with the release verification rather than inferred from the reel.
