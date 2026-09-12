# Free local implementation contract

The user's latest instruction supersedes the plan's paid/hosted stack: implement in `C:/Users/User/Documents/Projects/active/living-poster`, using only free local features. No OpenAI, Supabase, paid hosting, cloud models or generation services. Existing Ollama 0.32.0 and llama3.2:3b are available; GPU is RTX 3050 8GB. Use local Ollama only, SQLite via Node 24 node:sqlite, and local password/session authentication. Public share links work when the user's server is reachable; exported HTML works anywhere offline. No purchases or subscription signup.

## Shared module contracts

`packages/core/src/index.ts` exports all core types, schema, commands, renderer and examples. Scene fields follow the implementation plan, with practical constants/types documented in code. Stable IDs may be strings with UUID values generated for user edits. Font IDs are `space-regular`, `space-bold`, `fraunces-regular`, `fraunces-bold`, `mono-regular`, `mono-bold`; font URLs `/fonts/<id>.woff2`. Font hash version initially `bundled-v1` unless generated hashes are provided. Root will copy Fontsource Latin woff2s and licenses. Renderer/core implementer owns core schema and must communicate exact exported APIs promptly.

Required exports: `Scene`, `Layer`, `TextLayer`, `ShapeLayer`, `Behavior`, `BehaviorType`, `PointerSample`, `Frame`, `CompiledScene`, `SceneSchema`, `validateScene(value): Scene`, `newId(): string`, `cloneScene(scene): Scene`, `reviseScene(scene): Scene` (fresh revision with parent old ID), `defaultBehavior(type,durationMs,layer?): Behavior`, `loadFonts(): Promise<void>`, `compileScene(scene): CompiledScene`, `evaluateScene(compiled,{timeMs,pointer}): Frame`, `paintFrame(ctx,frame,scale?): void`, `hitTest(frame,x,y): string|null`, `samplePointer(scene,timeMs): PointerSample|null`, `closePointerLoop(samples,durationMs): samples`, `EXAMPLES: {id,title,description,scene:Scene}[]`, `FONT_OPTIONS`.

Command contract: `EditOperationSchema`, `EditOperation` and `applyOperations(scene, operations, {allowTextChanges?:boolean}): {scene:Scene,affectedLayerIds:string[],summary:string}`. Narrow operations: `{type:'setLayout',layerId,changes:{x?,y?,rotationDeg?}}`, `{type:'setTypography',layerId,changes:{fontId?,fontSize?,lineHeight?,trackingEm?,align?}}`, `{type:'setFill',layerId,colour}`, `{type:'setOpacity',layerId,value}`, `{type:'upsertBehavior',layerId,behavior}`, `{type:'removeBehavior',layerId,behaviorId}`, `{type:'setText',layerId,expectedOldText,newText}`, `{type:'reorderLayer',layerId,beforeLayerId:string|null}`. Returns NEW revision; all unrelated fields unchanged. Reject unknown properties/references; whole batch atomic.

## API contract (backend owns implementation)

All paths /api. Error `{error:string,code?:string}`. JSON responses. Cookie sessions, same-origin checks, local setup bootstrap. Server binds 127.0.0.1:4317 unless configured; static production serves dist/web. Data at `data/living-poster.sqlite` unless LP_DATA_DIR set. `buildServer({dataDir?,staticDir?,ollamaUrl?,model?})` export for tests, no auto listen when imported. index.ts starts service.

- GET `/capabilities` => `{free:true,authenticated:boolean,needsSetup:boolean,ai:{available:boolean,model:string,reason?:string},storage:'sqlite'}`
- POST `/auth/setup` `{password}` / `/auth/login` `{password}` => `{ok:true}` with session cookie. POST `/auth/logout`.
- GET `/projects` => `{projects:[{id,name,headRevisionId,updatedAt}]}`
- POST `/projects` `{name,scene,operationId}` => `{project:{id,name,headRevisionId,updatedAt},scene}`
- GET `/projects/:id` => `{project,scene}`
- POST `/projects/:id/revisions` `{scene,expectedHeadRevisionId,operationId,label?}` => `{revisionId,headRevisionId}`; stale 409; immutable snapshots; duplicate id+same payload returns prior ack.
- GET `/projects/:id/revisions` => `{revisions:[{id,parentId,label,createdAt,scene}]}`
- POST `/shares` `{projectId,revisionId}` => `{id,token,url}`; GET `/shares` owner lists `{shares:[{id,projectName,createdAt,revoked:boolean,url}]}`; DELETE `/shares/:id`.
- GET `/presentations/:token` anonymous => `{scene,title}` only. Route /p/:token frontend.
- POST `/ai/edits` `{requestId,scene,selectedLayerIds,instruction,allowTextChanges,baseRevisionId,requestGeneration,mutationEpoch}` => `{requestId,status:'queued'}` (or existing request status); GET `/ai/edits/:id` => `{requestId,status,result?:{kind:'edit',operations,summary}|{kind:'clarify',question}|{kind:'unsupported',explanation},error?,model?,latencyMs?,inputTokens?,outputTokens?,cost:0}`. Only authenticated; no project dependency required. Persist full input, idempotency and statuses. Validate resulting scene on server. Abort/timeout no retries. One concurrency slot local; bounded request queues and request sizes. GET `/ai/history` => `{requests:[...]}`; POST `/ai/edits/:id/disposition` `{status:'applied'|'superseded',appliedRevisionId?}` links history.

## Frontend ownership and root integration

Frontend agent owns all `apps/web/src` EXCEPT `exports.ts` and `player.ts` (root owns these). Root owns scripts/config/docs/asset copying, E2E and evaluation. Core agent owns packages/core and tests/core*. Backend agent owns apps/api and tests/api*. Do not edit another agent's files without coordination. Do not change package.json; request added dependencies from root.

Frontend exports may import `exportPng(scene,timeMs,pointer):Promise<void>`, `exportHtml(scene):Promise<void>`, `downloadScene(scene):void` from `./exports` which root supplies. Root may refactor UI after integration. Core fonts assumed ready before compile; frames and behavior fields see actual core interfaces.

UI complete workflow: six example choices, canvas, layer list, text/shape creation, direct selection/drag/multi-select, nudge/delete/reorder, typography/color/position/behavior inspector, timeline, pointer live/recorded/fixed, undo/redo fresh revisions, IndexedDB recovery, password setup/login dialog for saved projects+AI, revisions and shares, local-model composer/status/history, stale-response guards. Keep UI polished with canvas primary, paper/ink chrome from plan, distinct bold poster artwork, clear free-local label in settings only. Do not label simple presets as AI.
