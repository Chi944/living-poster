# Held-out editing evaluation

The 40 instructions and their expected property effects were specified by the coordinating agent independently of the backend/model-prompt implementation, before running the model. They are not model prompt examples. `scripts/evaluate.ts` runs the local model against these fixtures and preserves every failure in a dated result file. Invariant tests remain separate from language-model quality.

Human creative review is a separate rubric: target accuracy, visual interpretation, readability, restraint, each scored 1–5. An average at least 4 is acceptable. Automated semantic checks do not claim to substitute for human review. See docs/evaluation.md for actual measured results and review status.

`release-holdout.json` adds 20 fresh independent cases created after the final provider was frozen. Set `EVAL_CASES=evals/release-holdout.json` to run them. Later runs of the original 40 cases are regression comparisons. All four measured reports, including the failed baseline, remain in `results/`.
