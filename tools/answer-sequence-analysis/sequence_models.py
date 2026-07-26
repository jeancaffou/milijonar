"""Long-horizon sequence tests for the Milijonar answer catalogue.

The primary tests deliberately exclude Q1.  Prefix-locked models only observe
the first k Q2+ answers in a run; adaptive models are labelled separately.
"""

from __future__ import annotations

import json
import itertools
import math
import zlib
from collections import Counter, defaultdict
from typing import Callable

import numpy as np
from scipy.stats import binomtest
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression


LETTERS = ("A", "B", "C", "D")
LETTER_TO_INDEX = {letter: index for index, letter in enumerate(LETTERS)}


def make_sequences(
    rows: list[dict[str, object]], stream: str, grouping: str = "contestant"
) -> list[dict[str, object]]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        if int(row["season"]) < 3 or int(row["question_number"]) <= 1:
            continue
        if stream == "ladder" and not int(row["is_ladder_effective"]):
            continue
        group_id = (
            str(row["logical_run_id"]) if grouping == "contestant"
            else str(row["episode_id"])
        )
        grouped[group_id].append(row)

    sequences = []
    for logical_id, sequence_rows in grouped.items():
        sequence_rows.sort(key=lambda row: int(row["row_id"]))
        entries = [
            {
                "row": row,
                "row_id": int(row["row_id"]),
                "letter": LETTER_TO_INDEX[str(row["correct_answer"])],
                "position": index,
            }
            for index, row in enumerate(sequence_rows)
        ]
        question_numbers = [int(entry["row"]["question_number"]) for entry in entries]
        requires_q2_start = grouping == "contestant"
        sequences.append({
            "id": logical_id,
            "entries": entries,
            "starts_at_q2": bool(question_numbers and question_numbers[0] == 2),
            "has_source_gap": any(
                int(entry["row"]["known_source_gap_before"]) for entry in entries
            ),
            "reliable_template": bool(
                question_numbers
                and (question_numbers[0] == 2 or not requires_q2_start)
                and not any(int(entry["row"]["known_source_gap_before"]) for entry in entries)
            ),
        })
    return sorted(sequences, key=lambda sequence: int(sequence["entries"][0]["row_id"]))


