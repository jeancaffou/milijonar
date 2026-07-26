# GPT question-topic review

The catalogue's preparation guide is based on a semantic review of every question, not keyword matching.

GPT reads the complete original Slovenian question and all four original answer options. It assigns one specific primary topic according to the knowledge needed to solve the question. Broad subjects are retained only for navigation. They are not the units ranked in the learning guide.

For example, football is divided into specific topics such as players and coaches, clubs, national teams, competitions, rules, venues, and records. The same principle applies throughout the archive.

The small JavaScript utilities in this folder do not classify questions. They only:

- prepare numbered review batches or explicitly requested adjudication rows from `questions.csv`;
- verify that GPT returned exactly one valid assignment for every catalogue row and every targeted override;
- calculate totals, percentages, question-position distributions, and page data from the reviewed assignments.

The reviewed source files are kept separately from the generated totals so that classification decisions can be audited and corrected without recreating them from opaque rules.

## Complete regeneration

Run these commands from the `catalog/` folder. A complete regeneration should begin with empty `review-input/` and `review-output/` batch directories; do not mix overlapping batch sizes from an older run.

First prepare the compact reviewed taxonomy and numbered question batches:

```sh
node tools/question-topic-review/prepare-taxonomy.mjs
node tools/question-topic-review/prepare-review.mjs all 400
```

Each question batch has a companion `.meta.json` file containing the exact `questions.csv`, taxonomy and batch fingerprints. Review every batch with GPT at high reasoning effort. This is the exact command for the first batch; change both `batch-00000-00399` paths and the stated row range for each subsequent batch:

```sh
codex exec --skip-git-repo-check --ignore-rules --ephemeral --sandbox read-only --color never -c 'model_reasoning_effort="high"' -C . --output-schema tools/question-topic-review/assignment-schema.json -o work/analysis-output/question-topics/review-output/batch-00000-00399.json 'Perform the final semantic topic assignment for rows 0 through 399. Read tools/question-topic-review/CLASSIFICATION_PROMPT.md, work/analysis-output/question-topics/classifier-taxonomy.json, work/analysis-output/question-topics/review-input/batch-00000-00399.json, and its batch-00000-00399.meta.json companion. Do not use keyword matching or code to decide labels. Return exactly one assignment per row in input order and copy all three SHA-256 fields from the companion metadata.'
```

Medium- and low-confidence rows must be adjudicated semantically before publication. If the taxonomy changes during review, regenerate the compact taxonomy and affected inputs, then review every affected batch again; an old output cannot be relabelled as if it had seen the new taxonomy.

## Targeted GPT adjudication

Use an override only for an explicit row-index list. It is acceptable to package candidates mechanically from existing GPT-reviewed metadata—for example, rows currently assigned to specified legacy topic IDs, rows from taxonomy-unbound batches, or rows marked medium or low confidence. That filtering only selects records for another semantic review; it does not decide their new labels.

Do not select or label questions by matching words in the question or answers, by applying subject keyword rules, or by assigning a replacement topic in code. GPT must make every semantic classification decision after reading the complete Slovenian question and all four options.

Save the exact row indices as a non-empty JSON array with no duplicates. The order is deliberate and will be enforced. For example:

```json
[226, 1010, 1279, 4348]
```

Prepare a provenance-bound input by passing that JSON file and a unique lowercase output stem. A quoted inline array such as `'[226,1010]'` is also accepted when a separate file is unnecessary:

```sh
node tools/question-topic-review/prepare-review.mjs override work/analysis-output/question-topics/manual-row-indices.json semantic-boundary-audit
```

This writes the full Slovenian question and all four answers for those rows to `review-input/overrides/semantic-boundary-audit.json`, with a companion metadata file. It does not propose or classify any row.

Run the targeted adjudication with the dedicated strict schema:

```sh
codex exec --skip-git-repo-check --ignore-rules --ephemeral --sandbox read-only --color never -c 'model_reasoning_effort="high"' -C . --output-schema tools/question-topic-review/override-schema.json -o work/analysis-output/question-topics/review-output/overrides/semantic-boundary-audit.json 'Adjudicate only the supplied rows. Read tools/question-topic-review/ADJUDICATION_PROMPT.md, tools/question-topic-review/CLASSIFICATION_PROMPT.md, work/analysis-output/question-topics/classifier-taxonomy.json, work/analysis-output/question-topics/review-input/overrides/semantic-boundary-audit.json, and its semantic-boundary-audit.meta.json companion. Reason from every complete Slovenian question and all four options. Return rows in the supplied order and copy the override stem and all three SHA-256 fields exactly.'
```

During merge, every prepared override must have a reviewed output and must match its current input, CSV and taxonomy fingerprints exactly. Its indices must be unique, remain in input order and already have a valid base assignment. A row may appear in only one override file. Valid override assignments replace the corresponding base rows; the merged record reports both the number replaced and how many classifications actually changed.

Only after every row has one final assignment, merge the reviewed batches and calculate the public totals:

```sh
node tools/question-topic-review/merge-review.mjs
node tools/question-topic-review/build-analysis.mjs
```

The merge stops on stale source text, stale taxonomy metadata, overlapping ranges, missing rows, changed input, unknown topics, invalid confidence data or out-of-order assignments. The analysis build independently repeats exact-coverage and provenance checks before writing the published topic totals.

Older review batches created before companion metadata remain readable so historical work is not discarded. They are marked as taxonomy-unbound in the merged record and should receive a GPT audit against the final taxonomy before publication.
