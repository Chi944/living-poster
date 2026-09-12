# Architecture and reliability

Living Poster is a local application with one shared scene engine. React provides the editor, Canvas 2D draws the poster, and a Node 24 service owns SQLite persistence, session authentication, and requests to a locally installed Ollama model. There are no paid APIs, cloud database dependencies, generated JavaScript, or remote model fallbacks.

```mermaid
flowchart LR
  UI[React editor and direct manipulation] --> Store[Scene store and revision history]
  UI --> AI[Captured immutable AI request]
  Store --> IDB[IndexedDB recovery and save outbox]
  Store --> Core[Strict scene validation and font-ready compiler]
  Core --> Eval[Absolute-time evaluator]
  Eval --> Paint[Shared Canvas 2D painter]
  Paint --> Preview[Editor canvas]
  Paint --> PNG[Opaque PNG]
  Paint --> HTML[Offline HTML player]
  IDB --> API[Same-origin Node API]
  AI --> API
  API --> DB[(Local SQLite)]
  API --> Ollama[Loopback Ollama / installed local model]
  Ollama --> Ops[Validated narrow edit operations]
  Ops --> Store
  DB --> Share[Immutable public share snapshot]
  Share --> Core
```

## Source boundaries

| Area                | Source                                                         | Responsibility                                                                                                                               |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene engine        | `packages/core/src`                                            | Closed scene language, atomic operations, actual font coverage/hashes, typography, pointer replay, motion evaluation, painting, six examples |
| Editor              | `apps/web/src/store.ts`, inspector, canvas, timeline, composer | Selection, gestures, playback, pending fields, undo/redo, stale-result gates                                                                 |
| Browser durability  | `apps/web/src/drafts.ts` and store outbox                      | IndexedDB transactions, draft recovery, queued immutable save snapshots                                                                      |
| HTTP service        | `apps/api/src/server.ts`                                       | Same-origin/auth boundaries, owner-scoped routes, idempotency, queue admission, public snapshot DTOs                                         |
| Database            | `apps/api/src/db.ts`                                           | SQLite schema, transactions, startup job-state reconciliation                                                                                |
| Local model adapter | `apps/api/src/provider.ts`                                     | Installed-model checks, bounded structured requests, intent validation and translation                                                       |
| Export              | `apps/web/src/exports.ts`, `player.ts`                         | Frozen scene exports, embedded trusted player, font bytes and licenses                                                                       |
| Build               | `scripts/build.mjs`, `scripts/assets.mjs`                      | Vite editor, standalone IIFE player, Node server bundle, bundled font preparation                                                            |

The core imports no React, database, network model client, or server authentication code. Font loading is the core's explicit browser I/O boundary; `evaluateScene` itself reads no DOM, clock, mutable random seed, or network state. The API uses structural/semantic validation without introducing a different font rasterizer.

## Scene, revision, and transient state

A scene snapshot is independent from conversation history. Base layout, typography, behaviors, seed, duration, and repeatable pointer input live in the scene. Selection, playhead, live pointer, request status, active gestures, and saved-project identity belong to editor state.

Every accepted command creates a new revision identity. Undo, redo, and restoration create fresh revisions even when they restore old content. A gesture starts from a captured base scene, updates positions relative to that capture, and produces one history entry when completed. Cancelling restores the capture and leaves no completed command.

Async AI requests capture document identity, scene revision, request generation, and mutation epoch. Gesture start and pending property-field entry invalidate earlier requests before a completed revision exists. Application is guarded by matching all captured identities and by the absence of an active gesture or pointer recording. Returning to old content through Undo does not restore eligibility for an old response.

The model does not replace the scene. It proposes a closed intent envelope, which the server translates into narrow operations. Both server and browser validate operations and the resulting scene; browser font geometry is a separate required acceptance boundary. Wording changes require the captured permission flag and an exact old-text precondition. Unmentioned fields remain unchanged by the operation implementation. An invalid batch applies nothing.

