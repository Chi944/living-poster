# Evaluation and release evidence

## Version 1.1 expansion

The canvas and motion release passes **116 unit/integration tests**, **26 native browser tests**, and **6 hosted browser tests**. The browser suites cover recovery from interrupted recording, pending-field validation, editing after animated selection, four canvas formats, all ten offline exports at five exact frames, browser saving and reload, immutable portable sharing across browser profiles, damaged-link handling, and delayed startup without a password prompt. The bundled-font geometry probe covers ten templates in four formats with exact loop endpoints and no safety corrections at its sampled times.

The final local Qwen3 4B prompt passes **20/20** cases in the existing release holdout (p95 3.32 seconds) and **7/8** new motion checks (p95 4.76 seconds), with **$0 API cost**. The failed new check asks for a heartbeat: the model sometimes invents a numeric motion parameter, which validation rejects while leaving the scene unchanged. Manual Heartbeat and other recipes work independently of model interpretation. These are machine-scored checks, not a claim of perfect creative understanding or human review.

Final reports: [legacy regression](../evals/results/2026-09-12T21-57-17-338Z-qwen3-4b.json) and [motion expansion](../evals/results/2026-09-12T21-56-41-730Z-qwen3-4b.json). Earlier failed/intermediate reports are retained. The measurements below document the original release.

Measured on 13 September 2026 in Singapore; filenames use UTC. All inference was local. No paid API, cloud model, subscription, or generation credit was used.

## Automated verification

| Check                           | Result                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| TypeScript and production build | Pass                                                                                |
| Unit and integration suite      | 77 passing tests: 44 core, 20 API, 13 frontend                                      |
| Playwright browser suite        | 18 passing tests                                                                    |
| Dependency audit                | Zero reported vulnerabilities                                                       |
| Desktop accessibility scan      | Zero axe WCAG A/AA violations in the tested editor state                            |
| Mobile review                   | No horizontal overflow at 390 pixels; layers and creation controls remain reachable |

Browser tests cover text editing, dragging, nudging, undo/redo, immediate rename/reload, saved projects, six examples, behavior controls, pointer recording, anonymous pinned shares and revocation. Controlled AI transport tests exercise rapid prompt corrections, duplicate-submit prevention, response supersession, and revision-specific undo. These fixtures are explicitly test doubles, not evidence for model quality.

Export tests compare exact RGBA hashes at five timeline positions for all six compositions, all six font faces, rotated shapes with a recorded pointer, and an empty scene. Downloaded HTML opens with networking disabled and makes zero HTTP requests. Another test checks exact PNG equality at a selected frame and verifies markup-looking poster text remains inert. Missing players returned as an HTML fallback, changed font bytes, and font-loading failures produce errors before a broken export can be downloaded.

## Real model evaluation

Runtime: Ollama 0.32.0, `qwen3:4b` Q4_K_M, model digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`. Machine: Intel i5-12400, 32 GB RAM, RTX 3050 8 GB. Requests use temperature zero, a 16,384-token context, a 2,000-token output ceiling, and no automatic inference retries. Warm latency varies with machine load.

The coordinating agent specified the original 40 instructions and expected effects independently of the provider implementation. The provider implementer used separate development probes without reading those instructions. Aggregate baseline failures then informed general improvements, so later runs of the original set are regression comparisons. A fresh 20-case release set was specified while the final provider was frozen and was not used for tuning.

| Run                                     | Expected-result passes | Valid results | p95 latency | API cost |
| --------------------------------------- | ---------------------: | ------------: | ----------: | -------: |
| Original adapter / original 40          |                  10/40 |         20/40 |      3.10 s |       $0 |
| Scalar-action adapter / original 40     |                  33/40 |         38/40 |      3.78 s |       $0 |
| Final interpretation / original 40      |                  37/40 |         39/40 |      3.96 s |       $0 |
| Final interpretation / fresh release 20 |              **19/20** |     **20/20** |  **3.41 s** |   **$0** |

“Valid” means an accepted structured edit, clarification, or unsupported response. An expected-result pass also checks response category, exact targets, required changes, and preservation of unmentioned properties. These semantic checks do not grade artistic quality or prove glyph geometry fits; the browser separately compiles actual font geometry before accepting an edit.

All 28 determinate requests in the final 40-case run selected the correct targets, preserved unrelated properties and wording, and supplied expected changes. Four of six ambiguity cases clarified. Five of six unsupported cases completed correctly; the last encountered an Ollama model-inspection failure before inference. The readiness endpoint also briefly reported the installed model unavailable during release setup; a later explicit check recovered. The app reports unavailable service states and preserves the scene.

All 14 determinate edits in the fresh release set passed, including compound requests, named attraction anchors, preserved motion, selection overrides, and typography. Two of three ambiguity cases clarified; all three unsupported requests were rejected. The remaining failure chose one of two layers with identical text instead of asking which occurrence was intended. **Select the intended layer or give it a distinct name when wording is duplicated.** A local model can misinterpret creative requests; affected-layer highlights and undo remain necessary.

The app accepts no generated code. Strict validation, wording permissions, atomic operations, browser geometry preflight and stale-response guards apply even when an interpretation is wrong. A failed guard leaves the last good scene intact. A new user request creates a new ledger entry; inference is never retried automatically.

Raw reports retain failures, timing, token counts, and fixture/provider hashes:

- [Original baseline](../evals/results/2026-09-12T20-47-53-329Z-qwen3-4b.json)
- [Scalar-action regression](../evals/results/2026-09-12T21-01-15-853Z-qwen3-4b.json)
- [Final 40 cases](../evals/results/2026-09-12T21-08-50-488Z-qwen3-4b.json)
- [Fresh release evaluation](../evals/results/2026-09-12T21-13-14-754Z-qwen3-4b.json)

The final 40-case report corresponds to interpretation commit `6a2ced1`. Later changes improved transient-error wording and formatted source without changing interpretation. The release report records the formatted provider hash. Qwen2.5 7B was compared using development probes, performed worse, and is neither the default nor a fallback.

Run `npm run eval:local` for the original set. To use the fresh set in PowerShell:

```powershell
$env:EVAL_CASES = 'evals/release-holdout.json'
npm run eval:local
```

## Rendering performance

The [engine benchmark](../tests/core-artifacts/performance.json) samples each case for 30 seconds after warm-up. Headless Chromium 153 used a 1080×1350 backing canvas at DPR 2 with SwiftShader. Six compositions measured 0.6–0.8 ms p95 for evaluation plus paint-command submission. The 24-layer / 400-grapheme / 60-behavior fixture measured 1.9 ms; the 64-layer / 1,024-grapheme / 256-behavior limit fixture measured 4.5 ms. All measured engine targets passed.

These timings exclude React chrome and physical display presentation. rAF callback p95 was 16.7–16.8 ms; this is not a guarantee that every device presents at 60 fps. Full counts, percentiles, bounds corrections and conditions are recorded. Run `npm run bench` on your machine.

## Human creative review

**Pending independent human review.** Agent visual inspection and automated effect checks are complete; neither is labeled as human approval. Review target accuracy, visual interpretation, readability and restraint on a 1–5 scale. The intended threshold is an average of at least 4 with no critical readability failure. The [case study](case-study.md), [contact sheet](../tests/core-artifacts/gallery.png), and [real UI demo](demo-script.md) provide review material.
