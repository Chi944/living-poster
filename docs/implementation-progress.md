# Implementation progress

Plan: docs/superpowers/plans/2026-09-13-living-poster.md

User override: implement now; directory belongs inside active; all product features must use free local software. The initial hosted/API proposal is superseded by docs/build-contract.md.

Decisions: local Ollama replaces paid model API, local SQLite/session auth replaces hosted DB/auth; no cloud model fallback. New independent repository in requested folder, branch feat/living-poster; no need for another worktree.

| Workstream | Produces/consumes | Status |
|---|---|---|
| Core | Shared scene/evaluator/commands/examples, consumed by UI/API/export | assigned next |
| Backend | Shared validated scene -> SQLite revisions, local AI, auth/shares | assigned next |
| Frontend | Core + REST API + export functions -> editor | assigned next |
| Integration | Build/fonts/player/exports/E2E/docs/eval | root in progress |

Review plan: independently inspect core/backend/UI after implementation; verify focused tests, integrated UI and exports, real local model, then document actual results. Original plan has no application baseline tests because repository was newly created.