## Model execution

The default model is configured in the server and `.env.example`; it is a locally installed Ollama model. The adapter permits only HTTP loopback origins, refuses redirects, and rejects reported cloud-backed models. It calls `/api/tags` for availability, `/api/show` for model metadata, and `/api/chat` for structured output. Poster text is included as data, never executed as instructions or code by the application.

The server accepts requests only for authenticated sessions. It validates selected IDs and base revision against the submitted scene, persists the full immutable input, and deduplicates by `(owner_id, request_id)`. Reusing an ID with different content returns a conflict. Availability checks introduce an async boundary, so the route repeats deduplication and capacity checks immediately before insertion.

One local model request runs at a time, with at most eight admitted queued/running requests by default and a 120-second job timeout. Structured output is limited to a JSON schema and a bounded prediction count. Input messages have a conservative byte budget to avoid silently truncating scene identifiers in the local context. Oversized requests fail with an explanation; there is no paid or larger remote fallback.

The durable ledger stores input, status, result/error, model, latency, token counts, and disposition. Cost is zero for local inference. Transport states are `queued`, `running`, `completed`, `failed`, and `indeterminate`; completed results separately carry `edit`, `clarify`, or `unsupported`. A completed proposal can be marked `applied` or `superseded` without changing the scene stored in the request.

There is no automatic model retry. On server startup, pending/running records are marked indeterminate rather than silently dispatched again. A new explicit request is required. This is a conservative implementation boundary: the ledger survives restart, but the current service does not resume the old in-memory queue.

## Local persistence and save integrity

SQLite stores owners, session hashes, projects, immutable revisions, operation acknowledgements, share snapshots, and AI requests. Its data directory is excluded from Git. WAL mode, foreign keys, and a busy timeout are enabled. Domain mutations that need atomicity run in `BEGIN IMMEDIATE` transactions.

A project save includes a client operation ID and expected saved head. In one transaction, the API:

1. Finds an existing acknowledgement by `(owner_id, operation_id)` and compares the canonical payload hash.
2. Confirms the authenticated owner can access the project.
3. Compares its head to `expectedHeadRevisionId`.
4. Inserts a fresh immutable revision and advances the head.
5. Stores the response used for future duplicate acknowledgements.

The hash is not part of the uniqueness key. An identical retry returns the prior response; different content under the same operation ID fails. A stale head returns HTTP 409, preserving the competing server revision instead of overwriting it.

The browser outbox captures immutable snapshots and sends them in order. Acknowledgements update synchronization metadata for their captured document; they must not replace a newer editing scene. Conflict recovery keeps a local draft and supports saving a separate project. IndexedDB serializes writes through a promise chain and stores each snapshot in a transaction. Storage failures remain visible rather than being represented as successful persistence.

Browser IndexedDB and server SQLite serve different purposes. Device recovery is specific to the browser profile. SQLite is the durable local library shared by authenticated sessions. Back up the data directory using a consistent SQLite backup procedure; copying a live WAL database as a single file is not sufficient.

## Authentication and shares

An installation has one local owner. Initial password setup is accepted only from the loopback address and a loopback Host header. Passwords use salted scrypt hashes. Session tokens contain 32 random bytes; only their SHA-256 hashes are stored. Cookies are HttpOnly and SameSite Strict, with a seven-day lifetime; HTTPS requests receive Secure cookies. Login attempts are rate limited.

Mutation requests require the same origin and JSON content types where applicable. Cross-site fetches are rejected. Host validation restricts requests to loopback hostnames or the explicitly configured public hostname, limiting DNS-rebinding access to the local server. The default bind address is `127.0.0.1`; publishing a LAN address is a deliberate configuration change.

Private project, revision, AI-history, and share-management queries are scoped by the authenticated owner. There is no browser-accessible direct database API and no client-supplied owner ID. SQL values use prepared statement parameters. Operational errors avoid exposing SQL details and credentials.

