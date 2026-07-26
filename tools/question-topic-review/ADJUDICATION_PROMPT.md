# Targeted semantic adjudication instructions

Read the supplied override review input, its companion `.meta.json` file, the complete approved taxonomy, and `CLASSIFICATION_PROMPT.md` before assigning anything.

The row indices were selected explicitly by a human or a prior semantic GPT review. Do not discover, expand, filter, or classify candidate rows with keywords or code.

For every supplied row, independently reconsider the best specific topic from the current taxonomy after reading the complete original Slovenian question and all four options. Return exactly one assignment for every supplied `row_index`, in the supplied input order.

Set `override_stem` to the exact stem recorded in the companion metadata. Copy `source_sha256`, `taxonomy_sha256`, and `input_sha256` exactly from that metadata. Do not create topic IDs or add rows.
