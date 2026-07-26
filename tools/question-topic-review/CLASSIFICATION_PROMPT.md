# Semantic classification instructions

Read the supplied review batch, its companion `.meta.json` file when present, and the complete approved taxonomy before assigning anything.

For every question:

1. Read the full original Slovenian prompt and all four answer options.
2. Identify the knowledge a well-prepared contestant would need to answer it.
3. Assign exactly one specific taxonomy topic. Broad domains are never valid assignments.
4. Prefer the tested fact over incidental words in the prompt or distractors.
5. Use the taxonomy's inclusion and exclusion boundaries, especially for cross-subject cases.
6. Use `medium` confidence when two topics are genuinely plausible and record the runner-up. Use `low` only when the taxonomy has no clean fit, with a concise note explaining the missing boundary.

Do not classify by keyword matching. Do not infer a topic from one name or answer option without understanding the complete question. Do not create new topic IDs in a batch response.

Return exactly one assignment for every supplied `row_index`, in input order. Copy `source_sha256`, `taxonomy_sha256`, and `input_sha256` from the companion metadata into the response when those fields are available. The output is reviewed data; scripts only validate and total it.
