# Answer-sequence analysis tools

These optional research tools regenerate the statistical data used by the catalogue's interactive answer-sequence page. They are not needed to build or browse the web catalogue: the current generated result is committed at `src/assets/data/answer-patterns.json`.

## Files

- `analyze.py` engineers question-board features, runs statistical tests and chronological model evaluation, and writes the public JSON result.
- `sequence_models.py` contains long-sequence, lag, recurrence, balance, compression, randomisation and spectral tests used by `analyze.py`.
- `requirements.txt` lists the Python packages required for a full rerun.

Temporary engineered features are written to `work/analysis-output/answer-sequences/features.csv`. They are reproducible working data and are deliberately excluded from the publishable source tree.

## Regenerating the result

Run these commands from the catalogue root:

```bash
python3 -m pip install --target /tmp/milijonar_ml_deps -r tools/answer-sequence-analysis/requirements.txt
PYTHONPATH=/tmp/milijonar_ml_deps python3 tools/answer-sequence-analysis/analyze.py
```

The analysis trains general models on S01-S08 and evaluates them on S09-S10. Later-era sequence configurations are selected on S08 after fitting S03-S07, then evaluated once on the untouched S09-S10 holdout. The predictive sequence tests exclude Q1; the descriptive answer grid includes Q1.

Do not rerun this analysis after image-only or timestamp-only edits. Regenerate it only when catalogue rows or question/answer content change.