A share captures one saved revision's scene and title. The public presentation route returns only `{ scene, title }`; it does not return project history, instructions, authentication material, or private request results. Random share tokens are looked up by hash. The owner can revoke a link; subsequent requests then return not found. Later authoring revisions do not alter an existing snapshot. Revocation cannot retract an already downloaded file or an already loaded browser copy.

## Rendering and export

The compiler resolves loaded fonts and per-grapheme ink geometry once per scene revision. The evaluator computes a frame directly from absolute time and pointer input. No simulation history is needed to seek, restart, or export a selected frame. The painter fills the solid background, uses the same unit transforms everywhere, and clips to the artboard.

PNG export captures a revision, selected time, and repeatable/frozen pointer input, draws into an isolated canvas, and produces an opaque image. HTML export embeds the trusted built player, safely encoded scene JSON, required font bytes, and license text. It includes no API client, session, request history, or model SDK. Embedded scene text is rendered through Canvas or `textContent`; markup-looking poster copy remains inert. Reduced-motion preferences start presentations paused.

Determinism applies to evaluated transforms for the same scene, renderer/font build, time, and pointer input. Physical text rasterization can vary across browsers and operating systems. Live pointer movements are additional inputs, not a reproducible scene property unless captured or frozen.

## Verification and diagnostics

Unit tests exercise scene limits, invalid references, exact loop endpoints, random-order seeking, bounded transforms, pointer-center continuity, pointer seams, font failures, atomic command preservation, and fresh revision identity. API tests use real temporary SQLite databases and controlled local-model adapters for failure/race scenarios. Browser tests cover the actual fonts and shared export player.

`node tests/core-browser-probe.mjs` generates a six-poster contact sheet and evaluates multiple loop times with the actual bundled fonts. `node tests/performance.mjs` benchmarks all six examples plus a 24-layer/400-grapheme/60-behavior typical fixture and a 64-layer/1,024-grapheme/256-behavior limit fixture. The default run warms each case for 1.8 seconds and samples it for 30 seconds. It records evaluation, painting-command submission, combined cost, rAF callback intervals, draw count, bounds corrections, browser version, DPR, and graphics renderer in `tests/core-artifacts/performance.json`.

The benchmark uses headless Chromium and an isolated fulfilled localhost page with networking disabled. Canvas CSS size is 540×675 at DPR 2, with 1080×1350 backing pixels. It measures the scene engine, excluding React editor chrome. Its rAF measurements are callback intervals, not physical display presentation timing. Other processes are not stopped; results can reflect concurrent machine load. `LP_BENCH_SECONDS` changes sampling duration, and `--assert` makes measured target misses return a failing exit code. Performance results do not imply that unrun accessibility, live-model interpretation, or human visual-review gates passed.

Recorded run: Chromium 153.0.8010.12, Windows 11, Intel i5-12400, 32 GiB RAM, SwiftShader renderer. Each case has approximately 1,800 measured frames after warm-up. Synthetic typography uses 14-unit text in the typical fixture and 12-unit text in the limit fixture; the six example cases retain their actual varied typography.

| Case                                        | Evaluation + paint p95 | rAF callback interval p95 |
| ------------------------------------------- | ---------------------: | ------------------------: |
| Six shipped compositions                    |             0.6–0.8 ms |              16.7–16.8 ms |
| 24 layers / 400 graphemes / 60 behaviors    |                 1.9 ms |                   16.7 ms |
| 64 layers / 1,024 graphemes / 256 behaviors |                 4.5 ms |                   16.7 ms |

All cases met their measured engine timing targets in this run. Full percentiles, sample counts, maximum intervals, draw counts, and bounds-correction totals are in [the machine-readable results](../tests/core-artifacts/performance.json). This is evidence for this browser/fixture configuration, not a guarantee for every computer or poster.
