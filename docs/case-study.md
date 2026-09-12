# Living Poster: giving words a behavior

Living Poster is a small creative instrument for animated typography. A creator starts with a designed composition, describes a change, refines it directly, and exports a portable presentation. The project brings a graphics engine, a local language model, a revision system, and an editor together around one canvas.

## The design problem

Animation tools often make a simple expressive idea feel like a technical setup task. “Panic” should scatter and return; a quiet headline should drift. The challenge was to make those ideas immediate while retaining predictable controls, the creator's exact wording, and a reliable undo button.

The studio uses paper-colored chrome, restrained red and olive accents, compact controls, and a large portrait artboard. Space Grotesk handles the interface and bold posters, Fraunces introduces an editorial voice, and IBM Plex Mono supplies quieter annotations. The six examples are complete editable compositions rather than blank templates with different colors.

## Three decisions that define the project

**One evaluator owns the image.** A versioned scene compiles only after the bundled fonts have loaded and passed integrity checks. The same pure evaluator and Canvas 2D painter produce the studio preview, PNGs, read-only shares, and downloaded HTML. Time, seed, and pointer input are explicit; seeking never depends on previous frames.

**Language edits are data.** A real model running through Ollama proposes narrowly typed actions against stable layer IDs. Validation rejects unsupported properties and missing references before an atomic command enters history. The renderer never evaluates generated code. Wording changes require an explicit editor toggle, and unaffected properties survive by construction.

**A delayed answer cannot silently become the latest decision.** The editor captures a document identity, revision, mutation epoch, and request generation. Dragging, editing a field, undoing, replacing a document, and revising a pending instruction invalidate that capture. A completed response can remain visible in history without being applied to a newer poster.

## Free operation as an architectural constraint

The implementation replaces the original hosted-service proposal with a local TypeScript application: React, Fastify, Node's SQLite integration, and Ollama. No API key, paid model endpoint, subscription, hosted database, or paid asset is needed. SQLite stores private authoring data; IndexedDB preserves drafts and a durable save queue.

Local operation changes what “share” means. A link presents a saved snapshot while the creator's server is reachable. A downloaded HTML poster instead includes the scene, player, fonts, and license notices, opens offline, and makes no model calls. The interface explains this distinction at the point of sharing.

## Reliability work

The test suite exercises numerical loop boundaries, deterministic scattering, font failures, reference validation, atomic command batches, fresh undo revisions, stale answers, save acknowledgements, revision conflicts, private sessions, and revocable shares. Browser checks cover the actual editor, exports and offline playback. A separate live-model evaluation measures creative instruction handling rather than using mocked answers as evidence of model quality.

Independent code review found two subtle persistence problems: an old acknowledgement could remove a newer queued save, and one conflicting project could block saves for unrelated projects. The final queue addresses acknowledgements by operation ID and isolates conflicts by document. Regression tests preserve those cases.

The first model evaluation also exposed the limitations of a small local model and an overly permissive intention format. Its failed results are retained. The model interface was narrowed to individual typed actions and explicit field descriptions. See the [evaluation report](evaluation.md) for measured results and remaining limits; automated structural checks do not substitute for human creative review.

## What this demonstrates

- Frontend graphics: font-aware layout, procedural motion, explicit pointer replay, coordinate mapping, and shared export rendering.
- Full-stack engineering: local authentication, SQLite transactions, immutable snapshots, operation deduplication, a durable model-job ledger, and bounded execution.
- Asynchronous interface design: optimistic local editing with conservative application of delayed results and recoverable conflicts.
- Product judgment: a small expressive motion vocabulary, designed examples, and a self-contained export that remains useful without a hosted service.

The intentional release boundary is one artboard, six behaviors, a curated Latin font set, and PNG/HTML export. Complex-script shaping, custom fonts, audio, video export, collaborative accounts, and cloud hosting would each require a separate design and validation pass.