def deduplicate_sequences(
    sequences: list[dict[str, object]]
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    """Remove later near-complete rebroadcast/question-block duplicates."""
    kept: list[dict[str, object]] = []
    kept_fingerprints: list[set[str]] = []
    exclusions = []
    for sequence in sequences:
        fingerprints = {
            str(entry["row"]["question_fingerprint"])
            for entry in sequence["entries"]
        }
        duplicate = None
        for prior, prior_fingerprints in zip(kept, kept_fingerprints):
            shared = len(fingerprints & prior_fingerprints)
            union = len(fingerprints | prior_fingerprints)
            jaccard = shared / union if union else 0.0
            if shared >= 5 and jaccard >= 0.5:
                duplicate = (prior, shared, jaccard)
                break
        if duplicate:
            prior, shared, jaccard = duplicate
            first = sequence["entries"][0]["row"]
            prior_first = prior["entries"][0]["row"]
            exclusions.append({
                "excluded_sequence_id": sequence["id"],
                "kept_sequence_id": prior["id"],
                "shared_question_count": shared,
                "question_jaccard": jaccard,
                "excluded_label": (
                    f"S{int(first['season']):02}E{int(first['episode']):02} "
                    f"{first['contestant_name']}"
                ),
                "kept_label": (
                    f"S{int(prior_first['season']):02}E{int(prior_first['episode']):02} "
                    f"{prior_first['contestant_name']}"
                ),
            })
            continue
        kept.append(sequence)
        kept_fingerprints.append(fingerprints)
    return kept, exclusions


def slice_training_sequences(
    sequences: list[dict[str, object]], max_season: int
) -> list[dict[str, object]]:
    output = []
    for sequence in sequences:
        if not sequence["reliable_template"]:
            continue
        entries = [
            entry for entry in sequence["entries"]
            if int(entry["row"]["season"]) <= max_season
        ]
        if entries:
            output.append({**sequence, "entries": entries})
    return output


def target_entries(
    sequences: list[dict[str, object]], seasons: set[int]
) -> list[dict[str, object]]:
    return [
        entry
        for sequence in sequences if sequence["reliable_template"]
        for entry in sequence["entries"]
        if int(entry["row"]["season"]) in seasons
    ]


def baseline_letter(training_sequences: list[dict[str, object]]) -> int:
    counts = Counter(
        int(entry["letter"])
        for sequence in training_sequences for entry in sequence["entries"]
    )
    return max(range(4), key=lambda index: (counts[index], -index))


def choose_vote(votes: Counter[int], fallback: int) -> int | None:
    if not votes:
        return None
    maximum = max(votes.values())
    winners = [letter for letter, value in votes.items() if value == maximum]
    return fallback if fallback in winners else min(winners)


def canonical_prefix(prefix: tuple[int, ...], mode: str) -> tuple[int, ...]:
    if mode == "identity":
        return prefix
    if mode == "cyclic":
        return tuple((letter - prefix[0]) % 4 for letter in prefix)
    if mode == "permutation":
        mapping: dict[int, int] = {}
        return tuple(mapping.setdefault(letter, len(mapping)) for letter in prefix)
    raise ValueError(mode)


def encode_target(prefix: tuple[int, ...], target: int, mode: str) -> int:
    if mode == "identity":
        return target
    if mode == "cyclic":
        return (target - prefix[0]) % 4
    if mode == "permutation":
        mapping: dict[int, int] = {}
        for letter in prefix:
            mapping.setdefault(letter, len(mapping))
        return mapping.get(target, -1)
    raise ValueError(mode)


def decode_votes(
    prefix: tuple[int, ...], encoded_votes: Counter[int], mode: str
) -> Counter[int]:
    if mode == "identity":
        return Counter(encoded_votes)
    if mode == "cyclic":
        return Counter({
            (code + prefix[0]) % 4: weight for code, weight in encoded_votes.items()
        })
    if mode == "permutation":
        class_to_letter: dict[int, int] = {}
        for letter in prefix:
            if letter not in class_to_letter.values():
                class_to_letter[len(class_to_letter)] = letter
        unused = [letter for letter in range(4) if letter not in class_to_letter.values()]
        output: Counter[int] = Counter()
        for code, weight in encoded_votes.items():
            if code in class_to_letter:
                output[class_to_letter[code]] += weight
            elif code == -1 and unused:
                for letter in unused:
                    output[letter] += weight / len(unused)
        return output
    raise ValueError(mode)


def prediction(
    letter: int, support: float, family_detail: str = ""
) -> dict[str, object]:
    return {"letter": letter, "support": support, "detail": family_detail}


def predict_ngram(
    training: list[dict[str, object]], evaluation: list[dict[str, object]],
    seasons: set[int], fallback: int, config: dict[str, object],
) -> dict[int, dict[str, object]]:
    order = int(config["order"])
    minimum = int(config["min_support"])
    use_position = config["scope"] == "position"
    lookup: dict[tuple[object, ...], Counter[int]] = defaultdict(Counter)
    for sequence in training:
        letters = [int(entry["letter"]) for entry in sequence["entries"]]
        for index in range(order, len(letters)):
            key = tuple(letters[index - order:index]) + ((index,) if use_position else ())
            lookup[key][letters[index]] += 1

    output = {}
    for sequence in evaluation:
        if not sequence["reliable_template"]:
            continue
        letters = [int(entry["letter"]) for entry in sequence["entries"]]
        for index, entry in enumerate(sequence["entries"]):
            if int(entry["row"]["season"]) not in seasons or index < order:
                continue
            key = tuple(letters[index - order:index]) + ((index,) if use_position else ())
            counts = lookup.get(key, Counter())
            support = sum(counts.values())
            if support >= minimum:
                chosen = choose_vote(counts, fallback)
                if chosen is not None:
                    output[int(entry["row_id"])] = prediction(chosen, support)
    return output


def predict_initial_prefix(
    training: list[dict[str, object]], evaluation: list[dict[str, object]],
    seasons: set[int], fallback: int, config: dict[str, object],
) -> dict[int, dict[str, object]]:
    length = int(config["prefix_length"])
    minimum = int(config["min_support"])
    mode = str(config["transform"])
    lookup: dict[tuple[tuple[int, ...], int], Counter[int]] = defaultdict(Counter)
    support_counts: Counter[tuple[tuple[int, ...], int]] = Counter()
    for sequence in training:
        letters = tuple(int(entry["letter"]) for entry in sequence["entries"])
        if len(letters) <= length:
            continue
        prefix = letters[:length]
        key_prefix = canonical_prefix(prefix, mode)
        for index in range(length, len(letters)):
            key = (key_prefix, index)
            lookup[key][encode_target(prefix, letters[index], mode)] += 1
            support_counts[key] += 1

    output = {}
    for sequence in evaluation:
        if not sequence["reliable_template"]:
            continue
        letters = tuple(int(entry["letter"]) for entry in sequence["entries"])
        if len(letters) <= length:
            continue
        prefix = letters[:length]
        key_prefix = canonical_prefix(prefix, mode)
        for index, entry in enumerate(sequence["entries"]):
            if int(entry["row"]["season"]) not in seasons or index < length:
                continue
            key = (key_prefix, index)
            support = support_counts[key]
            if support < minimum:
                continue
            votes = decode_votes(prefix, lookup[key], mode)
            chosen = choose_vote(votes, fallback)
            if chosen is not None:
                output[int(entry["row_id"])] = prediction(chosen, support)
    return output


def predict_nearest_prefix(
    training: list[dict[str, object]], evaluation: list[dict[str, object]],
    seasons: set[int], fallback: int, config: dict[str, object],
) -> dict[int, dict[str, object]]:
    length = int(config["prefix_length"])
    neighbor_count = int(config["neighbors"])
    mode = str(config["transform"])
    max_mismatches = math.floor(float(config["max_mismatch_rate"]) * length)
    candidates_by_position: dict[int, list[tuple[tuple[int, ...], int, str]]] = defaultdict(list)
    for sequence in training:
        letters = tuple(int(entry["letter"]) for entry in sequence["entries"])
        if len(letters) <= length:
            continue
        prefix = letters[:length]
        key = canonical_prefix(prefix, mode)
        for index in range(length, len(letters)):
            candidates_by_position[index].append(
                (key, encode_target(prefix, letters[index], mode), str(sequence["id"]))
            )

    output = {}
    for sequence in evaluation:
        if not sequence["reliable_template"]:
            continue
        letters = tuple(int(entry["letter"]) for entry in sequence["entries"])
        if len(letters) <= length:
            continue
        prefix = letters[:length]
        key = canonical_prefix(prefix, mode)
        for index, entry in enumerate(sequence["entries"]):
            if int(entry["row"]["season"]) not in seasons or index < length:
                continue
            candidates = []
            for candidate_key, target_code, sequence_id in candidates_by_position[index]:
                if sequence_id == sequence["id"]:
                    continue
                distance = sum(left != right for left, right in zip(key, candidate_key))
                if distance <= max_mismatches:
                    candidates.append((distance, target_code))
            candidates.sort(key=lambda item: item[0])
            selected = candidates[:neighbor_count]
            encoded_votes: Counter[int] = Counter()
            for distance, target_code in selected:
                encoded_votes[target_code] += 1.0 / (1 + distance)
            votes = decode_votes(prefix, encoded_votes, mode)
            chosen = choose_vote(votes, fallback)
            if chosen is not None:
                output[int(entry["row_id"])] = prediction(
                    chosen, len(selected), f"nearest distance {selected[0][0]}"
                )
    return output


def predict_shifted_template(
    training: list[dict[str, object]], evaluation: list[dict[str, object]],
    seasons: set[int], fallback: int, config: dict[str, object],
) -> dict[int, dict[str, object]]:
    length = int(config["prefix_length"])
    minimum = int(config["min_support"])
    mode = str(config["transform"])
    lookup: dict[tuple[tuple[int, ...], int], Counter[int]] = defaultdict(Counter)
    support_counts: Counter[tuple[tuple[int, ...], int]] = Counter()
    for sequence in training:
        letters = tuple(int(entry["letter"]) for entry in sequence["entries"])
        for start in range(0, max(0, len(letters) - length)):
            prefix = letters[start:start + length]
            key_prefix = canonical_prefix(prefix, mode)
            for future_index in range(length, len(letters) - start):
                key = (key_prefix, future_index)
                lookup[key][encode_target(prefix, letters[start + future_index], mode)] += 1
                support_counts[key] += 1

    output = {}
    for sequence in evaluation:
        if not sequence["reliable_template"]:
            continue
        letters = tuple(int(entry["letter"]) for entry in sequence["entries"])
        if len(letters) <= length:
            continue
        prefix = letters[:length]
        key_prefix = canonical_prefix(prefix, mode)
        for index, entry in enumerate(sequence["entries"]):
            if int(entry["row"]["season"]) not in seasons or index < length:
                continue
            key = (key_prefix, index)
            support = support_counts[key]
            if support < minimum:
                continue
            votes = decode_votes(prefix, lookup[key], mode)
            chosen = choose_vote(votes, fallback)
            if chosen is not None:
                output[int(entry["row_id"])] = prediction(chosen, support)
    return output


def predict_periodic(
    training: list[dict[str, object]], evaluation: list[dict[str, object]],
    seasons: set[int], fallback: int, config: dict[str, object],
) -> dict[int, dict[str, object]]:
    del training, fallback
    period = int(config["period"])
    adaptive = config["mode"] == "adaptive"
    output = {}
    for sequence in evaluation:
        if not sequence["reliable_template"]:
            continue
        actual = [int(entry["letter"]) for entry in sequence["entries"]]
        generated = actual[:period]
        for index in range(period, len(actual)):
            if adaptive:
                predicted = actual[index - period]
            else:
                predicted = generated[index - period]
                generated.append(predicted)
            entry = sequence["entries"][index]
            if int(entry["row"]["season"]) in seasons:
                output[int(entry["row_id"])] = prediction(predicted, period)
    return output


def infer_permutation(first: list[int], second: list[int]) -> dict[int, int] | None:
    mapping: dict[int, int] = {}
    reverse: dict[int, int] = {}
    for source, target in zip(first, second):
        if source in mapping and mapping[source] != target:
            return None
        if target in reverse and reverse[target] != source:
            return None
        mapping[source] = target
        reverse[target] = source
    if len(mapping) == 3:
        missing_source = next(letter for letter in range(4) if letter not in mapping)
        missing_target = next(letter for letter in range(4) if letter not in reverse)
        mapping[missing_source] = missing_target
    return mapping


def predict_block_transform(
    training: list[dict[str, object]], evaluation: list[dict[str, object]],
    seasons: set[int], fallback: int, config: dict[str, object],
) -> dict[int, dict[str, object]]:
    del training, fallback
    period = int(config["period"])
    transform = str(config["transform"])
    minimum_consistency = float(config.get("min_consistency", 1.0))
    output = {}
    for sequence in evaluation:
        if not sequence["reliable_template"]:
            continue
        actual = [int(entry["letter"]) for entry in sequence["entries"]]
        if len(actual) <= 2 * period:
            continue
        first = actual[:period]
        second = actual[period:2 * period]
        generated = actual[:2 * period]
        if transform == "cyclic":
            deltas = [(target - source) % 4 for source, target in zip(first, second)]
            counts = Counter(deltas)
            delta, count = max(counts.items(), key=lambda item: (item[1], -item[0]))
            if count / period < minimum_consistency:
                continue
            mapping: Callable[[int], int | None] = lambda value: (value + delta) % 4
            support = count
        else:
            permutation = infer_permutation(first, second)
            if permutation is None:
                continue
            mapping = lambda value: permutation.get(value)
            support = len(permutation)
        for index in range(2 * period, len(actual)):
            predicted = mapping(generated[index - period])
            if predicted is None:
                generated.append(actual[index])
                continue
            generated.append(predicted)
            entry = sequence["entries"][index]
            if int(entry["row"]["season"]) in seasons:
                output[int(entry["row_id"])] = prediction(predicted, support)
    return output


def fit_categorical_mixture(
    training: list[dict[str, object]], clusters: int, seed: int = 20260713
) -> dict[str, np.ndarray]:
    max_length = max(len(sequence["entries"]) for sequence in training)
    matrix = np.full((len(training), max_length), -1, dtype=int)
    for row_index, sequence in enumerate(training):
        letters = [int(entry["letter"]) for entry in sequence["entries"]]
        matrix[row_index, :len(letters)] = letters
    rng = np.random.default_rng(seed + clusters)
    best = None
    for restart in range(4):
        responsibilities = rng.dirichlet(np.ones(clusters), size=len(training))
        previous = -np.inf
        for _ in range(80):
            weights = responsibilities.sum(axis=0) + 0.5
            weights /= weights.sum()
            probabilities = np.full((clusters, max_length, 4), 1.5, dtype=float)
            for position in range(max_length):
                observed = matrix[:, position] >= 0
                if not observed.any():
                    continue
                for letter in range(4):
                    matches = matrix[:, position] == letter
                    probabilities[:, position, letter] += responsibilities[matches].sum(axis=0)
            probabilities /= probabilities.sum(axis=2, keepdims=True)
            log_posterior = np.tile(np.log(weights), (len(training), 1))
            for position in range(max_length):
                observed_rows = np.where(matrix[:, position] >= 0)[0]
                if not len(observed_rows):
                    continue
                observed_letters = matrix[observed_rows, position]
                log_posterior[observed_rows] += np.log(
                    probabilities[:, position, observed_letters].T
                )
            row_max = log_posterior.max(axis=1, keepdims=True)
            stabilized = np.exp(log_posterior - row_max)
            totals = stabilized.sum(axis=1, keepdims=True)
            responsibilities = stabilized / totals
            likelihood = float(np.sum(row_max + np.log(totals)))
            if abs(likelihood - previous) < 1e-7:
                break
            previous = likelihood
        candidate = {
            "weights": weights,
            "probabilities": probabilities,
            "log_likelihood": np.array(likelihood),
        }
        if best is None or likelihood > float(best["log_likelihood"]):
            best = candidate
    assert best is not None
    return best


def predict_latent_template(
    model: dict[str, np.ndarray], evaluation: list[dict[str, object]],
    seasons: set[int], fallback: int, config: dict[str, object],
) -> dict[int, dict[str, object]]:
    prefix_length = int(config["prefix_length"])
    adaptive = bool(config["adaptive"])
    weights = model["weights"]
    probabilities = model["probabilities"]
    output = {}
    for sequence in evaluation:
        if not sequence["reliable_template"]:
            continue
        letters = [int(entry["letter"]) for entry in sequence["entries"]]
        for index, entry in enumerate(sequence["entries"]):
            if int(entry["row"]["season"]) not in seasons or index < prefix_length:
                continue
            if index >= probabilities.shape[1]:
                continue
            observed_count = index if adaptive else prefix_length
            observed_count = min(observed_count, probabilities.shape[1])
            log_posterior = np.log(weights).copy()
            for position in range(observed_count):
                log_posterior += np.log(probabilities[:, position, letters[position]])
            posterior = np.exp(log_posterior - log_posterior.max())
            posterior /= posterior.sum()
            votes_array = posterior @ probabilities[:, index, :]
            votes = Counter({letter: float(votes_array[letter]) for letter in range(4)})
            chosen = choose_vote(votes, fallback)
            if chosen is not None:
                output[int(entry["row_id"])] = prediction(chosen, observed_count)
    return output


def evaluate_map(
    predictions: dict[int, dict[str, object]], targets: list[dict[str, object]], fallback: int
) -> dict[str, object]:
    actual = np.array([int(entry["letter"]) for entry in targets], dtype=int)
    predicted = np.array([
        int(predictions.get(int(entry["row_id"]), {"letter": fallback})["letter"])
        for entry in targets
    ], dtype=int)
    signal = np.array([int(entry["row_id"]) in predictions for entry in targets])
    override = signal & (predicted != fallback)
    baseline = np.full(len(targets), fallback, dtype=int)
    correct = predicted == actual
    baseline_correct = baseline == actual
    wins = int(np.sum(correct & ~baseline_correct))
    losses = int(np.sum(~correct & baseline_correct))
    paired_p = float(binomtest(wins, wins + losses, 0.5).pvalue) if wins + losses else 1.0
    return {
        "n": len(targets),
        "accuracy": float(correct.mean()) if len(targets) else 0.0,
        "baseline_accuracy": float(baseline_correct.mean()) if len(targets) else 0.0,
        "delta": float(correct.mean() - baseline_correct.mean()) if len(targets) else 0.0,
        "signal_n": int(signal.sum()),
        "signal_share": float(signal.mean()) if len(targets) else 0.0,
        "signal_accuracy": float(correct[signal].mean()) if signal.any() else None,
        "override_n": int(override.sum()),
        "override_accuracy": float(correct[override].mean()) if override.any() else None,
        "baseline_on_overrides": float(baseline_correct[override].mean()) if override.any() else None,
        "paired_wins": wins,
        "paired_losses": losses,
        "paired_p_value": paired_p,
    }


def family_configs(family: str) -> list[dict[str, object]]:
    if family == "ngram":
        return [
            {"order": order, "scope": scope, "min_support": support}
            for order in range(1, 9)
            for scope in ("global", "position")
            for support in (2, 5, 10)
        ]
    if family in ("initial_prefix", "shifted_template"):
        start = 2 if family == "initial_prefix" else 3
        return [
            {"prefix_length": length, "transform": transform, "min_support": support}
            for length in range(start, 9)
            for transform in ("identity", "cyclic", "permutation")
            for support in (1, 2, 5)
        ]
    if family == "nearest_prefix":
        return [
            {
                "prefix_length": length,
                "transform": transform,
                "neighbors": neighbors,
                "max_mismatch_rate": mismatch,
            }
            for length in range(3, 9)
            for transform in ("identity", "cyclic", "permutation")
            for neighbors in (3, 5, 10)
            for mismatch in (0.25, 0.5)
        ]
    if family == "periodic":
        return [
            {"period": period, "mode": mode}
            for period in range(2, 11) for mode in ("prefix_locked", "adaptive")
        ]
    if family == "block_transform":
        cyclic = [
            {"period": period, "transform": "cyclic", "min_consistency": consistency}
            for period in range(1, 7) for consistency in (0.5, 0.75, 1.0)
        ]
        arbitrary = [
            {"period": period, "transform": "permutation", "min_consistency": 1.0}
            for period in range(2, 7)
        ]
        return cyclic + arbitrary
    if family == "latent_template":
        return [
            {"clusters": clusters, "prefix_length": length, "adaptive": adaptive}
            for clusters in (2, 3, 4, 6, 8, 12)
            for length in range(2, 7)
            for adaptive in (False, True)
        ]
    raise ValueError(family)


PREDICTORS = {
    "ngram": predict_ngram,
    "initial_prefix": predict_initial_prefix,
    "nearest_prefix": predict_nearest_prefix,
    "shifted_template": predict_shifted_template,
    "periodic": predict_periodic,
    "block_transform": predict_block_transform,
}


def compact_config(config: dict[str, object]) -> str:
    return ", ".join(f"{key}={value}" for key, value in config.items())


def run_predictor(
    family: str, config: dict[str, object], training: list[dict[str, object]],
    evaluation: list[dict[str, object]], seasons: set[int], fallback: int,
    latent_models: dict[int, dict[str, np.ndarray]] | None = None,
) -> dict[int, dict[str, object]]:
    if family == "latent_template":
        clusters = int(config["clusters"])
        if latent_models is None:
            latent_models = {}
        if clusters not in latent_models:
            latent_models[clusters] = fit_categorical_mixture(training, clusters)
        return predict_latent_template(
            latent_models[clusters], evaluation, seasons, fallback, config
        )
    return PREDICTORS[family](training, evaluation, seasons, fallback, config)


def tune_family(
    family: str, training: list[dict[str, object]], evaluation: list[dict[str, object]],
    seasons: set[int], fallback: int,
) -> tuple[dict[str, object], list[dict[str, object]]]:
    targets = target_entries(evaluation, seasons)
    latent_models: dict[int, dict[str, np.ndarray]] = {}
    evaluations = []
    for config in family_configs(family):
        predictions = run_predictor(
            family, config, training, evaluation, seasons, fallback, latent_models
        )
        metrics = evaluate_map(predictions, targets, fallback)
        evaluations.append({"config": config, **metrics})
    selected = max(
        evaluations,
        key=lambda item: (
            float(item["accuracy"]),
            -int(item["override_n"] == 0),
            -len(json.dumps(item["config"], sort_keys=True)),
            json.dumps(item["config"], sort_keys=True),
        ),
    )
    ranked = sorted(
        evaluations, key=lambda item: (float(item["accuracy"]), float(item["delta"])),
        reverse=True,
    )
    return selected, ranked


def benjamini_hochberg(p_values: list[float]) -> list[float]:
    count = len(p_values)
    order = np.argsort(p_values)
    adjusted = np.ones(count)
    running = 1.0
    for rank_index in range(count - 1, -1, -1):
        original_index = int(order[rank_index])
        rank = rank_index + 1
        running = min(running, p_values[original_index] * count / rank)
        adjusted[original_index] = running
    return adjusted.tolist()


def shuffled_sequences(
    sequences: list[dict[str, object]], seasons: set[int], rng: np.random.Generator
) -> list[dict[str, object]]:
    copied = []
    positions: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    values: dict[tuple[int, int], list[int]] = defaultdict(list)
    for sequence_index, sequence in enumerate(sequences):
        copied_entries = []
        for entry_index, entry in enumerate(sequence["entries"]):
            copied_entry = dict(entry)
            copied_entries.append(copied_entry)
            if int(entry["row"]["season"]) in seasons:
                stratum = (int(entry["row"]["season"]), int(entry["position"]))
                positions[stratum].append((sequence_index, entry_index))
                values[stratum].append(int(entry["letter"]))
        copied.append({**sequence, "entries": copied_entries})
    for stratum, locations in positions.items():
        shuffled = np.array(values[stratum], dtype=int)
        rng.shuffle(shuffled)
        for (sequence_index, entry_index), letter in zip(locations, shuffled):
            copied[sequence_index]["entries"][entry_index]["letter"] = int(letter)
    return copied


def permutation_null(
    family: str, config: dict[str, object], training: list[dict[str, object]],
    evaluation: list[dict[str, object]], seasons: set[int], fallback: int,
    observed_delta: float, repetitions: int = 99,
) -> dict[str, object]:
    rng = np.random.default_rng(20260713 + sum(seasons) + len(family))
    latent_models: dict[int, dict[str, np.ndarray]] = {}
    if family == "latent_template":
        clusters = int(config["clusters"])
        latent_models[clusters] = fit_categorical_mixture(training, clusters)
    deltas = []
    for _ in range(repetitions):
        shuffled = shuffled_sequences(evaluation, seasons, rng)
        predictions = run_predictor(
            family, config, training, shuffled, seasons, fallback, latent_models
        )
        metrics = evaluate_map(predictions, target_entries(shuffled, seasons), fallback)
        deltas.append(float(metrics["delta"]))
    values = np.array(deltas)
    return {
        "repetitions": repetitions,
        "null_mean_delta": float(values.mean()),
        "null_ci_low": float(np.quantile(values, 0.025)),
        "null_ci_high": float(np.quantile(values, 0.975)),
        "empirical_p_value": float((1 + np.sum(values >= observed_delta)) / (repetitions + 1)),
    }


def agreement_at_lag(sequences: list[dict[str, object]], lag: int) -> tuple[int, int]:
    matches = 0
    total = 0
    for sequence in sequences:
        letters = [int(entry["letter"]) for entry in sequence["entries"]]
        if len(letters) <= lag:
            continue
        matches += sum(letters[index] == letters[index - lag] for index in range(lag, len(letters)))
        total += len(letters) - lag
    return matches, total


def shuffle_all_positions(
    sequences: list[dict[str, object]], rng: np.random.Generator
) -> list[dict[str, object]]:
    seasons = {
        int(entry["row"]["season"])
        for sequence in sequences for entry in sequence["entries"]
    }
    return shuffled_sequences(sequences, seasons, rng)


def repeated_ngram_share(sequences: list[dict[str, object]], length: int) -> dict[str, object]:
    counts: Counter[tuple[int, ...]] = Counter()
    for sequence in sequences:
        letters = tuple(int(entry["letter"]) for entry in sequence["entries"])
        counts.update(letters[index:index + length] for index in range(len(letters) - length + 1))
    total = sum(counts.values())
    repeated = sum(count for count in counts.values() if count > 1)
    most_common = counts.most_common(1)
    return {
        "length": length,
        "total_occurrences": total,
        "distinct": len(counts),
        "repeated_occurrence_share": repeated / total if total else 0.0,
        "most_common": (
            "".join(LETTERS[index] for index in most_common[0][0]) if most_common else ""
        ),
        "most_common_count": most_common[0][1] if most_common else 0,
    }


def prefix_collision_share(sequences: list[dict[str, object]], length: int) -> dict[str, object]:
    prefixes = [
        tuple(int(entry["letter"]) for entry in sequence["entries"][:length])
        for sequence in sequences if len(sequence["entries"]) >= length
    ]
    counts = Counter(prefixes)
    matched_pairs = sum(count * (count - 1) // 2 for count in counts.values())
    total_pairs = len(prefixes) * (len(prefixes) - 1) // 2
    return {
        "length": length,
        "sequence_n": len(prefixes),
        "distinct_prefixes": len(counts),
        "matched_pair_share": matched_pairs / total_pairs if total_pairs else 0.0,
        "largest_group": max(counts.values(), default=0),
    }


def within_sequence_same_pair_share(
    sequences: list[dict[str, object]]
) -> tuple[int, int, float]:
    same_pairs = 0
    all_pairs = 0
    for sequence in sequences:
        letters = [int(entry["letter"]) for entry in sequence["entries"]]
        counts = Counter(letters)
        same_pairs += sum(count * (count - 1) // 2 for count in counts.values())
        all_pairs += len(letters) * (len(letters) - 1) // 2
    return same_pairs, all_pairs, same_pairs / all_pairs if all_pairs else 0.0


def sequence_descriptives(
    sequences: list[dict[str, object]], repetitions: int = 499
) -> dict[str, object]:
    reliable = [sequence for sequence in sequences if sequence["reliable_template"]]
    observed_lags = []
    for lag in range(1, 21):
        matches, total = agreement_at_lag(reliable, lag)
        observed_lags.append({
            "lag": lag,
            "n": total,
            "same_share": matches / total if total else 0.0,
        })
    motifs = [repeated_ngram_share(reliable, length) for length in range(3, 9)]
    prefixes = [prefix_collision_share(reliable, length) for length in range(2, 9)]
    balance_same_pairs, balance_pairs, balance_share = within_sequence_same_pair_share(
        reliable
    )

    rng = np.random.default_rng(20260713)
    lag_null = [[] for _ in observed_lags]
    motif_null = [[] for _ in motifs]
    prefix_null = [[] for _ in prefixes]
    balance_null = []
    for _ in range(repetitions):
        shuffled = shuffle_all_positions(reliable, rng)
        for index, item in enumerate(observed_lags):
            matches, total = agreement_at_lag(shuffled, int(item["lag"]))
            lag_null[index].append(matches / total if total else 0.0)
        for index, item in enumerate(motifs):
            motif_null[index].append(
                repeated_ngram_share(shuffled, int(item["length"]))["repeated_occurrence_share"]
            )
        for index, item in enumerate(prefixes):
            prefix_null[index].append(
                prefix_collision_share(shuffled, int(item["length"]))["matched_pair_share"]
            )
        balance_null.append(within_sequence_same_pair_share(shuffled)[2])

    lag_p_values = []
    for item, null in zip(observed_lags, lag_null):
        values = np.array(null)
        observed = float(item["same_share"])
        center = float(values.mean())
        p_value = float(
            (1 + np.sum(np.abs(values - center) >= abs(observed - center)))
            / (repetitions + 1)
        )
        lag_p_values.append(p_value)
        item.update({
            "null_mean": center,
            "null_ci_low": float(np.quantile(values, 0.025)),
            "null_ci_high": float(np.quantile(values, 0.975)),
            "empirical_p_value": p_value,
        })
    for item, q_value in zip(observed_lags, benjamini_hochberg(lag_p_values)):
        item["fdr_q_value"] = q_value

    for collection, null_collection, key in (
        (motifs, motif_null, "repeated_occurrence_share"),
        (prefixes, prefix_null, "matched_pair_share"),
    ):
        collection_p_values = []
        for item, null in zip(collection, null_collection):
            values = np.array(null)
            observed = float(item[key])
            p_value = float(
                (1 + np.sum(values >= observed)) / (repetitions + 1)
            )
            collection_p_values.append(p_value)
            item.update({
                "null_mean": float(values.mean()),
                "null_ci_low": float(np.quantile(values, 0.025)),
                "null_ci_high": float(np.quantile(values, 0.975)),
                "empirical_p_value": p_value,
            })
        for item, q_value in zip(collection, benjamini_hochberg(collection_p_values)):
            item["fdr_q_value"] = q_value

    lengths = [len(sequence["entries"]) for sequence in reliable]
    balance_values = np.array(balance_null)
    balance_center = float(balance_values.mean())
    balance_two_sided_p = float(
        (
            1
            + np.sum(
                np.abs(balance_values - balance_center)
                >= abs(balance_share - balance_center)
            )
        )
        / (repetitions + 1)
    )
    return {
        "sequence_count": len(sequences),
        "reliable_sequence_count": len(reliable),
        "question_count": sum(lengths),
        "median_length": float(np.median(lengths)) if lengths else 0.0,
        "max_length": max(lengths, default=0),
        "shuffle_repetitions": repetitions,
        "lag_agreement": observed_lags,
        "ngram_recurrence": motifs,
        "prefix_collisions": prefixes,
        "within_run_balance": {
            "definition": (
                "Share of within-run question pairs carrying the same letter; "
                "unusually low values indicate deliberate run balancing"
            ),
            "same_letter_pairs": balance_same_pairs,
            "all_pairs": balance_pairs,
            "same_pair_share": balance_share,
            "null_mean": balance_center,
            "null_ci_low": float(np.quantile(balance_values, 0.025)),
            "null_ci_high": float(np.quantile(balance_values, 0.975)),
            "lower_tail_p_value": float(
                (1 + np.sum(balance_values <= balance_share)) / (repetitions + 1)
            ),
            "upper_tail_p_value": float(
                (1 + np.sum(balance_values >= balance_share)) / (repetitions + 1)
            ),
            "two_sided_p_value": balance_two_sided_p,
        },
    }


def run_stream_experiment(
    sequences: list[dict[str, object]], stream: str, grouping: str
) -> tuple[dict[str, object], dict[int, dict[str, object]], str]:
    raw_sequences = sequences
    sequences, duplicate_exclusions = deduplicate_sequences(raw_sequences)
    tuning_training = slice_training_sequences(sequences, 7)
    final_training = slice_training_sequences(sequences, 8)
    tuning_fallback = baseline_letter(tuning_training)
    final_fallback = baseline_letter(final_training)
    families = (
        "ngram", "initial_prefix", "nearest_prefix", "shifted_template",
        "periodic", "block_transform", "latent_template",
    )
    family_results = []
    tuning_seasons = {8}
    holdout_seasons = {9, 10}
    for family in families:
        selected, ranked = tune_family(
            family, tuning_training, sequences, tuning_seasons, tuning_fallback
        )
        final_predictions = run_predictor(
            family, selected["config"], final_training, sequences,
            holdout_seasons, final_fallback,
        )
        holdout = evaluate_map(
            final_predictions, target_entries(sequences, holdout_seasons), final_fallback
        )
        rolling_forward = []
        for evaluation_season in (9, 10):
            rolling_training = slice_training_sequences(sequences, evaluation_season - 1)
            rolling_fallback = baseline_letter(rolling_training)
            rolling_predictions = run_predictor(
                family, selected["config"], rolling_training, sequences,
                {evaluation_season}, rolling_fallback,
            )
            rolling_forward.append({
                "season": evaluation_season,
                "training_through_season": evaluation_season - 1,
                **evaluate_map(
                    rolling_predictions,
                    target_entries(sequences, {evaluation_season}),
                    rolling_fallback,
                ),
            })
        null = permutation_null(
            family, selected["config"], final_training, sequences,
            holdout_seasons, final_fallback, float(holdout["delta"]),
        )
        family_results.append({
            "family": family,
            "selected_config": selected["config"],
            "tuning": {key: value for key, value in selected.items() if key != "config"},
            "holdout": holdout,
            "rolling_forward": rolling_forward,
            "null": null,
            "configurations_tested": len(ranked),
            "top_tuning_configurations": ranked[:10],
        })

    adjusted = benjamini_hochberg([
        float(item["null"]["empirical_p_value"]) for item in family_results
    ])
    for item, q_value in zip(family_results, adjusted):
        item["null"]["family_fdr_q_value"] = q_value

    locked = max(
        family_results,
        key=lambda item: (
            float(item["tuning"]["accuracy"]),
            float(item["tuning"]["delta"]),
            item["family"],
        ),
    )
    locked_predictions = run_predictor(
        str(locked["family"]), dict(locked["selected_config"]), final_training,
        sequences, holdout_seasons, final_fallback,
    )
    output = {
        "stream": stream,
        "grouping": grouping,
        "definition": (
            "Every displayed question board, including switched-out originals"
            if stream == "board" else
            "Effective prize-ladder sequence; switched-out originals removed"
        ),
        "sequence_boundary": (
            "Logical contestant run, linked across episode continuations"
            if grouping == "contestant" else
            "All Q2+ boards in on-screen order within one episode"
        ),
        "q1_excluded": True,
        "content_deduplication": (
            "Later sequences with at least five shared normalized questions and "
            "question-set Jaccard >= 0.5 are excluded"
        ),
        "duplicate_sequence_exclusions": duplicate_exclusions,
        "tuning_rule": "Fit S03-S07, select configurations on S08 only",
        "holdout_rule": "Refit selected configurations on S03-S08, test S09-S10",
        "tuning_training_sequences": len(tuning_training),
        "final_training_sequences": len(final_training),
        "tuning_baseline_letter": LETTERS[tuning_fallback],
        "holdout_baseline_letter": LETTERS[final_fallback],
        "tuning_target_n": len(target_entries(sequences, tuning_seasons)),
        "holdout_target_n": len(target_entries(sequences, holdout_seasons)),
        "descriptive": sequence_descriptives(sequences),
        "descriptive_including_rebroadcasts": sequence_descriptives(
            raw_sequences, repetitions=99
        ),
        "families": family_results,
        "locked_family_selected_on_s08": locked["family"],
        "locked_config": locked["selected_config"],
        "locked_tuning": locked["tuning"],
        "locked_holdout": locked["holdout"],
    }
    return output, locked_predictions, str(locked["family"])


def chronological_entries(
    rows: list[dict[str, object]], stream: str = "ladder"
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    contestant_sequences = make_sequences(rows, stream, "contestant")
    kept_sequences, exclusions = deduplicate_sequences(contestant_sequences)
    kept_ids = {
        int(entry["row_id"])
        for sequence in kept_sequences for entry in sequence["entries"]
    }
    entries = []
    for row in rows:
        if int(row["season"]) < 3 or int(row["question_number"]) <= 1:
            continue
        if stream == "ladder" and not int(row["is_ladder_effective"]):
            continue
        if int(row["row_id"]) not in kept_ids:
            continue
        entries.append({
            "row": row,
            "row_id": int(row["row_id"]),
            "letter": LETTER_TO_INDEX[str(row["correct_answer"])],
            "position": len(entries),
        })
    return entries, exclusions


def chronological_visualization_entries(
    rows: list[dict[str, object]],
    duplicate_sequence_exclusions: list[dict[str, object]],
) -> list[dict[str, object]]:
    """Build the literal chronology shown in the dashboard, including Q1.

    Predictive sequence tests continue to start at Q2 so the established Q1
    placement rule cannot inflate their results.  The literal grid is a
    descriptive view, however, so it should show the complete effective ladder.
    """
    excluded_run_ids = {
        str(exclusion["excluded_sequence_id"])
        for exclusion in duplicate_sequence_exclusions
    }
    entries = []
    for row in rows:
        if int(row["season"]) < 3 or int(row["question_number"]) < 1:
            continue
        if not int(row["is_ladder_effective"]):
            continue
        if str(row["logical_run_id"]) in excluded_run_ids:
            continue
        entries.append({
            "row": row,
            "row_id": int(row["row_id"]),
            "letter": LETTER_TO_INDEX[str(row["correct_answer"])],
            "position": len(entries),
        })
    return entries


def majority_value(values: np.ndarray) -> int:
    counts = np.bincount(values, minlength=4)
    return int(max(range(4), key=lambda index: (counts[index], -index)))


def paired_array_metrics(
    actual: np.ndarray, predicted: np.ndarray, fallback: int
) -> dict[str, object]:
    correct = predicted == actual
    baseline_correct = actual == fallback
    differences = correct.astype(float) - baseline_correct.astype(float)
    wins = int(np.sum(correct & ~baseline_correct))
    losses = int(np.sum(~correct & baseline_correct))
    standard_error = (
        float(np.std(differences, ddof=1) / math.sqrt(len(differences)))
        if len(differences) > 1 else 0.0
    )
    delta = float(differences.mean()) if len(differences) else 0.0
    signal = predicted != fallback
    return {
        "n": int(len(actual)),
        "accuracy": float(correct.mean()) if len(correct) else 0.0,
        "baseline_letter": LETTERS[fallback],
        "baseline_accuracy": float(baseline_correct.mean()) if len(actual) else 0.0,
        "delta": delta,
        "delta_ci_low": delta - 1.96 * standard_error,
        "delta_ci_high": delta + 1.96 * standard_error,
        "wins_vs_baseline": wins,
        "losses_vs_baseline": losses,
        "paired_p_value": float(
            binomtest(wins, wins + losses, 0.5).pvalue
            if wins + losses else 1.0
        ),
        "signal_n": int(signal.sum()),
        "signal_accuracy": (
            float(np.mean(predicted[signal] == actual[signal]))
            if signal.any() else None
        ),
    }


def probability_log_loss(actual: np.ndarray, probabilities: np.ndarray) -> float:
    selected = probabilities[np.arange(len(actual)), actual]
    return float(-np.mean(np.log(np.clip(selected, 1e-12, 1.0))))


def chronological_history_features(values: np.ndarray, max_lag: int) -> np.ndarray:
    """Create only backward-looking sequence features for each chronological row."""
    count = len(values)
    lag_features = np.zeros((count, max_lag * 4), dtype=np.float32)
    for lag in range(1, max_lag + 1):
        rows = np.arange(lag, count)
        lag_features[rows, (lag - 1) * 4 + values[:-lag]] = 1.0

    one_hot = np.eye(4, dtype=np.float32)[values]
    cumulative = np.vstack([
        np.zeros((1, 4), dtype=np.float32), np.cumsum(one_hot, axis=0)
    ])
    indexes = np.arange(count)
    aggregates = []
    for window in (4, 8, 16, 32, 64, 128):
        if window > max_lag:
            continue
        starts = np.maximum(0, indexes - window)
        prior_counts = cumulative[indexes] - cumulative[starts]
        denominators = np.maximum(1, indexes - starts)[:, None]
        aggregates.append(prior_counts / denominators)

    gaps = np.ones((count, 4), dtype=np.float32)
    last_seen = np.full(4, -1, dtype=int)
    streak = np.zeros((count, 1), dtype=np.float32)
    trailing = 0
    for index, value in enumerate(values):
        for letter in range(4):
            if last_seen[letter] >= 0:
                gaps[index, letter] = min(index - last_seen[letter], max_lag) / max_lag
        if index:
            trailing = trailing + 1 if index > 1 and values[index - 1] == values[index - 2] else 1
            streak[index, 0] = min(trailing, max_lag) / max_lag
        last_seen[value] = index
    return np.hstack([lag_features, *aggregates, gaps, streak])


def tune_long_history_models(
    entries: list[dict[str, object]]
) -> dict[str, object]:
    values = np.array([int(entry["letter"]) for entry in entries], dtype=int)
    seasons = np.array([int(entry["row"]["season"]) for entry in entries], dtype=int)
    fit_mask = seasons <= 7
    tuning_mask = seasons == 8
    final_fit_mask = seasons <= 8
    holdout_mask = seasons >= 9
    tuning_fallback = majority_value(values[fit_mask])
    holdout_fallback = majority_value(values[final_fit_mask])
    feature_cache = {
        lag: chronological_history_features(values, lag)
        for lag in (8, 16, 32, 64, 128)
    }

    logistic_candidates = []
    for lag, features in feature_cache.items():
        for regularization in (0.01, 0.05, 0.2, 1.0, 5.0):
            model = LogisticRegression(
                C=regularization, max_iter=800, solver="lbfgs", random_state=20260715
            )
            model.fit(features[fit_mask], values[fit_mask])
            prediction = model.predict(features[tuning_mask])
            probabilities = model.predict_proba(features[tuning_mask])
            metrics = paired_array_metrics(
                values[tuning_mask], prediction, tuning_fallback
            )
            logistic_candidates.append({
                "config": {"max_lag": lag, "C": regularization},
                **metrics,
                "log_loss": probability_log_loss(values[tuning_mask], probabilities),
                "feature_count": int(features.shape[1]),
            })
    selected_logistic = max(
        logistic_candidates,
        key=lambda item: (
            float(item["accuracy"]), -float(item["log_loss"]),
            -int(item["config"]["max_lag"]), -float(item["config"]["C"]),
        ),
    )
    logistic_features = feature_cache[int(selected_logistic["config"]["max_lag"])]
    logistic_model = LogisticRegression(
        C=float(selected_logistic["config"]["C"]), max_iter=800,
        solver="lbfgs", random_state=20260715,
    )
    logistic_model.fit(logistic_features[final_fit_mask], values[final_fit_mask])
    logistic_prediction = logistic_model.predict(logistic_features[holdout_mask])
    logistic_probabilities = logistic_model.predict_proba(logistic_features[holdout_mask])
    logistic_holdout = paired_array_metrics(
        values[holdout_mask], logistic_prediction, holdout_fallback
    )
    logistic_holdout["log_loss"] = probability_log_loss(
        values[holdout_mask], logistic_probabilities
    )

    tree_candidates = []
    for lag in (16, 32, 64, 128):
        features = feature_cache[lag]
        for depth in (6, 12, None):
            for minimum_leaf in (5, 15):
                model = ExtraTreesClassifier(
                    n_estimators=160, max_depth=depth,
                    min_samples_leaf=minimum_leaf, max_features="sqrt",
                    random_state=20260715, n_jobs=-1,
                )
                model.fit(features[fit_mask], values[fit_mask])
                prediction = model.predict(features[tuning_mask])
                probabilities = model.predict_proba(features[tuning_mask])
                metrics = paired_array_metrics(
                    values[tuning_mask], prediction, tuning_fallback
                )
                tree_candidates.append({
                    "config": {
                        "max_lag": lag, "max_depth": depth,
                        "min_samples_leaf": minimum_leaf,
                    },
                    **metrics,
                    "log_loss": probability_log_loss(values[tuning_mask], probabilities),
                    "feature_count": int(features.shape[1]),
                })
    selected_tree = max(
        tree_candidates,
        key=lambda item: (
            float(item["accuracy"]), -float(item["log_loss"]),
            -int(item["config"]["max_lag"]),
        ),
    )
    tree_features = feature_cache[int(selected_tree["config"]["max_lag"])]
    tree_model = ExtraTreesClassifier(
        n_estimators=320, max_depth=selected_tree["config"]["max_depth"],
        min_samples_leaf=int(selected_tree["config"]["min_samples_leaf"]),
        max_features="sqrt", random_state=20260715, n_jobs=-1,
    )
    tree_model.fit(tree_features[final_fit_mask], values[final_fit_mask])
    tree_prediction = tree_model.predict(tree_features[holdout_mask])
    tree_probabilities = tree_model.predict_proba(tree_features[holdout_mask])
    tree_holdout = paired_array_metrics(
        values[holdout_mask], tree_prediction, holdout_fallback
    )
    tree_holdout["log_loss"] = probability_log_loss(
        values[holdout_mask], tree_probabilities
    )

    return {
        "feature_definition": (
            "One-hot lags, trailing-letter proportions at 4-128 questions, "
            "letter recency gaps, and repeat streak; no season or episode identifiers"
        ),
        "logistic": {
            "configurations_tested": len(logistic_candidates),
            "selected_config": selected_logistic["config"],
            "tuning": {key: value for key, value in selected_logistic.items() if key != "config"},
            "holdout": logistic_holdout,
            "top_tuning_configurations": sorted(
                logistic_candidates, key=lambda item: float(item["accuracy"]), reverse=True
            )[:10],
        },
        "extra_trees": {
            "configurations_tested": len(tree_candidates),
            "selected_config": selected_tree["config"],
            "tuning": {key: value for key, value in selected_tree.items() if key != "config"},
            "holdout": tree_holdout,
            "top_tuning_configurations": sorted(
                tree_candidates, key=lambda item: float(item["accuracy"]), reverse=True
            )[:10],
        },
    }


def build_context_counts(values: np.ndarray, max_order: int) -> list[defaultdict]:
    counts = [defaultdict(Counter) for _ in range(max_order + 1)]
    history: list[int] = []
    for value in values:
        for order in range(min(max_order, len(history)) + 1):
            context = tuple(history[-order:]) if order else ()
            counts[order][context][int(value)] += 1
        history.append(int(value))
    return counts


def adaptive_backoff_predictions(
    training: np.ndarray, evaluation: np.ndarray, max_order: int,
    minimum_support: int, alpha: float, fallback: int,
) -> tuple[np.ndarray, np.ndarray]:
    counts = build_context_counts(training, max_order)
    history = [int(value) for value in training]
    priors = (np.bincount(training, minlength=4).astype(float) + 1.0)
    priors /= priors.sum()
    predictions = []
    probabilities = []
    for actual in evaluation:
        selected = Counter()
        for order in range(min(max_order, len(history)), -1, -1):
            context = tuple(history[-order:]) if order else ()
            candidate = counts[order].get(context, Counter())
            if sum(candidate.values()) >= minimum_support or order == 0:
                selected = candidate
                break
        vector = np.array([selected[index] for index in range(4)], dtype=float)
        vector = (vector + alpha * priors) / (vector.sum() + alpha)
        maximum = float(vector.max())
        candidates = np.flatnonzero(np.isclose(vector, maximum)).tolist()
        predictions.append(fallback if fallback in candidates else int(candidates[0]))
        probabilities.append(vector)
        for order in range(min(max_order, len(history)) + 1):
            context = tuple(history[-order:]) if order else ()
            counts[order][context][int(actual)] += 1
        history.append(int(actual))
    return np.array(predictions, dtype=int), np.array(probabilities, dtype=float)


def tune_adaptive_backoff(entries: list[dict[str, object]]) -> dict[str, object]:
    values = np.array([int(entry["letter"]) for entry in entries], dtype=int)
    seasons = np.array([int(entry["row"]["season"]) for entry in entries], dtype=int)
    fit = values[seasons <= 7]
    tuning = values[seasons == 8]
    final_fit = values[seasons <= 8]
    holdout = values[seasons >= 9]
    tuning_fallback = majority_value(fit)
    holdout_fallback = majority_value(final_fit)
    candidates = []
    for max_order in (4, 8, 12, 16, 24, 32):
        for minimum_support in (1, 2, 4, 8, 16):
            for alpha in (0.25, 1.0, 4.0):
                prediction, probabilities = adaptive_backoff_predictions(
                    fit, tuning, max_order, minimum_support, alpha, tuning_fallback
                )
                metrics = paired_array_metrics(tuning, prediction, tuning_fallback)
                candidates.append({
                    "config": {
                        "max_order": max_order,
                        "minimum_support": minimum_support,
                        "alpha": alpha,
                    },
                    **metrics,
                    "log_loss": probability_log_loss(tuning, probabilities),
                })
    selected = max(
        candidates,
        key=lambda item: (
            float(item["accuracy"]), -float(item["log_loss"]),
            -int(item["config"]["max_order"]),
        ),
    )
    prediction, probabilities = adaptive_backoff_predictions(
        final_fit, holdout, int(selected["config"]["max_order"]),
        int(selected["config"]["minimum_support"]),
        float(selected["config"]["alpha"]), holdout_fallback,
    )
    holdout_metrics = paired_array_metrics(holdout, prediction, holdout_fallback)
    holdout_metrics["log_loss"] = probability_log_loss(holdout, probabilities)
    return {
        "definition": (
            "Online longest-supported suffix with Dirichlet backoff; contexts extend "
            "through order 32 and are updated after each revealed answer"
        ),
        "configurations_tested": len(candidates),
        "selected_config": selected["config"],
        "tuning": {key: value for key, value in selected.items() if key != "config"},
        "holdout": holdout_metrics,
        "top_tuning_configurations": sorted(
            candidates, key=lambda item: float(item["accuracy"]), reverse=True
        )[:10],
    }


def choose_with_fallback(candidates: list[int], fallback: int) -> int:
    return fallback if fallback in candidates else min(candidates)


def balance_predictions(
    values: np.ndarray, target_indexes: np.ndarray, fallback: int,
    config: dict[str, object],
) -> np.ndarray:
    output = []
    family = str(config["family"])
    last_seen = np.full(4, -1, dtype=int)
    if family == "overdue":
        target_set = set(int(index) for index in target_indexes)
        predictions: dict[int, int] = {}
        for index, value in enumerate(values):
            if index in target_set:
                gaps = [index - last_seen[letter] if last_seen[letter] >= 0 else index + 1 for letter in range(4)]
                maximum = max(gaps)
                candidates = [letter for letter, gap in enumerate(gaps) if gap == maximum]
                predictions[index] = choose_with_fallback(candidates, fallback)
            last_seen[int(value)] = index
        return np.array([predictions[int(index)] for index in target_indexes], dtype=int)

    for index in target_indexes:
        if family == "rolling_deficit":
            window = int(config["window"])
            history = values[max(0, int(index) - window):int(index)]
        elif family == "fixed_block_quota":
            block_size = int(config["block_size"])
            phase = int(config["phase"])
            within = (int(index) - phase) % block_size
            history = values[int(index) - within:int(index)]
        else:
            raise ValueError(family)
        counts = np.bincount(history, minlength=4)
        minimum = int(counts.min())
        candidates = [letter for letter in range(4) if counts[letter] == minimum]
        output.append(choose_with_fallback(candidates, fallback))
    return np.array(output, dtype=int)


def tune_balance_rules(entries: list[dict[str, object]]) -> dict[str, object]:
    values = np.array([int(entry["letter"]) for entry in entries], dtype=int)
    seasons = np.array([int(entry["row"]["season"]) for entry in entries], dtype=int)
    tuning_indexes = np.flatnonzero(seasons == 8)
    holdout_indexes = np.flatnonzero(seasons >= 9)
    tuning_fallback = majority_value(values[seasons <= 7])
    holdout_fallback = majority_value(values[seasons <= 8])
    configs = [
        {"family": "rolling_deficit", "window": window}
        for window in (4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64, 96, 128)
    ]
    configs.append({"family": "overdue"})
    for block_size in (4, 8, 12, 16, 20, 24, 32, 40, 48, 64):
        configs.extend(
            {"family": "fixed_block_quota", "block_size": block_size, "phase": phase}
            for phase in range(block_size)
        )
    candidates = []
    for config in configs:
        prediction = balance_predictions(
            values, tuning_indexes, tuning_fallback, config
        )
        candidates.append({
            "config": config,
            **paired_array_metrics(values[tuning_indexes], prediction, tuning_fallback),
        })
    selected = max(
        candidates,
        key=lambda item: (
            float(item["accuracy"]), -len(json.dumps(item["config"], sort_keys=True))
        ),
    )
    holdout_prediction = balance_predictions(
        values, holdout_indexes, holdout_fallback, selected["config"]
    )
    best_by_family = []
    for family in ("rolling_deficit", "overdue", "fixed_block_quota"):
        family_candidates = [
            item for item in candidates if item["config"]["family"] == family
        ]
        best_by_family.append(max(
            family_candidates, key=lambda item: float(item["accuracy"])
        ))
    return {
        "definition": (
            "Adaptive least-used/most-overdue rules and every phase of fixed "
            "4-64-question balanced blocks"
        ),
        "configurations_tested": len(candidates),
        "selected_config": selected["config"],
        "tuning": {key: value for key, value in selected.items() if key != "config"},
        "holdout": paired_array_metrics(
            values[holdout_indexes], holdout_prediction, holdout_fallback
        ),
        "best_tuning_by_family": best_by_family,
        "top_tuning_configurations": sorted(
            candidates, key=lambda item: float(item["accuracy"]), reverse=True
        )[:10],
    }


def recurrence_predictions(
    values: np.ndarray, indexes: np.ndarray, config: dict[str, object]
) -> np.ndarray:
    mapping = np.array(config["encoding"], dtype=int)
    inverse = np.argsort(mapping)
    encoded = mapping[values]
    left = encoded[indexes - int(config["lag_left"])]
    right = encoded[indexes - int(config["lag_right"])]
    operation = str(config["operation"])
    if operation == "sum":
        base = (left + right) % 4
    elif operation == "difference":
        base = (left - right) % 4
    elif operation == "reverse_difference":
        base = (right - left) % 4
    elif operation == "xor":
        base = np.bitwise_xor(left, right)
    else:
        raise ValueError(operation)
    constant = int(config["constant"])
    predicted_encoded = (
        np.bitwise_xor(base, constant)
        if operation == "xor" else (base + constant) % 4
    )
    return inverse[predicted_encoded]


def tune_modular_recurrences(entries: list[dict[str, object]]) -> dict[str, object]:
    values = np.array([int(entry["letter"]) for entry in entries], dtype=int)
    seasons = np.array([int(entry["row"]["season"]) for entry in entries], dtype=int)
    fit_indexes = np.flatnonzero(seasons <= 7)
    tuning_indexes = np.flatnonzero(seasons == 8)
    holdout_indexes = np.flatnonzero(seasons >= 9)
    tuning_fallback = majority_value(values[seasons <= 7])
    holdout_fallback = majority_value(values[seasons <= 8])
    actual = values[tuning_indexes]
    best: dict[str, object] | None = None
    max_lag = 24
    operations = ("sum", "difference", "reverse_difference", "xor")
    configurations_tested = 0
    for encoding in itertools.permutations(range(4)):
        mapping = np.array(encoding, dtype=int)
        inverse = np.argsort(mapping)
        encoded = mapping[values]
        for lag_left in range(1, max_lag + 1):
            left = encoded[tuning_indexes - lag_left]
            for lag_right in range(1, max_lag + 1):
                right = encoded[tuning_indexes - lag_right]
                bases = {
                    "sum": (left + right) % 4,
                    "difference": (left - right) % 4,
                    "reverse_difference": (right - left) % 4,
                    "xor": np.bitwise_xor(left, right),
                }
                for operation in operations:
                    base = bases[operation]
                    encoded_candidates = (
                        np.bitwise_xor(base[:, None], np.arange(4)[None, :])
                        if operation == "xor"
                        else (base[:, None] + np.arange(4)[None, :]) % 4
                    )
                    decoded_candidates = inverse[encoded_candidates]
                    accuracies = np.mean(decoded_candidates == actual[:, None], axis=0)
                    for constant, accuracy in enumerate(accuracies):
                        configurations_tested += 1
                        key = (
                            float(accuracy), -max(lag_left, lag_right),
                            -(lag_left + lag_right), -constant,
                        )
                        if best is None or key > best["selection_key"]:
                            best = {
                                "selection_key": key,
                                "config": {
                                    "encoding": list(encoding),
                                    "lag_left": lag_left,
                                    "lag_right": lag_right,
                                    "operation": operation,
                                    "constant": constant,
                                },
                            }
    assert best is not None
    selected_config = best["config"]
    tuning_prediction = recurrence_predictions(values, tuning_indexes, selected_config)
    fit_indexes = fit_indexes[fit_indexes >= max(
        int(selected_config["lag_left"]), int(selected_config["lag_right"])
    )]
    fit_prediction = recurrence_predictions(values, fit_indexes, selected_config)
    holdout_prediction = recurrence_predictions(values, holdout_indexes, selected_config)
    encoding_label = {
        letter: int(selected_config["encoding"][index])
        for index, letter in enumerate(LETTERS)
    }
    return {
        "definition": (
            "All two-lag sum, difference, reverse-difference, and XOR recurrences "
            "through lag 24 under all 24 A/B/C/D-to-0/1/2/3 encodings"
        ),
        "configurations_tested": configurations_tested,
        "selected_config": {
            **selected_config,
            "encoding_label": encoding_label,
        },
        "fit": paired_array_metrics(
            values[fit_indexes], fit_prediction, tuning_fallback
        ),
        "tuning": paired_array_metrics(
            values[tuning_indexes], tuning_prediction, tuning_fallback
        ),
        "holdout": paired_array_metrics(
            values[holdout_indexes], holdout_prediction, holdout_fallback
        ),
    }


def chronological_visualization(entries: list[dict[str, object]]) -> dict[str, object]:
    boundaries = []
    for season in sorted({int(entry["row"]["season"]) for entry in entries}):
        indexes = [
            index for index, entry in enumerate(entries)
            if int(entry["row"]["season"]) == season
        ]
        season_entries = [entries[index] for index in indexes]
        boundaries.append({
            "season": season,
            "start_index": indexes[0] + 1,
            "end_index": indexes[-1] + 1,
            "count": len(indexes),
            "start_date": str(season_entries[0]["row"]["airing_date"]),
            "end_date": str(season_entries[-1]["row"]["airing_date"]),
        })
    return {
        "definition": "Chronological content-deduplicated effective-ladder Q1+ stream",
        "letters": "".join(LETTERS[int(entry["letter"])] for entry in entries),
        "question_numbers": [
            int(entry["row"]["question_number"]) for entry in entries
        ],
        "q1_count": sum(
            int(entry["row"]["question_number"]) == 1 for entry in entries
        ),
        "wrap_columns": 100,
        "season_boundaries": boundaries,
    }


def advanced_chronological_analysis(
    entries: list[dict[str, object]]
) -> dict[str, object]:
    long_history = tune_long_history_models(entries)
    backoff = tune_adaptive_backoff(entries)
    balance = tune_balance_rules(entries)
    recurrence = tune_modular_recurrences(entries)
    total = (
        int(long_history["logistic"]["configurations_tested"])
        + int(long_history["extra_trees"]["configurations_tested"])
        + int(backoff["configurations_tested"])
        + int(balance["configurations_tested"])
        + int(recurrence["configurations_tested"])
    )
    return {
        "scope": "Uninterrupted Godler-era effective-ladder Q2+ chronology",
        "tuning_rule": "Fit S03-S07 where applicable; select configurations on S08",
        "holdout_rule": "Lock/refit through S08, then test S09-S10",
        "total_configurations_tested": total,
        "long_history_models": long_history,
        "adaptive_backoff": backoff,
        "balance_and_quota": balance,
        "modular_recurrence": recurrence,
    }


def shuffle_chronological(
    entries: list[dict[str, object]], rng: np.random.Generator
) -> np.ndarray:
    values = np.array([int(entry["letter"]) for entry in entries], dtype=int)
    groups: dict[tuple[int, int], list[int]] = defaultdict(list)
    for index, entry in enumerate(entries):
        row = entry["row"]
        groups[(int(row["season"]), int(row["question_number"]))].append(index)
    for indexes in groups.values():
        shuffled = values[indexes].copy()
        rng.shuffle(shuffled)
        values[indexes] = shuffled
    return values


def same_letter_shares_fft(values: np.ndarray, max_lag: int) -> np.ndarray:
    one_hot = np.eye(4, dtype=float)[values]
    fft_size = 1 << (2 * len(values) - 1).bit_length()
    transformed = np.fft.rfft(one_hot, n=fft_size, axis=0)
    correlations = np.fft.irfft(
        transformed * np.conjugate(transformed), n=fft_size, axis=0
    )
    lags = np.arange(1, min(max_lag, len(values) - 1) + 1)
    matches = correlations[lags].sum(axis=1)
    return matches / (len(values) - lags)


def lz78_phrase_count(values: np.ndarray) -> int:
    phrases: set[tuple[int, ...]] = set()
    index = 0
    while index < len(values):
        end = index + 1
        while end <= len(values) and tuple(values[index:end]) in phrases:
            end += 1
        phrases.add(tuple(values[index:min(end, len(values))]))
        index = end
    return len(phrases)


def categorical_spectrum(values: np.ndarray, max_period: int = 1000) -> tuple[np.ndarray, np.ndarray]:
    one_hot = np.eye(4)[values]
    one_hot -= one_hot.mean(axis=0, keepdims=True)
    transformed = np.fft.rfft(one_hot, axis=0)
    power = np.sum(np.abs(transformed) ** 2, axis=1) / len(values)
    frequencies = np.fft.rfftfreq(len(values))
    periods = np.full_like(frequencies, np.inf)
    positive = frequencies > 0
    periods[positive] = 1 / frequencies[positive]
    valid = positive & (periods >= 2) & (periods <= max_period)
    return frequencies[valid], power[valid]


def chronological_descriptives(
    entries: list[dict[str, object]], repetitions: int = 499
) -> dict[str, object]:
    values = np.array([int(entry["letter"]) for entry in entries], dtype=int)
    max_lag = min(512, len(values) - 1)
    lags = np.arange(1, max_lag + 1)
    observed = same_letter_shares_fft(values, max_lag)
    frequencies, spectrum = categorical_spectrum(values)
    observed_compressed_bytes = len(zlib.compress(bytes(values.tolist()), level=9))
    observed_lz_phrases = lz78_phrase_count(values)
    rng = np.random.default_rng(20260713)
    lag_null = np.zeros((repetitions, len(lags)), dtype=float)
    spectrum_null = np.zeros((repetitions, len(spectrum)), dtype=float)
    compressed_null = np.zeros(repetitions, dtype=float)
    lz_null = np.zeros(repetitions, dtype=float)
    for repetition in range(repetitions):
        shuffled = shuffle_chronological(entries, rng)
        lag_null[repetition] = same_letter_shares_fft(shuffled, max_lag)
        _, spectrum_null[repetition] = categorical_spectrum(shuffled)
        compressed_null[repetition] = len(
            zlib.compress(bytes(shuffled.tolist()), level=9)
        )
        lz_null[repetition] = lz78_phrase_count(shuffled)

    lag_p_values = []
    lag_results = []
    for index, lag in enumerate(lags):
        null_values = lag_null[:, index]
        center = float(null_values.mean())
        p_value = float(
            (1 + np.sum(np.abs(null_values - center) >= abs(observed[index] - center)))
            / (repetitions + 1)
        )
        lag_p_values.append(p_value)
        lag_results.append({
            "lag": int(lag),
            "n": int(len(values) - lag),
            "same_share": float(observed[index]),
            "null_mean": center,
            "null_ci_low": float(np.quantile(null_values, 0.025)),
            "null_ci_high": float(np.quantile(null_values, 0.975)),
            "empirical_p_value": p_value,
        })
    for item, q_value in zip(lag_results, benjamini_hochberg(lag_p_values)):
        item["fdr_q_value"] = q_value

    peak_indexes = np.argsort(spectrum)[::-1][:12]
    null_maxima = spectrum_null.max(axis=1)
    peaks = []
    for index in peak_indexes:
        peaks.append({
            "period_questions": float(1 / frequencies[index]),
            "frequency": float(frequencies[index]),
            "power": float(spectrum[index]),
            "pointwise_null_mean": float(spectrum_null[:, index].mean()),
            "pointwise_p_value": float(
                (1 + np.sum(spectrum_null[:, index] >= spectrum[index]))
                / (repetitions + 1)
            ),
            "familywise_p_value": float(
                (1 + np.sum(null_maxima >= spectrum[index])) / (repetitions + 1)
            ),
        })
    return {
        "question_count": len(entries),
        "shuffle_repetitions": repetitions,
        "null_strata": "canonical season and question number",
        "lag_agreement": lag_results,
        "periodogram": {
            "period_range_questions": [2, 1000],
            "top_peaks": peaks,
            "observed_max_power": float(spectrum.max()),
            "null_max_power_mean": float(null_maxima.mean()),
            "global_empirical_p_value": float(
                (1 + np.sum(null_maxima >= spectrum.max())) / (repetitions + 1)
            ),
        },
        "compression": {
            "definition": (
                "zlib level 9 byte length and LZ78 phrase count versus shuffles "
                "preserving season and question number"
            ),
            "observed_compressed_bytes": observed_compressed_bytes,
            "null_compressed_bytes_mean": float(compressed_null.mean()),
            "null_compressed_bytes_ci_low": float(np.quantile(compressed_null, 0.025)),
            "null_compressed_bytes_ci_high": float(np.quantile(compressed_null, 0.975)),
            "compressed_lower_tail_p_value": float(
                (1 + np.sum(compressed_null <= observed_compressed_bytes))
                / (repetitions + 1)
            ),
            "observed_lz78_phrases": observed_lz_phrases,
            "null_lz78_phrases_mean": float(lz_null.mean()),
            "null_lz78_phrases_ci_low": float(np.quantile(lz_null, 0.025)),
            "null_lz78_phrases_ci_high": float(np.quantile(lz_null, 0.975)),
            "lz78_lower_tail_p_value": float(
                (1 + np.sum(lz_null <= observed_lz_phrases)) / (repetitions + 1)
            ),
        },
    }


def chronological_predictive_analysis(
    entries: list[dict[str, object]]
) -> dict[str, object]:
    sequence = {
        "id": "chronological_q2_plus",
        "entries": entries,
        "starts_at_q2": True,
        "has_source_gap": False,
        "reliable_template": True,
    }
    all_sequences = [sequence]
    tuning_training = [{**sequence, "entries": [
        entry for entry in entries if int(entry["row"]["season"]) <= 7
    ]}]
    final_training = [{**sequence, "entries": [
        entry for entry in entries if int(entry["row"]["season"]) <= 8
    ]}]
    tuning_fallback = baseline_letter(tuning_training)
    final_fallback = baseline_letter(final_training)
    tuning_targets = target_entries(all_sequences, {8})
    holdout_targets = target_entries(all_sequences, {9, 10})

    ngram_candidates = []
    for order in range(1, 17):
        for support in (2, 5, 10, 20):
            config = {"order": order, "scope": "global", "min_support": support}
            predictions = predict_ngram(
                tuning_training, all_sequences, {8}, tuning_fallback, config
            )
            ngram_candidates.append({
                "config": config,
                **evaluate_map(predictions, tuning_targets, tuning_fallback),
            })
    selected_ngram = max(
        ngram_candidates,
        key=lambda item: (float(item["accuracy"]), -int(item["config"]["order"])),
    )
    final_ngram_predictions = predict_ngram(
        final_training, all_sequences, {9, 10}, final_fallback,
        selected_ngram["config"],
    )
    final_ngram = evaluate_map(final_ngram_predictions, holdout_targets, final_fallback)

    period_candidates = []
    for period in range(1, 513):
        config = {"period": period, "mode": "adaptive"}
        predictions = predict_periodic(
            tuning_training, all_sequences, {8}, tuning_fallback, config
        )
        period_candidates.append({
            "config": config,
            **evaluate_map(predictions, tuning_targets, tuning_fallback),
        })
    selected_period = max(
        period_candidates,
        key=lambda item: (float(item["accuracy"]), -int(item["config"]["period"])),
    )
    final_period_predictions = predict_periodic(
        final_training, all_sequences, {9, 10}, final_fallback,
        selected_period["config"],
    )
    final_period = evaluate_map(final_period_predictions, holdout_targets, final_fallback)

    rolling_ngram = []
    rolling_period = []
    for evaluation_season in (9, 10):
        rolling_training = [{**sequence, "entries": [
            entry for entry in entries
            if int(entry["row"]["season"]) <= evaluation_season - 1
        ]}]
        rolling_fallback = baseline_letter(rolling_training)
        season_targets = target_entries(all_sequences, {evaluation_season})
        ngram_predictions = predict_ngram(
            rolling_training, all_sequences, {evaluation_season}, rolling_fallback,
            selected_ngram["config"],
        )
        period_predictions = predict_periodic(
            rolling_training, all_sequences, {evaluation_season}, rolling_fallback,
            selected_period["config"],
        )
        rolling_ngram.append({
            "season": evaluation_season,
            "training_through_season": evaluation_season - 1,
            **evaluate_map(ngram_predictions, season_targets, rolling_fallback),
        })
        rolling_period.append({
            "season": evaluation_season,
            "training_through_season": evaluation_season - 1,
            **evaluate_map(period_predictions, season_targets, rolling_fallback),
        })
    return {
        "definition": "One uninterrupted chronological Q2+ effective-ladder stream",
        "tuning_rule": "Fit S03-S07, select on S08",
        "holdout_rule": "Refit through S08, test S09-S10",
        "tuning_target_n": len(tuning_targets),
        "holdout_target_n": len(holdout_targets),
        "tuning_baseline_letter": LETTERS[tuning_fallback],
        "holdout_baseline_letter": LETTERS[final_fallback],
        "ngram": {
            "configurations_tested": len(ngram_candidates),
            "selected_config": selected_ngram["config"],
            "tuning": {key: value for key, value in selected_ngram.items() if key != "config"},
            "holdout": final_ngram,
            "rolling_forward": rolling_ngram,
            "top_tuning_configurations": sorted(
                ngram_candidates, key=lambda item: float(item["accuracy"]), reverse=True
            )[:10],
        },
        "periodic_lag": {
            "periods_tested": 512,
            "selected_period": selected_period["config"]["period"],
            "tuning": {key: value for key, value in selected_period.items() if key != "config"},
            "holdout": final_period,
            "rolling_forward": rolling_period,
            "top_tuning_periods": sorted(
                period_candidates, key=lambda item: float(item["accuracy"]), reverse=True
            )[:10],
        },
    }


def run_long_sequence_analysis(
    rows: list[dict[str, object]]
) -> tuple[dict[str, object], dict[int, dict[str, object]]]:
    contestant_ladder, locked_predictions, _ = run_stream_experiment(
        make_sequences(rows, "ladder", "contestant"), "ladder", "contestant"
    )
    contestant_board, _, _ = run_stream_experiment(
        make_sequences(rows, "board", "contestant"), "board", "contestant"
    )
    episode_ladder, _, _ = run_stream_experiment(
        make_sequences(rows, "ladder", "episode"), "ladder", "episode"
    )
    episode_board, _, _ = run_stream_experiment(
        make_sequences(rows, "board", "episode"), "board", "episode"
    )
    chronological, chronological_exclusions = chronological_entries(rows, "ladder")
    visualization_entries = chronological_visualization_entries(
        rows, chronological_exclusions
    )
    streams = {
        "contestant_ladder": contestant_ladder,
        "contestant_board": contestant_board,
        "episode_ladder": episode_ladder,
        "episode_board": episode_board,
    }
    chronological_descriptive = chronological_descriptives(chronological)
    chronological_predictive = chronological_predictive_analysis(chronological)
    chronological_advanced = advanced_chronological_analysis(chronological)
    chronological_configuration_count = (
        int(chronological_predictive["ngram"]["configurations_tested"])
        + int(chronological_predictive["periodic_lag"]["periods_tested"])
        + int(chronological_advanced["total_configurations_tested"])
    )
    return {
        "scope": "Godler era S03-S10, Q2+ only",
        "logical_run_definition": (
            "Same contestant blocks are linked across the same or next canonical episode; "
            "known source-gap runs are excluded from template evaluation"
        ),
        "post_recording_identifiers_as_features": False,
        "family_definitions": {
            "ngram": "Adaptive exact suffixes of length 1-8, with global or position-specific lookup",
            "initial_prefix": "First 2-8 answers identify an exact historical template at the same offset",
            "nearest_prefix": "First 3-8 answers retrieve Hamming-nearest historical templates",
            "shifted_template": "Initial prefix aligns to any phase of a historical sequence",
            "periodic": "Exact cycles of length 2-10, prefix-locked or adaptive",
            "block_transform": "Repeated blocks transformed by a cyclic rotation or arbitrary letter permutation",
            "latent_template": "Product-categorical mixture with 2-12 hidden templates inferred from an initial prefix",
        },
        "letter_transforms": (
            "Identity, cyclic A/B/C/D rotations, and arbitrary one-to-one letter "
            "permutations represented by canonical equality patterns"
        ),
        "total_tuned_sequence_configurations": sum(
            int(family["configurations_tested"])
            for stream_result in streams.values()
            for family in stream_result["families"]
        ) + chronological_configuration_count,
        "primary_stream": "contestant_ladder",
        "streams": streams,
        "chronological": {
            "duplicate_sequence_exclusions": chronological_exclusions,
            "visualization": chronological_visualization(visualization_entries),
            "descriptive": chronological_descriptive,
            "predictive": chronological_predictive,
            "advanced": chronological_advanced,
        },
    }, locked_predictions
