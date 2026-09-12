# Implementation progress

The implementation is complete in `active/living-poster`. The user's free-only requirement supersedes the hosted-service proposal in the original plan. The application uses local Ollama, SQLite and session authentication in its own Git repository.

| Workstream  | Delivered                                                                      | Verification                                                                            |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Core        | Versioned scenes, commands, six motions, checked fonts and six compositions    | 44 tests; actual-font Chromium probes; eight benchmarks                                 |
| Backend     | Private access, immutable revisions, revocable shares and durable model jobs   | 20 API tests using real SQLite                                                          |
| Frontend    | Canvas editor, inspector, timeline/pointer capture, undo, recovery and library | 13 frontend tests; browser and accessibility checks                                     |
| Exports     | PNG and self-contained HTML using the shared evaluator                         | Exact offline frame parity across all examples and font/shape/pointer fixtures          |
| Integration | Native setup, documentation, case study and real 60-second UI recording        | Build/typecheck pass; 18 browser tests pass; zero audit findings                        |
| Local AI    | Real qwen3:4b inference with validated actions and stale-response guards       | Original set 37/40; fresh release set 19/20; all clear-target edits passed; $0 API cost |

Independent reviews led to fixes for acknowledgement races, conflict isolation, invalid-restore identity changes, geometry preflight, pending prompt corrections, pointer endpoints, share revocation, immediate title recovery, plain-HTTP UUIDs and missing export assets. Regression tests cover these issues.

Implementation and automated verification are complete. Independent human creative review remains explicitly pending; see [evaluation.md](evaluation.md) for measured model limitations and the rubric. No cloud deployment or paid feature is configured.
