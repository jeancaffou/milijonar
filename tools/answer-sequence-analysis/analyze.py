#!/usr/bin/env python3
"""Build feature, statistical, and ML artifacts for the Milijonar catalogue."""

from __future__ import annotations

import csv
import hashlib
import itertools
import json
import math
import re
import statistics
import unicodedata
import warnings
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.stats import binomtest, chi2_contingency, chisquare, spearmanr
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    log_loss,
)
from sklearn.neighbors import NearestNeighbors

from sequence_models import run_long_sequence_analysis


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
QUESTIONS = ROOT / "questions.csv"
CONTESTANTS = ROOT / "contestants.csv"
WORK_DIR = ROOT / "work" / "analysis-output" / "answer-sequences"
FEATURES = WORK_DIR / "features.csv"
RESULTS = ROOT / "src" / "assets" / "data" / "answer-patterns.json"
TOPIC_ASSIGNMENTS = ROOT / "src" / "_data" / "curated" / "question-topic-assignments.json"
TOPIC_CATALOG = ROOT / "src" / "_data" / "generated" / "question-topics.json"
LETTERS = ("A", "B", "C", "D")
LETTER_TO_INDEX = {letter: index for index, letter in enumerate(LETTERS)}
WORD_RE = re.compile(r"[^\W_]+(?:[-'][^\W_]+)*", re.UNICODE)
NUMBER_RE = re.compile(r"^[+-]?[\d.,]+(?:\s*[%xX])?$")
YEAR_RE = re.compile(r"\b(1[0-9]{3}|20[0-9]{2}|2100)\b")

PROSPECTIVE_SCATTER_SPECS = (
    {
        "id": "option-verbosity-similarity",
        "title": "Option verbosity vs shared wording",
        "description": (
            "Longer answer choices tend to reuse more vocabulary across the four options. "
            "That can help text models without identifying a reliable answer position."
        ),
        "x_field": "option_word_mean",
        "y_field": "option_pair_similarity_mean",
        "x_label": "Mean words per option",
        "y_label": "Mean option-pair similarity",
    },
    {
        "id": "prompt-overlap-similarity",
        "title": "Prompt overlap vs shared option wording",
        "description": (
            "Boards whose options echo the question also tend to repeat wording between "
            "options, a plausible source of lexical rather than sequence signal."
        ),
        "x_field": "question_option_overlap_max",
        "y_field": "option_pair_similarity_mean",
        "x_label": "Maximum question-option overlap",
        "y_label": "Mean option-pair similarity",
    },
    {
        "id": "numeric-density-length",
        "title": "Numeric-option count vs option length",
        "description": (
            "Boards with more numeric choices use shorter answer text. This separates a "
            "format effect from any supposed preferred answer letter."
        ),
        "x_field": "numeric_option_count",
        "y_field": "option_char_mean",
        "x_label": "Numeric options on board",
        "y_label": "Mean characters per option",
    },
    {
        "id": "option-scale-spread",
        "title": "Option scale vs length imbalance",
        "description": (
            "Longer answer sets naturally have a wider length range, so raw longest-answer "
            "heuristics need to account for the board's overall text scale."
        ),
        "x_field": "option_char_mean",
        "y_field": "option_char_range",
        "x_label": "Mean characters per option",
        "y_label": "Longest-shortest character gap",
    },
    {
        "id": "verbosity-prompt-overlap",
        "title": "Option verbosity vs prompt overlap",
        "description": (
            "Verbose choices have more opportunities to reuse prompt words. The relationship "
            "is real but does not by itself reveal which option is correct."
        ),
        "x_field": "option_word_mean",
        "y_field": "question_option_overlap_mean",
        "x_label": "Mean words per option",
        "y_label": "Mean question-option overlap",
    },
    {
        "id": "position-option-verbosity",
        "title": "Question position vs option verbosity",
        "description": (
            "Later ladder positions use slightly longer options. The weak slope is useful "
            "context for difficulty features, not a standalone prediction rule."
        ),
        "x_field": "question_number",
        "y_field": "option_word_mean",
        "x_label": "Question position",
        "y_label": "Mean words per option",
    },
)


# These are evidence-backed source discontinuities, not inferred missing rows.
SOURCE_GAPS = {
    (1, 17, "Matej Poklukar"): (1, 2, 3),
    (2, 9, "Goran Abramovic"): (7,),
    (2, 16, "Matej Muraus"): (1,),
    (3, 11, "Uros Canjko"): (6, 7),
    (3, 50, "Irena Kerstein"): (4, 5),
    (3, 51, "Mirko Jagodic"): (1, 2, 3, 4, 5),
    (6, 41, "Nika Kuplenk-Golovic"): (1, 2, 3, 4),
    (9, 34, "Jernej Glavic"): (6,),
}


TOPIC_KEYWORDS = {
    "geography": (
        "drzav", "mesto", "reka", "gora", "jezero", "otok", "morje",
        "celin", "prestolnic", "meji", "nahaja", "pokrajin", "obcin",
    ),
    "history": (
        "stolet", "vojna", "kralj", "cesar", "zgodovin", "rojen", "umrl",
        "dinast", "bitka", "leta", "letu", "predsednik",
    ),
    "sport": (
        "sport", "nogomet", "olimp", "smuc", "kosark", "tekma", "prvak",
        "rekord", "igralec", "turnir", "liga", "smucarsk",
    ),
    "arts_media": (
        "film", "igral", "reziser", "roman", "pesem", "glasb", "slikar",
        "pisatel", "knjig", "opera", "serij", "album", "gledalisc",
    ),
    "science_nature": (
        "kemij", "fizik", "biolog", "zival", "rastlin", "planet", "element",
        "medicin", "telo", "bolezn", "vrsta", "narav", "atom",
    ),
    "language": (
        "besed", "pomeni", "pregovor", "slovnic", "jezik", "izraz", "kratic",
        "imenuje", "pravi", "poimenuj", "crka",
    ),
    "food_drink": (
        "jed", "pijac", "kuh", "vino", "pivo", "sir", "hrana", "sladic",
        "recept", "meso", "sadje", "zelenjav",
    ),
    "politics_society": (
        "zakon", "ustav", "vlada", "parlament", "stranka", "minister",
        "volit", "evropsk unij", "polit", "drzavni zbor",
    ),
    "religion_myth": (
        "bog", "svetnik", "mitolog", "cerkev", "bibl", "grsk", "rimsk",
        "junak", "legenda", "vera",
    ),
    "technology": (
        "racunal", "internet", "telefon", "tehnolog", "program", "splet",
        "aplikacij", "digital", "naprava", "omrez",
    ),
}


def ascii_fold(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()


def normalized_text(value: str) -> str:
    value = ascii_fold(value).lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def words(value: str) -> list[str]:
    return WORD_RE.findall(value)


def parse_prize(value: str) -> int:
    digits = re.sub(r"\D", "", value)
    return int(digits) if digits else 0


def classify_topic(question: str) -> tuple[str, int]:
    text = normalized_text(question)
    scores = {
        topic: sum(text.count(keyword) for keyword in keywords)
        for topic, keywords in TOPIC_KEYWORDS.items()
    }
    topic, score = max(scores.items(), key=lambda item: (item[1], item[0]))
    return (topic, score) if score else ("general", 0)


def interrogative(question: str) -> str:
    text = normalized_text(question)
    phrases = (
        "v kateri", "v katerem", "po katerem", "s katerim", "iz katere",
        "kateri", "katera", "katero", "katerega", "koliko", "kako",
        "zakaj", "kdaj", "kje", "kdo", "kaj", "cigav",
    )
    for phrase in phrases:
        if text.startswith(phrase + " ") or text == phrase:
            return phrase.replace(" ", "_")
    return "other"


def option_shape(value: str) -> dict[str, int]:
    token_list = words(value)
    stripped = value.strip()
    folded = normalized_text(value)
    is_numeric = bool(NUMBER_RE.fullmatch(stripped))
    is_year = bool(YEAR_RE.search(stripped)) and len(token_list) <= 2
    capital_tokens = sum(token[:1].isupper() for token in token_list)
    return {
        "chars": len(stripped),
        "words": len(token_list),
        "digits": sum(char.isdigit() for char in stripped),
        "numeric": int(is_numeric),
        "year": int(is_year),
        "parentheses": int("(" in stripped or ")" in stripped),
        "hyphen": int("-" in stripped),
        "capital_tokens": capital_tokens,
        "negation": int(any(token in folded.split() for token in ("ne", "ni", "nima", "nikoli"))),
        "punctuation": sum(not char.isalnum() and not char.isspace() for char in stripped),
        "starts_upper": int(bool(stripped) and stripped[0].isupper()),
        "ends_digit": int(bool(stripped) and stripped[-1].isdigit()),
    }


def numeric_value(value: str) -> float | None:
    stripped = value.strip().replace(" ", "").replace("%", "")
    if not NUMBER_RE.fullmatch(value.strip()):
        return None
    normalized = stripped.replace(".", "").replace(",", ".")
    normalized = re.sub(r"[xX]$", "", normalized)
    try:
        return float(normalized)
    except ValueError:
        return None


def token_jaccard(left: str, right: str) -> float:
    left_tokens = set(normalized_text(left).split())
    right_tokens = set(normalized_text(right).split())
    union = left_tokens | right_tokens
    return len(left_tokens & right_tokens) / len(union) if union else 0.0


def monotonic_pattern(values: list[float]) -> str:
    if len(values) < 2:
        return "not_applicable"
    if all(left <= right for left, right in zip(values, values[1:])):
        return "ascending"
    if all(left >= right for left, right in zip(values, values[1:])):
        return "descending"
    return "mixed"


def difficulty_band(question_number: int) -> str:
    if question_number <= 5:
        return "early_1_5"
    if question_number <= 10:
        return "middle_6_10"
    return "high_11_plus"


def prize_band(prize: int) -> str:
    if prize <= 300:
        return "to_300"
    if prize <= 1000:
        return "301_1000"
    if prize <= 5000:
        return "1001_5000"
    return "above_5000"


def gap_key(season: int, episode: int, contestant: str) -> tuple[int, int, str]:
    return season, episode, ascii_fold(contestant)


def load_charity_runs() -> set[tuple[int, int, str]]:
    charity = set()
    with CONTESTANTS.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            text = normalized_text(row["notes"])
            if any(marker in text for marker in ("charity", "donation", "dobrodel", "vip")):
                charity.add((int(row["season"]), int(row["episode"]), row["millionaire_contestant"]))
    return charity


def load_questions() -> list[dict[str, str]]:
    with QUESTIONS.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    invalid = sorted({row["correct_answer"] for row in rows if row["correct_answer"].upper() not in LETTERS})
    if invalid:
        raise ValueError(f"Invalid correct-answer labels: {invalid}")
    return rows


def load_reviewed_topics(row_count: int) -> list[dict[str, str]]:
    assignments_payload = json.loads(TOPIC_ASSIGNMENTS.read_text(encoding="utf-8"))
    catalog_payload = json.loads(TOPIC_CATALOG.read_text(encoding="utf-8"))
    source_hash = hashlib.sha256(QUESTIONS.read_bytes()).hexdigest()
    assignments = assignments_payload.get("assignments", [])
    if (
        assignments_payload.get("source_sha256") != source_hash
        or catalog_payload.get("source_sha256") != source_hash
        or assignments_payload.get("question_count") != row_count
        or catalog_payload.get("question_count") != row_count
        or len(assignments) != row_count
        or any(int(item.get("row_index", -1)) != index for index, item in enumerate(assignments))
    ):
        raise ValueError("Reviewed topic assignments do not exactly match questions.csv")
    topic_metadata = {
        str(item["id"]): item for item in catalog_payload.get("topics", [])
    }
    output = []
    for item in assignments:
        topic_id = str(item["topic_id"])
        if topic_id not in topic_metadata:
            raise ValueError(f"Reviewed topic is absent from generated catalogue: {topic_id}")
        output.append({
            "topic_id": topic_id,
            "topic_broad_id": str(topic_metadata[topic_id]["broad_id"]),
            "topic_confidence": str(item["confidence"]),
        })
    return output


def engineer_features(raw_rows: list[dict[str, str]]) -> list[dict[str, object]]:
    charity_runs = load_charity_runs()
    reviewed_topics = load_reviewed_topics(len(raw_rows))
    fingerprints = Counter(normalized_text(row["question"]) for row in raw_rows)
    duplicate_groups = Counter(
        (row["season"], row["episode"], row["contestant_name"], row["question_number"])
        for row in raw_rows
    )
    duplicate_seen: Counter[tuple[str, str, str, str]] = Counter()
    episode_order = {episode: index + 1 for index, episode in enumerate(sorted({
        (int(row["season"]), int(row["episode"])) for row in raw_rows
    }))}

    features: list[dict[str, object]] = []
    current_episode = None
    current_contestant = None
    run_index = 0
    run_row_index = 0
    episode_row_index = 0
    run_prior: list[str] = []
    episode_prior: list[str] = []

    for global_index, row in enumerate(raw_rows, 1):
        season = int(row["season"])
        episode = int(row["episode"])
        episode_key = (season, episode)
        contestant = row["contestant_name"]
        if episode_key != current_episode:
            current_episode = episode_key
            current_contestant = None
            run_index = 0
            episode_row_index = 0
            episode_prior = []
        if contestant != current_contestant:
            current_contestant = contestant
            run_index += 1
            run_row_index = 0
            run_prior = []
        run_row_index += 1
        episode_row_index += 1

        question_number = int(row["question_number"])
        prize = parse_prize(row["prize"])
        target_raw = row["correct_answer"]
        target = target_raw.upper()
        contestant_answer = row["contestant_answer"].upper()
        aired = date.fromisoformat(row["airing_date"])
        notes = normalized_text(row["notes"])
        question = row["question"].strip()
        fingerprint = normalized_text(question)
        reviewed_topic = reviewed_topics[global_index - 1]
        keyword_topic, topic_hits = classify_topic(question)
        q_words = words(question)
        option_values = {letter: row[f"answer_{letter.lower()}"].strip() for letter in LETTERS}
        option_shapes = {letter: option_shape(value) for letter, value in option_values.items()}
        option_lengths = {letter: shape["chars"] for letter, shape in option_shapes.items()}
        option_word_lengths = {letter: shape["words"] for letter, shape in option_shapes.items()}
        option_numeric_values = {letter: numeric_value(value) for letter, value in option_values.items()}
        question_option_overlap = {
            letter: token_jaccard(question, value) for letter, value in option_values.items()
        }
        option_similarity = {
            letter: statistics.mean(
                token_jaccard(value, option_values[other])
                for other in LETTERS if other != letter
            )
            for letter, value in option_values.items()
        }
        pair_similarities = [
            token_jaccard(option_values[left], option_values[right])
            for left_index, left in enumerate(LETTERS)
            for right in LETTERS[left_index + 1:]
        ]
        min_chars = min(option_lengths.values())
        max_chars = max(option_lengths.values())
        min_words = min(option_word_lengths.values())
        max_words = max(option_word_lengths.values())
        char_mean = statistics.mean(option_lengths.values())
        char_std = statistics.pstdev(option_lengths.values())
        word_mean = statistics.mean(option_word_lengths.values())
        word_std = statistics.pstdev(option_word_lengths.values())
        numeric_sequence = [value for value in option_numeric_values.values() if value is not None]
        correct_chars = option_lengths[target]
        correct_words = option_word_lengths[target]
        duplicate_key = (row["season"], row["episode"], contestant, row["question_number"])
        duplicate_seen[duplicate_key] += 1
        pair_size = duplicate_groups[duplicate_key]
        switched_original = "original q" in notes and ("switch" in notes or "zamenjav" in notes)
        switch_replacement = "replacement q" in notes or "replacement question" in notes
        no_stakes = any(marker in notes for marker in (
            "no stakes", "walk away", "takes the money", "took the money",
            "non binding", "did not affect prize", "switched out",
        )) or switched_original
        gap_numbers = SOURCE_GAPS.get(gap_key(season, episode, contestant), ())
        source_gap_before = bool(gap_numbers and question_number > max(gap_numbers))
        run_id = f"S{season:02}E{episode:02}_R{run_index:02}"
        model_text = " ".join(
            [f"Q {question}"] + [f"{letter} {option_values[letter]}" for letter in LETTERS]
        )

        out: dict[str, object] = {
            "row_id": global_index,
            "episode_id": f"S{season:02}E{episode:02}",
            "season": season,
            "episode": episode,
            "canonical_episode_index": episode_order[episode_key],
            "airing_date": aired.isoformat(),
            "year": aired.year,
            "month": aired.month,
            "weekday": aired.strftime("%A"),
            "host_name": row["host_name"],
            "contestant_name": contestant,
            "run_id": run_id,
            "run_index_in_episode": run_index,
            "run_row_index": run_row_index,
            "episode_question_index": episode_row_index,
            "global_question_index": global_index,
            "question_number": question_number,
            "prize_eur": prize,
            "difficulty_band": difficulty_band(question_number),
            "prize_band": prize_band(prize),
            "correct_answer": target,
            "target_was_lowercase": int(target_raw != target),
            "contestant_answer": contestant_answer,
            "contestant_was_correct": int(contestant_answer == target) if contestant_answer else "",
            "is_no_stakes": int(no_stakes),
            "is_switched_original": int(switched_original),
            "is_switch_replacement": int(switch_replacement),
            "switch_pair_size": pair_size,
            "switch_pair_index": duplicate_seen[duplicate_key],
            "is_charity_or_vip": int((season, episode, contestant) in charity_runs),
            "lifeline_count": len([item for item in row["lifelines_used"].split(";") if item.strip()]),
            "is_run_continuation": int(run_row_index == 1 and question_number > 1),
            "known_source_gap_before": int(source_gap_before),
            "known_missing_question_count": len(gap_numbers) if source_gap_before else 0,
            "question": question,
            "question_fingerprint": fingerprint,
            "question_duplicate_count": fingerprints[fingerprint],
            "question_chars": len(question),
            "question_words": len(q_words),
            "question_digits": sum(char.isdigit() for char in question),
            "question_has_quote": int(any(char in question for char in ('"', "'", "`"))),
            "question_has_year": int(bool(YEAR_RE.search(question))),
            "question_has_negation": int(any(token in normalized_text(question).split() for token in ("ne", "ni", "nima", "nikoli"))),
            "interrogative": interrogative(question),
            "topic_hint": reviewed_topic["topic_id"],
            "topic_broad_id": reviewed_topic["topic_broad_id"],
            "topic_confidence": reviewed_topic["topic_confidence"],
            "legacy_keyword_topic_hint": keyword_topic,
            "topic_keyword_hits": topic_hits,
            "option_char_mean": round(char_mean, 4),
            "option_char_std": round(char_std, 4),
            "option_char_range": max_chars - min_chars,
            "option_word_mean": round(word_mean, 4),
            "option_word_std": round(word_std, 4),
            "option_word_range": max_words - min_words,
            "option_char_order": monotonic_pattern(list(option_lengths.values())),
            "option_word_order": monotonic_pattern(list(option_word_lengths.values())),
            "numeric_option_count": len(numeric_sequence),
            "numeric_option_order": (
                monotonic_pattern(numeric_sequence)
                if len(numeric_sequence) == len(LETTERS) else "partial_or_none"
            ),
            "question_option_overlap_mean": round(
                statistics.mean(question_option_overlap.values()), 6
            ),
            "question_option_overlap_max": round(max(question_option_overlap.values()), 6),
            "question_option_overlap_range": round(
                max(question_option_overlap.values()) - min(question_option_overlap.values()), 6
            ),
            "option_pair_similarity_mean": round(statistics.mean(pair_similarities), 6),
            "option_pair_similarity_max": round(max(pair_similarities), 6),
            "longest_option_letters": "".join(letter for letter in LETTERS if option_lengths[letter] == max_chars),
            "shortest_option_letters": "".join(letter for letter in LETTERS if option_lengths[letter] == min_chars),
            "correct_option_chars": correct_chars,
            "correct_option_words": correct_words,
            "correct_is_longest": int(correct_chars == max_chars),
            "correct_is_shortest": int(correct_chars == min_chars),
            "correct_is_wordiest": int(correct_words == max_words),
            "correct_is_briefest": int(correct_words == min_words),
            "correct_length_rank": 1 + sum(length < correct_chars for length in option_lengths.values()),
            "correct_is_numeric": option_shapes[target]["numeric"],
            "correct_is_year": option_shapes[target]["year"],
            "run_prev_1": run_prior[-1] if run_prior else "",
            "run_prev_2": run_prior[-2] if len(run_prior) > 1 else "",
            "episode_prev_1": episode_prior[-1] if episode_prior else "",
            "run_prior_total": len(run_prior),
            "episode_prior_total": len(episode_prior),
            "model_text": model_text,
        }
        for letter in LETTERS:
            out[f"answer_{letter.lower()}"] = option_values[letter]
            for shape_name, value in option_shapes[letter].items():
                out[f"option_{letter.lower()}_{shape_name}"] = value
            out[f"option_{letter.lower()}_char_rank"] = 1 + sum(
                length < option_lengths[letter] for length in option_lengths.values()
            )
            out[f"option_{letter.lower()}_word_rank"] = 1 + sum(
                length < option_word_lengths[letter] for length in option_word_lengths.values()
            )
            out[f"option_{letter.lower()}_char_z"] = round(
                (option_lengths[letter] - char_mean) / char_std if char_std else 0.0, 6
            )
            out[f"option_{letter.lower()}_word_z"] = round(
                (option_word_lengths[letter] - word_mean) / word_std if word_std else 0.0, 6
            )
            out[f"option_{letter.lower()}_question_overlap"] = round(
                question_option_overlap[letter], 6
            )
            out[f"option_{letter.lower()}_mean_similarity"] = round(
                option_similarity[letter], 6
            )
            out[f"option_{letter.lower()}_uniqueness"] = round(
                1.0 - option_similarity[letter], 6
            )
            out[f"option_{letter.lower()}_numeric_value"] = (
                "" if option_numeric_values[letter] is None else option_numeric_values[letter]
            )
            out[f"option_{letter.lower()}_numeric_rank"] = (
                1 + sum(
                    float(value) < float(option_numeric_values[letter])
                    for value in option_numeric_values.values() if value is not None
                )
                if option_numeric_values[letter] is not None
                and len(numeric_sequence) == len(LETTERS) else ""
            )
            out[f"run_prior_{letter.lower()}"] = run_prior.count(letter)
            out[f"episode_prior_{letter.lower()}"] = episode_prior.count(letter)
        features.append(out)
        run_prior.append(target)
        episode_prior.append(target)
    assign_logical_sequences(features)
    return features


def assign_logical_sequences(rows: list[dict[str, object]]) -> None:
    """Link episode-local blocks and derive board/effective-ladder histories."""
    by_physical_run: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        by_physical_run[str(row["run_id"])].append(row)
    blocks = sorted(by_physical_run.values(), key=lambda block: int(block[0]["row_id"]))

    recent_by_contestant: dict[str, list[dict[str, object]]] = defaultdict(list)
    logical_root: dict[str, str] = {}
    linked_from: dict[str, str] = {}
    for block in blocks:
        first = block[0]
        physical_id = str(first["run_id"])
        contestant_key = normalized_text(str(first["contestant_name"]))
        first_question = int(first["question_number"])
        episode_index = int(first["canonical_episode_index"])
        candidate = None
        if first_question > 1:
            for prior in reversed(recent_by_contestant[contestant_key]):
                episode_distance = episode_index - int(prior["episode_index"])
                if episode_distance > 1:
                    break
                if 0 <= episode_distance <= 1 and int(prior["last_question"]) <= first_question:
                    candidate = prior
                    break
        if candidate:
            parent_id = str(candidate["physical_id"])
            logical_root[physical_id] = logical_root[parent_id]
            linked_from[physical_id] = parent_id
        else:
            logical_root[physical_id] = physical_id
        recent_by_contestant[contestant_key].append({
            "physical_id": physical_id,
            "episode_index": episode_index,
            "last_question": max(int(row["question_number"]) for row in block),
        })

    by_logical_run: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        physical_id = str(row["run_id"])
        logical_id = logical_root[physical_id]
        row["logical_run_id"] = logical_id
        row["logical_continuation_link"] = linked_from.get(physical_id, "")
        by_logical_run[logical_id].append(row)

    for logical_rows in by_logical_run.values():
        logical_rows.sort(key=lambda row: int(row["row_id"]))
        by_question: dict[int, list[dict[str, object]]] = defaultdict(list)
        for row in logical_rows:
            by_question[int(row["question_number"])].append(row)
        effective_ids = set()
        for candidates in by_question.values():
            playable = [row for row in candidates if not int(row["is_switched_original"])]
            if playable:
                effective_ids.add(int(playable[-1]["row_id"]))

        board_history: list[str] = []
        ladder_history: list[str] = []
        has_q1 = any(int(row["question_number"]) == 1 for row in logical_rows)
        for row in logical_rows:
            row["logical_run_has_q1"] = int(has_q1)
            row["board_sequence_index"] = len(board_history) + 1
            row["is_ladder_effective"] = int(int(row["row_id"]) in effective_ids)
            row["ladder_sequence_index"] = (
                len(ladder_history) + 1 if int(row["is_ladder_effective"]) else ""
            )
            row["board_prior_total"] = len(board_history)
            row["ladder_prior_total"] = len(ladder_history)
            for lag in range(1, 9):
                row[f"board_prev_{lag}"] = (
                    board_history[-lag] if len(board_history) >= lag else ""
                )
                row[f"ladder_prev_{lag}"] = (
                    ladder_history[-lag] if len(ladder_history) >= lag else ""
                )
            for letter in LETTERS:
                row[f"board_prior_{letter.lower()}"] = board_history.count(letter)
                row[f"ladder_prior_{letter.lower()}"] = ladder_history.count(letter)
            board_history.append(str(row["correct_answer"]))
            if int(row["is_ladder_effective"]):
                ladder_history.append(str(row["correct_answer"]))


def write_csv(rows: list[dict[str, object]]) -> None:
    with FEATURES.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def letter_counts(rows: list[dict[str, object]]) -> dict[str, int]:
    counts = Counter(str(row["correct_answer"]) for row in rows)
    return {letter: counts[letter] for letter in LETTERS}


def distribution(counts: dict[str, int]) -> dict[str, dict[str, float | int]]:
    total = sum(counts.values())
    return {
        letter: {"count": counts[letter], "share": counts[letter] / total if total else 0}
        for letter in LETTERS
    }


def uniformity_test(rows: list[dict[str, object]]) -> dict[str, object]:
    counts = letter_counts(rows)
    test = chisquare([counts[letter] for letter in LETTERS])
    return {
        "n": len(rows),
        "letters": distribution(counts),
        "chi_square": float(test.statistic),
        "p_value": float(test.pvalue),
        "effect_size_v": math.sqrt(float(test.statistic) / len(rows)) if rows else 0,
    }


def grouped_distribution(rows: list[dict[str, object]], field: str) -> list[dict[str, object]]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        grouped[str(row[field])].append(row)

    def sort_key(item: tuple[str, list[dict[str, object]]]) -> tuple[int, object]:
        key = item[0]
        return (0, int(key)) if key.isdigit() else (1, key)

    return [
        {"group": group, "n": len(group_rows), "letters": distribution(letter_counts(group_rows))}
        for group, group_rows in sorted(grouped.items(), key=sort_key)
    ]


def cramers_v(table: np.ndarray, chi2: float) -> float:
    n = table.sum()
    denominator = min(table.shape[0] - 1, table.shape[1] - 1)
    return math.sqrt(chi2 / (n * denominator)) if n and denominator else 0.0


def contingency_test(rows: list[dict[str, object]], field: str) -> dict[str, object]:
    groups = sorted({str(row[field]) for row in rows})
    table = np.array([
        [sum(str(row[field]) == group and row["correct_answer"] == letter for row in rows) for letter in LETTERS]
        for group in groups
    ])
    chi2, p_value, dof, _ = chi2_contingency(table)
    return {
        "field": field,
        "groups": len(groups),
        "chi_square": chi2,
        "degrees_of_freedom": int(dof),
        "p_value": p_value,
        "cramers_v": cramers_v(table, chi2),
    }


def train_letter_priors(rows: list[dict[str, object]]) -> dict[str, float]:
    counts = letter_counts(rows)
    total = sum(counts.values())
    return {letter: counts[letter] / total for letter in LETTERS}


def metadata_dict(row: dict[str, object], mode: str) -> dict[str, float]:
    data: dict[str, float] = {
        f"host={row['host_name']}": 1.0,
        f"question_number={row['question_number']}": 1.0,
        f"difficulty={row['difficulty_band']}": 1.0,
        f"prize_band={row['prize_band']}": 1.0,
        f"run_index={row['run_index_in_episode']}": 1.0,
        "is_switched_original": float(row["is_switched_original"]),
        "is_switch_replacement": float(row["is_switch_replacement"]),
        "is_charity_or_vip": float(row["is_charity_or_vip"]),
    }
    if mode in ("board", "sequence", "lexical"):
        data.update({
            f"topic={row['topic_hint']}": 1.0,
            f"interrogative={row['interrogative']}": 1.0,
            "question_chars": min(float(row["question_chars"]), 220.0) / 220.0,
            "question_words": min(float(row["question_words"]), 35.0) / 35.0,
            "question_digits": min(float(row["question_digits"]), 8.0) / 8.0,
            "question_has_year": float(row["question_has_year"]),
            "question_has_negation": float(row["question_has_negation"]),
            "option_char_mean": float(row["option_char_mean"]) / 40.0,
            "option_char_std": float(row["option_char_std"]) / 25.0,
            "option_char_range": min(float(row["option_char_range"]), 80.0) / 80.0,
            "option_word_mean": float(row["option_word_mean"]) / 8.0,
            "option_word_std": float(row["option_word_std"]) / 5.0,
            "question_option_overlap_mean": float(row["question_option_overlap_mean"]),
            "question_option_overlap_max": float(row["question_option_overlap_max"]),
            "question_option_overlap_range": float(row["question_option_overlap_range"]),
            "option_pair_similarity_mean": float(row["option_pair_similarity_mean"]),
            "option_pair_similarity_max": float(row["option_pair_similarity_max"]),
            f"option_char_order={row['option_char_order']}": 1.0,
            f"option_word_order={row['option_word_order']}": 1.0,
            f"numeric_option_order={row['numeric_option_order']}": 1.0,
            "numeric_option_count": float(row["numeric_option_count"]) / 4.0,
        })
        for letter in LETTERS:
            for shape in (
                "chars", "words", "digits", "numeric", "year", "parentheses",
                "hyphen", "capital_tokens", "negation", "punctuation", "starts_upper",
                "ends_digit", "char_rank", "word_rank", "char_z", "word_z",
                "question_overlap", "mean_similarity", "uniqueness",
            ):
                scale = 40.0 if shape == "chars" else 8.0 if shape in ("words", "digits", "capital_tokens") else 1.0
                data[f"option_{letter}_{shape}"] = float(row[f"option_{letter.lower()}_{shape}"]) / scale
    if mode in ("sequence", "lexical"):
        for lag in range(1, 9):
            data[f"ladder_prev{lag}={row[f'ladder_prev_{lag}'] or 'NONE'}"] = 1.0
        prior_total = max(1.0, float(row["ladder_prior_total"]))
        for letter in LETTERS:
            data[f"ladder_prior_{letter}"] = float(
                row[f"ladder_prior_{letter.lower()}"]
            ) / prior_total
    return data


def confidence_interval(correct: np.ndarray) -> tuple[float, float]:
    n = len(correct)
    p = float(correct.mean()) if n else 0.0
    radius = 1.96 * math.sqrt(max(p * (1 - p), 1e-12) / n) if n else 0.0
    return max(0.0, p - radius), min(1.0, p + radius)


def paired_delta_interval(model_correct: np.ndarray, baseline_correct: np.ndarray) -> tuple[float, float]:
    rng = np.random.default_rng(20260713)
    deltas = model_correct.astype(float) - baseline_correct.astype(float)
    if not len(deltas):
        return 0.0, 0.0
    samples = rng.integers(0, len(deltas), size=(1000, len(deltas)))
    means = deltas[samples].mean(axis=1)
    return tuple(float(value) for value in np.quantile(means, [0.025, 0.975]))


def evaluate_predictions(
    name: str,
    y_true: np.ndarray,
    predictions: np.ndarray,
    probabilities: np.ndarray,
    baseline_predictions: np.ndarray,
    novel_mask: np.ndarray,
    test_rows: list[dict[str, object]],
) -> dict[str, object]:
    correct = predictions == y_true
    baseline_correct = baseline_predictions == y_true
    low, high = confidence_interval(correct)
    delta_low, delta_high = paired_delta_interval(correct, baseline_correct)
    top2 = np.argsort(probabilities, axis=1)[:, -2:]
    top2_accuracy = float(np.mean([target in choices for target, choices in zip(y_true, top2)]))
    brier = float(np.mean(np.sum((probabilities - np.eye(4)[y_true]) ** 2, axis=1)))
    novel_accuracy = float(np.mean(correct[novel_mask])) if novel_mask.any() else None
    question_numbers = np.array([int(row["question_number"]) for row in test_rows])
    q1_mask = question_numbers == 1
    non_q1_mask = ~q1_mask
    by_question_number = []
    for question_number in sorted(set(question_numbers)):
        mask = question_numbers == question_number
        by_question_number.append({
            "question_number": int(question_number),
            "n": int(mask.sum()),
            "accuracy": float(correct[mask].mean()),
            "baseline_accuracy": float(baseline_correct[mask].mean()),
        })
    return {
        "name": name,
        "accuracy": float(accuracy_score(y_true, predictions)),
        "accuracy_ci_low": low,
        "accuracy_ci_high": high,
        "balanced_accuracy": float(balanced_accuracy_score(y_true, predictions)),
        "macro_f1": float(f1_score(y_true, predictions, average="macro")),
        "log_loss": float(log_loss(y_true, probabilities, labels=np.arange(4))),
        "brier_score": brier,
        "top2_accuracy": top2_accuracy,
        "delta_vs_majority": float(correct.mean() - baseline_correct.mean()),
        "delta_ci_low": delta_low,
        "delta_ci_high": delta_high,
        "novel_question_accuracy": novel_accuracy,
        "novel_question_n": int(novel_mask.sum()),
        "q1_accuracy": float(correct[q1_mask].mean()),
        "q1_n": int(q1_mask.sum()),
        "non_q1_accuracy": float(correct[non_q1_mask].mean()),
        "non_q1_n": int(non_q1_mask.sum()),
        "non_q1_delta_vs_majority": float(
            correct[non_q1_mask].mean() - baseline_correct[non_q1_mask].mean()
        ),
        "by_question_number": by_question_number,
        "confusion_matrix": confusion_matrix(y_true, predictions, labels=np.arange(4)).tolist(),
        "predicted_distribution": distribution({
            letter: int(np.sum(predictions == index)) for index, letter in enumerate(LETTERS)
        }),
    }


def fit_logistic(
    train_rows: list[dict[str, object]],
    test_rows: list[dict[str, object]],
    mode: str,
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    vectorizer = DictVectorizer(sparse=True)
    train_matrix = vectorizer.fit_transform([metadata_dict(row, mode) for row in train_rows])
    test_matrix = vectorizer.transform([metadata_dict(row, mode) for row in test_rows])
    text_meta: dict[str, object] = {"feature_count": train_matrix.shape[1]}
    if mode == "lexical":
        tfidf = TfidfVectorizer(
            lowercase=True,
            strip_accents="unicode",
            ngram_range=(1, 2),
            min_df=2,
            max_df=0.995,
            max_features=30000,
            sublinear_tf=True,
        )
        train_text = tfidf.fit_transform(str(row["model_text"]) for row in train_rows)
        test_text = tfidf.transform(str(row["model_text"]) for row in test_rows)
        train_matrix = sparse.hstack([train_matrix, train_text], format="csr")
        test_matrix = sparse.hstack([test_matrix, test_text], format="csr")
        text_meta["tfidf_feature_count"] = train_text.shape[1]
        text_meta["feature_count"] = train_matrix.shape[1]
    y_train = np.array([LETTER_TO_INDEX[str(row["correct_answer"])] for row in train_rows])
    model = LogisticRegression(
        C=0.7 if mode != "lexical" else 1.2,
        max_iter=600,
        solver="lbfgs",
        multi_class="multinomial",
        random_state=20260713,
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model.fit(train_matrix, y_train)
    return model.predict(test_matrix), model.predict_proba(test_matrix), text_meta


def candidate_metadata(row: dict[str, object], letter: str) -> dict[str, float]:
    lower = letter.lower()
    data: dict[str, float] = {
        f"candidate_letter={letter}": 1.0,
        f"candidate={letter}|question_number={row['question_number']}": 1.0,
        f"candidate={letter}|difficulty={row['difficulty_band']}": 1.0,
        f"candidate={letter}|host={row['host_name']}": 1.0,
        f"host={row['host_name']}": 1.0,
        f"question_number={row['question_number']}": 1.0,
        f"difficulty={row['difficulty_band']}": 1.0,
        f"prize_band={row['prize_band']}": 1.0,
        f"topic={row['topic_hint']}": 1.0,
        f"interrogative={row['interrogative']}": 1.0,
        f"option_char_order={row['option_char_order']}": 1.0,
        f"option_word_order={row['option_word_order']}": 1.0,
        f"numeric_option_order={row['numeric_option_order']}": 1.0,
        "question_chars": min(float(row["question_chars"]), 220.0) / 220.0,
        "question_words": min(float(row["question_words"]), 35.0) / 35.0,
        "question_has_year": float(row["question_has_year"]),
        "question_has_negation": float(row["question_has_negation"]),
        "option_char_mean": float(row["option_char_mean"]) / 40.0,
        "option_char_std": float(row["option_char_std"]) / 25.0,
        "option_word_mean": float(row["option_word_mean"]) / 8.0,
        "option_pair_similarity_mean": float(row["option_pair_similarity_mean"]),
        "option_pair_similarity_max": float(row["option_pair_similarity_max"]),
        "numeric_option_count": float(row["numeric_option_count"]) / 4.0,
    }
    scales = {
        "chars": 40.0,
        "words": 8.0,
        "digits": 8.0,
        "capital_tokens": 8.0,
        "punctuation": 5.0,
        "char_rank": 4.0,
        "word_rank": 4.0,
    }
    for feature in (
        "chars", "words", "digits", "numeric", "year", "parentheses", "hyphen",
        "capital_tokens", "negation", "punctuation", "starts_upper", "ends_digit",
        "char_rank", "word_rank", "char_z", "word_z", "question_overlap",
        "mean_similarity", "uniqueness",
    ):
        data[f"candidate_{feature}"] = float(row[f"option_{lower}_{feature}"]) / scales.get(
            feature, 1.0
        )
    numeric_rank = row[f"option_{lower}_numeric_rank"]
    data["candidate_numeric_rank"] = float(numeric_rank) / 4.0 if numeric_rank != "" else 0.0
    data["candidate_has_numeric_rank"] = float(numeric_rank != "")
    return data


def candidate_text(row: dict[str, object], letter: str) -> str:
    others = " ".join(
        str(row[f"answer_{other.lower()}"]) for other in LETTERS if other != letter
    )
    return (
        f"QUESTION {row['question']} CANDIDATE {row[f'answer_{letter.lower()}']} "
        f"OTHER OPTIONS {others}"
    )


def fit_candidate_ranker(
    train_rows: list[dict[str, object]], test_rows: list[dict[str, object]], lexical: bool
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    vectorizer = DictVectorizer(sparse=True)
    train_dicts = [candidate_metadata(row, letter) for row in train_rows for letter in LETTERS]
    test_dicts = [candidate_metadata(row, letter) for row in test_rows for letter in LETTERS]
    train_matrix = vectorizer.fit_transform(train_dicts)
    test_matrix = vectorizer.transform(test_dicts)
    details: dict[str, object] = {
        "formulation": "Four pre-answer candidate rows per question",
        "engineered_feature_count": train_matrix.shape[1],
    }
    if lexical:
        tfidf = TfidfVectorizer(
            lowercase=True,
            strip_accents="unicode",
            ngram_range=(1, 2),
            min_df=2,
            max_df=0.995,
            max_features=45000,
            sublinear_tf=True,
        )
        train_text = tfidf.fit_transform(
            candidate_text(row, letter) for row in train_rows for letter in LETTERS
        )
        test_text = tfidf.transform(
            candidate_text(row, letter) for row in test_rows for letter in LETTERS
        )
        train_matrix = sparse.hstack([train_matrix, train_text], format="csr")
        test_matrix = sparse.hstack([test_matrix, test_text], format="csr")
        details["tfidf_feature_count"] = train_text.shape[1]
    y_train = np.array([
        int(str(row["correct_answer"]) == letter)
        for row in train_rows for letter in LETTERS
    ])
    model = LogisticRegression(
        C=0.55 if not lexical else 0.9,
        max_iter=600,
        solver="lbfgs",
        class_weight="balanced",
        random_state=20260713,
    )
    model.fit(train_matrix, y_train)
    candidate_scores = model.predict_proba(test_matrix)[:, 1].reshape(len(test_rows), 4)
    probabilities = candidate_scores / candidate_scores.sum(axis=1, keepdims=True)
    predictions = np.argmax(probabilities, axis=1)
    details["feature_count"] = train_matrix.shape[1]
    return predictions, probabilities, details


def fit_extra_trees(
    train_rows: list[dict[str, object]], test_rows: list[dict[str, object]]
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    fields = [
        "question_number", "prize_eur", "run_index_in_episode",
        "is_switched_original", "is_switch_replacement", "is_charity_or_vip",
        "question_chars", "question_words", "question_digits", "question_has_year",
        "question_has_negation", "option_char_mean", "option_char_std", "option_char_range",
        "option_word_mean", "option_word_std", "run_prior_total",
    ]
    for letter in LETTERS:
        fields.extend([
            f"option_{letter.lower()}_chars", f"option_{letter.lower()}_words",
            f"option_{letter.lower()}_digits", f"option_{letter.lower()}_numeric",
            f"option_{letter.lower()}_year", f"run_prior_{letter.lower()}",
        ])
    x_train = np.array([[float(row[field]) for field in fields] for row in train_rows])
    x_test = np.array([[float(row[field]) for field in fields] for row in test_rows])
    y_train = np.array([LETTER_TO_INDEX[str(row["correct_answer"])] for row in train_rows])
    model = ExtraTreesClassifier(
        n_estimators=350,
        min_samples_leaf=18,
        max_features=0.7,
        class_weight=None,
        n_jobs=-1,
        random_state=20260713,
    )
    model.fit(x_train, y_train)
    importance = sorted(zip(fields, model.feature_importances_), key=lambda item: item[1], reverse=True)
    meta = {"feature_count": len(fields), "top_features": [
        {"feature": field, "importance": float(value)} for field, value in importance[:12]
    ]}
    return model.predict(x_test), model.predict_proba(x_test), meta


def heuristic_prediction(
    rows: list[dict[str, object]], priors: dict[str, float], strategy: str
) -> np.ndarray:
    predictions = []
    for row in rows:
        if strategy == "longest":
            candidates = list(str(row["longest_option_letters"]))
        elif strategy == "shortest":
            candidates = list(str(row["shortest_option_letters"]))
        elif strategy == "run_deficit":
            counts = {letter: int(row[f"run_prior_{letter.lower()}"]) for letter in LETTERS}
            minimum = min(counts.values())
            candidates = [letter for letter in LETTERS if counts[letter] == minimum]
        else:
            raise ValueError(strategy)
        choice = max(candidates, key=lambda letter: (priors[letter], -LETTER_TO_INDEX[letter]))
        predictions.append(LETTER_TO_INDEX[choice])
    return np.array(predictions)


def engineered_candidate_heuristics(
    test_rows: list[dict[str, object]], fallback_letter: str
) -> list[dict[str, object]]:
    q2_rows = [row for row in test_rows if int(row["question_number"]) > 1]
    strategies = (
        ("highest_question_overlap", "question_overlap", max, False),
        ("lowest_question_overlap", "question_overlap", min, False),
        ("most_unique_option", "uniqueness", max, False),
        ("most_similar_option", "mean_similarity", max, False),
        ("most_punctuation", "punctuation", max, False),
        ("least_punctuation", "punctuation", min, False),
        ("largest_numeric_option", "numeric_value", max, True),
        ("smallest_numeric_option", "numeric_value", min, True),
    )
    output = []
    for name, feature, chooser, numeric_only in strategies:
        predictions = []
        signal = []
        for row in q2_rows:
            values = {}
            for letter in LETTERS:
                value = row[f"option_{letter.lower()}_{feature}"]
                if value == "":
                    continue
                values[letter] = float(value)
            applicable = bool(values) and (not numeric_only or len(values) == 4)
            if not applicable:
                predictions.append(fallback_letter)
                signal.append(False)
                continue
            extreme = chooser(values.values())
            candidates = [letter for letter, value in values.items() if value == extreme]
            predicted = fallback_letter if fallback_letter in candidates else min(candidates)
            predictions.append(predicted)
            signal.append(True)
        actual = np.array([str(row["correct_answer"]) for row in q2_rows])
        predicted_array = np.array(predictions)
        signal_mask = np.array(signal)
        baseline = np.full(len(q2_rows), fallback_letter)
        output.append({
            "name": name,
            "q2_plus_n": len(q2_rows),
            "coverage_n": int(signal_mask.sum()),
            "coverage_share": float(signal_mask.mean()),
            "hybrid_accuracy": float(np.mean(predicted_array == actual)),
            "fallback_accuracy": float(np.mean(baseline == actual)),
            "delta": float(np.mean(predicted_array == actual) - np.mean(baseline == actual)),
            "covered_accuracy": (
                float(np.mean(predicted_array[signal_mask] == actual[signal_mask]))
                if signal_mask.any() else None
            ),
        })
    return output


def one_hot_probabilities(predictions: np.ndarray, smoothing: float = 0.04) -> np.ndarray:
    probabilities = np.full((len(predictions), 4), smoothing / 3)
    probabilities[np.arange(len(predictions)), predictions] = 1 - smoothing
    return probabilities


def position_lookup_predictions(
    train_rows: list[dict[str, object]], test_rows: list[dict[str, object]]
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    global_counts = Counter(str(row["correct_answer"]) for row in train_rows)
    by_position: dict[int, Counter[str]] = defaultdict(Counter)
    for row in train_rows:
        by_position[int(row["question_number"])][str(row["correct_answer"])] += 1
    predictions = []
    probabilities = []
    lookup = {}
    for question_number, counts in sorted(by_position.items()):
        smoothed = {letter: counts[letter] + 1 for letter in LETTERS}
        total = sum(smoothed.values())
        lookup[str(question_number)] = {
            "dominant_letter": max(LETTERS, key=lambda letter: (smoothed[letter], -LETTER_TO_INDEX[letter])),
            "train_n": sum(counts.values()),
            "shares": {letter: smoothed[letter] / total for letter in LETTERS},
        }
    for row in test_rows:
        counts = by_position.get(int(row["question_number"]), global_counts)
        smoothed = np.array([counts[letter] + 1 for letter in LETTERS], dtype=float)
        smoothed /= smoothed.sum()
        probabilities.append(smoothed)
        predictions.append(int(np.argmax(smoothed)))
    return np.array(predictions), np.array(probabilities), {"lookup": lookup}


def modern_two_rule_predictions(
    train_rows: list[dict[str, object]], test_rows: list[dict[str, object]]
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    bands = {
        "q1": [row for row in train_rows if int(row["question_number"]) == 1],
        "q2_plus": [row for row in train_rows if int(row["question_number"]) > 1],
    }
    probabilities_by_band = {}
    dominant_by_band = {}
    for band, band_rows in bands.items():
        counts = letter_counts(band_rows)
        smoothed = np.array([counts[letter] + 1 for letter in LETTERS], dtype=float)
        smoothed /= smoothed.sum()
        probabilities_by_band[band] = smoothed
        dominant_by_band[band] = LETTERS[int(np.argmax(smoothed))]
    predictions = []
    probabilities = []
    for row in test_rows:
        band = "q1" if int(row["question_number"]) == 1 else "q2_plus"
        vector = probabilities_by_band[band]
        probabilities.append(vector)
        predictions.append(int(np.argmax(vector)))
    return np.array(predictions), np.array(probabilities), {
        "train_scope": "S03-S08 (Godler era before holdout)",
        "rules": {
            band: {
                "predicted_letter": dominant_by_band[band],
                "train_n": len(bands[band]),
                "train_shares": {
                    letter: float(probabilities_by_band[band][LETTER_TO_INDEX[letter]])
                    for letter in LETTERS
                },
            }
            for band in ("q1", "q2_plus")
        },
    }


def topic_meta_key(row: dict[str, object], fields: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(str(row[field] or "NONE") for field in fields)


def topic_meta_prior_apply(
    train_rows: list[dict[str, object]],
    evaluation_rows: list[dict[str, object]],
    fields: tuple[str, ...],
    alpha: float,
) -> tuple[np.ndarray, np.ndarray, dict[str, int]]:
    band_counts: dict[str, Counter[str]] = {
        "q1": Counter(),
        "q2_plus": Counter(),
    }
    keyed_counts: dict[tuple[str, tuple[str, ...]], Counter[str]] = defaultdict(Counter)
    for row in train_rows:
        band = "q1" if int(row["question_number"]) == 1 else "q2_plus"
        letter = str(row["correct_answer"])
        band_counts[band][letter] += 1
        keyed_counts[(band, topic_meta_key(row, fields))][letter] += 1

    band_priors = {}
    for band, counts in band_counts.items():
        vector = np.array([counts[letter] + 1 for letter in LETTERS], dtype=float)
        band_priors[band] = vector / vector.sum()

    predictions = []
    probabilities = []
    supported = 0
    support_total = 0
    for row in evaluation_rows:
        band = "q1" if int(row["question_number"]) == 1 else "q2_plus"
        counts = keyed_counts.get((band, topic_meta_key(row, fields)), Counter())
        support = sum(counts.values())
        vector = alpha * band_priors[band] + np.array(
            [counts[letter] for letter in LETTERS], dtype=float
        )
        vector /= vector.sum()
        probabilities.append(vector)
        predictions.append(int(np.argmax(vector)))
        supported += int(support > 0)
        support_total += support
    return (
        np.array(predictions),
        np.array(probabilities),
        {
            "supported_rows": supported,
            "unseen_key_rows": len(evaluation_rows) - supported,
            "mean_training_support": support_total / len(evaluation_rows) if evaluation_rows else 0,
        },
    )


def tuned_topic_meta_predictions(
    modern_rows: list[dict[str, object]],
    test_rows: list[dict[str, object]],
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    configs = (
        ("broad topic", ("topic_broad_id",)),
        ("reviewed topic", ("topic_hint",)),
        ("reviewed topic + difficulty band", ("topic_hint", "difficulty_band")),
        ("reviewed topic + question position", ("topic_hint", "question_number")),
        ("reviewed topic + previous answer", ("topic_hint", "ladder_prev_1")),
        (
            "reviewed topic + question position + previous answer",
            ("topic_hint", "question_number", "ladder_prev_1"),
        ),
    )
    alphas = (2.0, 5.0, 10.0, 20.0, 40.0, 80.0, 160.0)
    tuning_train = [row for row in modern_rows if int(row["season"]) <= 7]
    tuning_rows = [row for row in modern_rows if int(row["season"]) == 8]
    tuning_scores = []
    for label, fields in configs:
        for alpha in alphas:
            predictions, probabilities, support = topic_meta_prior_apply(
                tuning_train, tuning_rows, fields, alpha
            )
            actual = np.array([
                LETTER_TO_INDEX[str(row["correct_answer"])] for row in tuning_rows
            ])
            q2_mask = np.array([int(row["question_number"]) > 1 for row in tuning_rows])
            tuning_scores.append({
                "label": label,
                "fields": fields,
                "alpha": alpha,
                "accuracy": float(np.mean(predictions == actual)),
                "q2_plus_accuracy": float(np.mean(predictions[q2_mask] == actual[q2_mask])),
                "brier_score": float(np.mean(
                    np.sum((probabilities - np.eye(4)[actual]) ** 2, axis=1)
                )),
                **support,
            })
    selected = max(
        tuning_scores,
        key=lambda item: (
            float(item["q2_plus_accuracy"]),
            float(item["accuracy"]),
            -float(item["brier_score"]),
            float(item["alpha"]),
            -len(item["fields"]),
        ),
    )
    final_train = [row for row in modern_rows if int(row["season"]) <= 8]
    predictions, probabilities, support = topic_meta_prior_apply(
        final_train,
        test_rows,
        tuple(selected["fields"]),
        float(selected["alpha"]),
    )
    return predictions, probabilities, {
        "train_scope": "S03-S08; configuration and shrinkage selected on S08 after fitting S03-S07",
        "method": "Reviewed-topic categorical counts shrunk toward separate modern Q1 and Q2+ letter priors",
        "candidate_configuration_count": len(tuning_scores),
        "selected_label": selected["label"],
        "selected_fields": list(selected["fields"]),
        "selected_alpha": selected["alpha"],
        "s08_tuning_accuracy": selected["accuracy"],
        "s08_tuning_q2_plus_accuracy": selected["q2_plus_accuracy"],
        "s08_tuning_brier_score": selected["brier_score"],
        "s08_supported_rows": selected["supported_rows"],
        "holdout_support": support,
        "reviewed_topic_count": len({str(row["topic_hint"]) for row in modern_rows}),
        "broad_topic_count": len({str(row["topic_broad_id"]) for row in modern_rows}),
    }


def repeat_memory_predictions(
    train_rows: list[dict[str, object]], test_rows: list[dict[str, object]]
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    bands = {
        "q1": [row for row in train_rows if int(row["question_number"]) == 1],
        "q2_plus": [row for row in train_rows if int(row["question_number"]) > 1],
    }
    priors: dict[str, np.ndarray] = {}
    for band, band_rows in bands.items():
        counts = letter_counts(band_rows)
        vector = np.array([counts[letter] + 1 for letter in LETTERS], dtype=float)
        priors[band] = vector / vector.sum()

    answer_text_memory: dict[str, Counter[str]] = defaultdict(Counter)
    letter_memory: dict[str, Counter[str]] = defaultdict(Counter)
    for row in train_rows:
        if int(row["question_number"]) == 1:
            continue
        fingerprint = str(row["question_fingerprint"])
        correct_letter = str(row["correct_answer"])
        correct_text = normalized_text(str(row[f"answer_{correct_letter.lower()}"]))
        answer_text_memory[fingerprint][correct_text] += 1
        letter_memory[fingerprint][correct_letter] += 1

    predictions: list[int] = []
    probabilities: list[np.ndarray] = []
    sources: list[str] = []
    for row in test_rows:
        if int(row["question_number"]) == 1:
            vector = priors["q1"].copy()
            source = "q1_prior"
        else:
            vector = priors["q2_plus"].copy()
            fingerprint = str(row["question_fingerprint"])
            current_options = {
                normalized_text(str(row[f"answer_{letter.lower()}"])): letter
                for letter in LETTERS
            }
            matched_letters = Counter()
            for answer_text, count in answer_text_memory.get(fingerprint, {}).items():
                if answer_text in current_options:
                    matched_letters[current_options[answer_text]] += count
            if matched_letters:
                chosen = max(
                    matched_letters,
                    key=lambda letter: (matched_letters[letter], vector[LETTER_TO_INDEX[letter]]),
                )
                confidence = 0.94
                vector *= (1 - confidence) / vector.sum()
                vector[LETTER_TO_INDEX[chosen]] += confidence
                source = "exact_answer_text"
            elif fingerprint in letter_memory:
                counts = letter_memory[fingerprint]
                vector = np.array(
                    [counts[letter] + 4 * vector[LETTER_TO_INDEX[letter]] for letter in LETTERS],
                    dtype=float,
                )
                vector /= vector.sum()
                source = "repeated_question_letter"
            else:
                source = "q2_plus_prior"
        predictions.append(int(np.argmax(vector)))
        probabilities.append(vector)
        sources.append(source)

    source_details = []
    for source in ("q1_prior", "exact_answer_text", "repeated_question_letter", "q2_plus_prior"):
        indexes = [index for index, value in enumerate(sources) if value == source]
        if not indexes:
            continue
        correct = sum(
            LETTERS[predictions[index]] == str(test_rows[index]["correct_answer"])
            for index in indexes
        )
        source_details.append({
            "source": source,
            "n": len(indexes),
            "correct": correct,
            "accuracy": correct / len(indexes),
        })
    return np.array(predictions), np.array(probabilities), {
        "train_scope": "S03-S08 (Godler era before holdout)",
        "method": "D/B era priors with exact repeated-question answer-text matching",
        "memory_question_count": len(answer_text_memory),
        "prediction_sources": source_details,
    }


def nearest_answer_candidates(
    train_rows: list[dict[str, object]], evaluation_rows: list[dict[str, object]]
) -> list[dict[str, object] | None]:
    unique_train: dict[tuple[str, str], dict[str, object]] = {}
    for row in train_rows:
        correct_letter = str(row["correct_answer"])
        correct_text = normalized_text(str(row[f"answer_{correct_letter.lower()}"]))
        unique_train.setdefault((str(row["question_fingerprint"]), correct_text), row)
    candidate_rows = list(unique_train.values())
    vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        min_df=2,
        max_features=60000,
        sublinear_tf=True,
    )
    train_matrix = vectorizer.fit_transform(str(row["question_fingerprint"]) for row in candidate_rows)
    evaluation_matrix = vectorizer.transform(
        str(row["question_fingerprint"]) for row in evaluation_rows
    )
    neighbor_count = min(12, len(candidate_rows))
    neighbors = NearestNeighbors(
        n_neighbors=neighbor_count, metric="cosine", algorithm="brute", n_jobs=-1
    )
    neighbors.fit(train_matrix)
    distances, indexes = neighbors.kneighbors(evaluation_matrix)

    output: list[dict[str, object] | None] = []
    for evaluation_row, row_distances, row_indexes in zip(evaluation_rows, distances, indexes):
        current_options: dict[str, list[str]] = defaultdict(list)
        for letter in LETTERS:
            current_options[normalized_text(str(evaluation_row[f"answer_{letter.lower()}"]))].append(letter)
        match = None
        for distance, index in zip(row_distances, row_indexes):
            candidate = candidate_rows[int(index)]
            correct_letter = str(candidate["correct_answer"])
            correct_text = normalized_text(str(candidate[f"answer_{correct_letter.lower()}"]))
            if correct_text not in current_options:
                continue
            predicted_letter = max(
                current_options[correct_text],
                key=lambda letter: -LETTER_TO_INDEX[letter],
            )
            match = {
                "letter": predicted_letter,
                "similarity": 1 - float(distance),
                "exact_question": int(
                    candidate["question_fingerprint"] == evaluation_row["question_fingerprint"]
                ),
            }
            break
        output.append(match)
    return output


def tuned_nearest_memory_predictions(
    modern_rows: list[dict[str, object]], test_rows: list[dict[str, object]]
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    tuning_train = [
        row for row in modern_rows
        if int(row["season"]) <= 7 and int(row["question_number"]) > 1
    ]
    tuning_rows = [
        row for row in modern_rows
        if int(row["season"]) == 8 and int(row["question_number"]) > 1
    ]
    tuning_candidates = nearest_answer_candidates(tuning_train, tuning_rows)
    fallback_letter = max(
        LETTERS,
        key=lambda letter: sum(str(row["correct_answer"]) == letter for row in tuning_train),
    )
    tuning_baseline_accuracy = (
        sum(str(row["correct_answer"]) == fallback_letter for row in tuning_rows)
        / len(tuning_rows)
    )
    thresholds = [round(value, 2) for value in np.arange(0.60, 1.001, 0.02)]
    tuning_scores = []
    for threshold in thresholds:
        correct = 0
        overrides = 0
        for row, candidate in zip(tuning_rows, tuning_candidates):
            predicted = fallback_letter
            if candidate and float(candidate["similarity"]) >= threshold:
                predicted = str(candidate["letter"])
                overrides += 1
            correct += predicted == str(row["correct_answer"])
        tuning_scores.append({
            "threshold": threshold,
            "accuracy": correct / len(tuning_rows),
            "override_n": overrides,
        })
    selected = max(tuning_scores, key=lambda item: (item["accuracy"], item["threshold"]))

    final_train = [
        row for row in modern_rows
        if int(row["season"]) <= 8 and int(row["question_number"]) > 1
    ]
    test_q2_plus = [row for row in test_rows if int(row["question_number"]) > 1]
    final_candidates = nearest_answer_candidates(final_train, test_q2_plus)
    final_candidate_by_id = {
        int(row["row_id"]): candidate for row, candidate in zip(test_q2_plus, final_candidates)
    }
    modern_predictions, modern_probabilities, _ = modern_two_rule_predictions(
        [row for row in modern_rows if int(row["season"]) <= 8], test_rows
    )
    predictions = modern_predictions.copy()
    probabilities = modern_probabilities.copy()
    sources = []
    threshold = float(selected["threshold"])
    for index, row in enumerate(test_rows):
        if int(row["question_number"]) == 1:
            sources.append("q1_prior")
            continue
        candidate = final_candidate_by_id[int(row["row_id"])]
        if not candidate or float(candidate["similarity"]) < threshold:
            sources.append("q2_plus_prior")
            continue
        predicted = LETTER_TO_INDEX[str(candidate["letter"])]
        predictions[index] = predicted
        confidence = max(0.55, min(0.96, float(candidate["similarity"])))
        vector = probabilities[index] * ((1 - confidence) / probabilities[index].sum())
        vector[predicted] += confidence
        probabilities[index] = vector
        sources.append("exact_answer_text" if int(candidate["exact_question"]) else "near_answer_text")

    source_details = []
    for source in ("q1_prior", "exact_answer_text", "near_answer_text", "q2_plus_prior"):
        indexes = [index for index, value in enumerate(sources) if value == source]
        if not indexes:
            continue
        correct = sum(
            LETTERS[predictions[index]] == str(test_rows[index]["correct_answer"])
            for index in indexes
        )
        source_details.append({
            "source": source,
            "n": len(indexes),
            "correct": correct,
            "accuracy": correct / len(indexes),
        })
    return predictions, probabilities, {
        "train_scope": "S03-S08; similarity threshold selected on S08 after training S03-S07",
        "method": "character n-gram nearest questions whose known correct answer text occurs in the current options",
        "selected_threshold": threshold,
        "s08_tuning_baseline_letter": fallback_letter,
        "s08_tuning_baseline_accuracy": tuning_baseline_accuracy,
        "s08_tuning_accuracy": selected["accuracy"],
        "s08_tuning_override_n": selected["override_n"],
        "prediction_sources": source_details,
    }


def entropy_bits(counts: dict[str, int]) -> float:
    total = sum(counts.values())
    return -sum(
        (count / total) * math.log2(count / total)
        for count in counts.values() if count
    ) if total else 0.0


def question_number_information(rows: list[dict[str, object]]) -> dict[str, float]:
    overall_entropy = entropy_bits(letter_counts(rows))
    grouped: dict[int, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        grouped[int(row["question_number"])].append(row)
    conditional_entropy = sum(
        len(group_rows) / len(rows) * entropy_bits(letter_counts(group_rows))
        for group_rows in grouped.values()
    )
    return {
        "target_entropy_bits": overall_entropy,
        "conditional_entropy_bits": conditional_entropy,
        "mutual_information_bits": overall_entropy - conditional_entropy,
        "entropy_reduction_share": (
            (overall_entropy - conditional_entropy) / overall_entropy if overall_entropy else 0
        ),
    }


def sequence_analysis(rows: list[dict[str, object]]) -> dict[str, object]:
    transitions = np.zeros((4, 4), dtype=int)
    repeat_flags = []
    by_run: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        letter = str(row["correct_answer"])
        by_run[str(row["run_id"])].append(letter)
        previous = str(row["run_prev_1"])
        if previous:
            transitions[LETTER_TO_INDEX[previous], LETTER_TO_INDEX[letter]] += 1
            repeat_flags.append(previous == letter)
    repeat_count = sum(repeat_flags)
    repeat_test = binomtest(repeat_count, len(repeat_flags), 0.25)
    lag_results = []
    for lag in range(1, 6):
        flags = []
        for letters in by_run.values():
            flags.extend(letters[index] == letters[index - lag] for index in range(lag, len(letters)))
        lag_results.append({
            "lag": lag,
            "n": len(flags),
            "same_share": sum(flags) / len(flags) if flags else 0,
        })
    row_normalized = transitions / np.maximum(transitions.sum(axis=1, keepdims=True), 1)
    chi2, p_value, dof, _ = chi2_contingency(transitions)
    return {
        "transition_counts": transitions.tolist(),
        "transition_shares": row_normalized.tolist(),
        "transition_chi_square": chi2,
        "transition_p_value": p_value,
        "transition_cramers_v": cramers_v(transitions, chi2),
        "repeat_n": len(repeat_flags),
        "repeat_count": repeat_count,
        "repeat_share": repeat_count / len(repeat_flags),
        "repeat_expected_share": 0.25,
        "repeat_p_value": repeat_test.pvalue,
        "lag_agreement": lag_results,
    }


def rolling_distributions(rows: list[dict[str, object]], window: int = 250) -> list[dict[str, object]]:
    output = []
    for start in range(0, len(rows), window):
        chunk = rows[start:start + window]
        output.append({
            "start_row": start + 1,
            "end_row": start + len(chunk),
            "start_date": chunk[0]["airing_date"],
            "end_date": chunk[-1]["airing_date"],
            "letters": distribution(letter_counts(chunk)),
        })
    return output


def prospective_scatter_analysis(rows: list[dict[str, object]]) -> dict[str, object]:
    """Summarize pre-answer board-feature relationships for the HTML report."""
    eligible = [
        row for row in rows
        if int(row["question_number"]) > 1 and not int(row["is_switched_original"])
    ]
    fields = sorted({
        str(spec["x_field"]) for spec in PROSPECTIVE_SCATTER_SPECS
    } | {
        str(spec["y_field"]) for spec in PROSPECTIVE_SCATTER_SPECS
    })

    sample_size = min(1200, len(eligible))
    rng = np.random.default_rng(20260717)
    sampled_indices = sorted(
        int(index) for index in rng.choice(len(eligible), sample_size, replace=False)
    )
    points = []
    for index in sampled_indices:
        row = eligible[index]
        point = {
            "row_id": int(row["row_id"]),
            "question_number": int(row["question_number"]),
            "correct_answer": str(row["correct_answer"]),
            "question": str(row["question"]),
        }
        point.update({field: float(row[field]) for field in fields})
        points.append(point)

    charts = []
    for spec in PROSPECTIVE_SCATTER_SPECS:
        x_field = str(spec["x_field"])
        y_field = str(spec["y_field"])
        x = np.asarray([float(row[x_field]) for row in eligible], dtype=float)
        y = np.asarray([float(row[y_field]) for row in eligible], dtype=float)
        pearson = float(np.corrcoef(x, y)[0, 1])
        spearman = float(spearmanr(x, y).statistic)
        slope, intercept = np.polyfit(x, y, 1)
        charts.append({
            **spec,
            "n": len(eligible),
            "pearson_r": pearson,
            "spearman_rho": spearman,
            "trend_slope": float(slope),
            "trend_intercept": float(intercept),
            "x_min": float(np.min(x)),
            "x_max": float(np.max(x)),
            "y_min": float(np.min(y)),
            "y_max": float(np.max(y)),
        })

    return {
        "scope": "S03-S10 Q2+, excluding switched-out original boards",
        "prospective_definition": (
            "Both plotted axes are known from the question and four displayed options before "
            "the correct answer is revealed. Correct letter is used only as point color."
        ),
        "row_count": len(eligible),
        "sample_size": sample_size,
        "sample_method": "Deterministic random sample with seed 20260717; statistics use all rows.",
        "fields": fields,
        "points": points,
        "charts": charts,
    }


def run_analysis(rows: list[dict[str, object]]) -> dict[str, object]:
    train_rows = [row for row in rows if int(row["season"]) <= 8]
    modern_train_rows = [row for row in rows if 3 <= int(row["season"]) <= 8]
    modern_rows = [row for row in rows if int(row["season"]) >= 3]
    test_rows = [row for row in rows if int(row["season"]) >= 9]
    y_test = np.array([LETTER_TO_INDEX[str(row["correct_answer"])] for row in test_rows])
    priors = train_letter_priors(train_rows)
    majority_letter = max(LETTERS, key=lambda letter: priors[letter])
    majority_index = LETTER_TO_INDEX[majority_letter]
    majority_predictions = np.full(len(test_rows), majority_index)
    majority_probabilities = np.tile(np.array([priors[letter] for letter in LETTERS]), (len(test_rows), 1))
    train_fingerprints = {str(row["question_fingerprint"]) for row in train_rows}
    novel_mask = np.array([str(row["question_fingerprint"]) not in train_fingerprints for row in test_rows])
    long_sequence, locked_sequence_predictions = run_long_sequence_analysis(rows)

    model_results = []
    majority_result = evaluate_predictions(
        "Train-frequency majority", y_test, majority_predictions, majority_probabilities,
        majority_predictions, novel_mask, test_rows,
    )
    majority_result["details"] = {"predicted_letter": majority_letter, "train_priors": priors}
    model_results.append(majority_result)

    modern_predictions, modern_probabilities, modern_details = modern_two_rule_predictions(
        modern_train_rows, test_rows
    )
    modern_result = evaluate_predictions(
        "Modern-era Q1/rest rule", y_test, modern_predictions, modern_probabilities,
        majority_predictions, novel_mask, test_rows,
    )
    modern_result["details"] = modern_details
    model_results.append(modern_result)

    sequence_hybrid_predictions = modern_predictions.copy()
    sequence_hybrid_probabilities = modern_probabilities.copy()
    sequence_signal_n = 0
    for index, row in enumerate(test_rows):
        signal = locked_sequence_predictions.get(int(row["row_id"]))
        if signal is None or int(row["question_number"]) == 1:
            continue
        predicted = int(signal["letter"])
        sequence_hybrid_predictions[index] = predicted
        confidence = min(0.78, 0.55 + 0.02 * math.log1p(float(signal["support"])))
        vector = sequence_hybrid_probabilities[index].copy()
        vector *= (1 - confidence) / vector.sum()
        vector[predicted] += confidence
        sequence_hybrid_probabilities[index] = vector
        sequence_signal_n += 1
    sequence_hybrid_result = evaluate_predictions(
        "S08-locked long-sequence hybrid", y_test, sequence_hybrid_predictions,
        sequence_hybrid_probabilities, majority_predictions, novel_mask, test_rows,
    )
    sequence_hybrid_result["details"] = {
        "q1_rule": "Modern-era D prior",
        "q2_plus_fallback": long_sequence["streams"]["contestant_ladder"]["holdout_baseline_letter"],
        "sequence_family": long_sequence["streams"]["contestant_ladder"]["locked_family_selected_on_s08"],
        "sequence_config": long_sequence["streams"]["contestant_ladder"]["locked_config"],
        "sequence_signal_n": sequence_signal_n,
        "selection": "Family and configuration selected on S08 after fitting S03-S07",
    }
    model_results.append(sequence_hybrid_result)

    memory_predictions, memory_probabilities, memory_details = repeat_memory_predictions(
        modern_train_rows, test_rows
    )
    memory_result = evaluate_predictions(
        "Modern rule + repeat memory", y_test, memory_predictions, memory_probabilities,
        majority_predictions, novel_mask, test_rows,
    )
    memory_result["details"] = memory_details
    model_results.append(memory_result)

    nearest_predictions, nearest_probabilities, nearest_details = tuned_nearest_memory_predictions(
        modern_rows, test_rows
    )
    nearest_result = evaluate_predictions(
        "Modern rule + tuned near-repeat memory", y_test, nearest_predictions,
        nearest_probabilities, majority_predictions, novel_mask, test_rows,
    )
    nearest_result["details"] = nearest_details
    model_results.append(nearest_result)

    position_predictions, position_probabilities, position_details = position_lookup_predictions(
        train_rows, test_rows
    )
    position_result = evaluate_predictions(
        "Question-position frequency lookup", y_test, position_predictions,
        position_probabilities, majority_predictions, novel_mask, test_rows,
    )
    position_result["details"] = position_details
    model_results.append(position_result)

    topic_predictions, topic_probabilities, topic_details = tuned_topic_meta_predictions(
        modern_rows, test_rows
    )
    topic_result = evaluate_predictions(
        "Reviewed-topic hierarchical prior", y_test, topic_predictions,
        topic_probabilities, majority_predictions, novel_mask, test_rows,
    )
    topic_result["details"] = topic_details
    model_results.append(topic_result)

    for strategy, label in (
        ("longest", "Longest option heuristic"),
        ("shortest", "Shortest option heuristic"),
        ("run_deficit", "Least-used-in-run heuristic"),
    ):
        predictions = heuristic_prediction(test_rows, priors, strategy)
        result = evaluate_predictions(
            label, y_test, predictions, one_hot_probabilities(predictions),
            majority_predictions, novel_mask, test_rows,
        )
        result["details"] = {"strategy": strategy}
        model_results.append(result)

    for mode, label in (
        ("metadata", "Metadata logistic regression"),
        ("board", "Board-shape logistic regression"),
        ("sequence", "Sequence-aware logistic regression"),
        ("lexical", "Lexical + engineered logistic regression"),
    ):
        predictions, probabilities, details = fit_logistic(train_rows, test_rows, mode)
        result = evaluate_predictions(
            label, y_test, predictions, probabilities, majority_predictions, novel_mask,
            test_rows,
        )
        result["details"] = details | {"mode": mode}
        model_results.append(result)

    for lexical, label in (
        (False, "Multiple-choice candidate ranker"),
        (True, "Lexical multiple-choice ranker"),
    ):
        predictions, probabilities, details = fit_candidate_ranker(
            train_rows, test_rows, lexical
        )
        result = evaluate_predictions(
            label, y_test, predictions, probabilities, majority_predictions, novel_mask,
            test_rows,
        )
        result["details"] = details | {"lexical": lexical}
        model_results.append(result)

    for mode, label in (
        ("board", "Modern-era board-shape logistic regression"),
        ("sequence", "Modern-era sequence-aware logistic regression"),
        ("lexical", "Modern-era lexical + engineered regression"),
    ):
        predictions, probabilities, details = fit_logistic(
            modern_train_rows, test_rows, mode
        )
        result = evaluate_predictions(
            label, y_test, predictions, probabilities, majority_predictions, novel_mask,
            test_rows,
        )
        result["details"] = details | {
            "mode": mode,
            "train_scope": "S03-S08 only; chosen before S09-S10 evaluation",
        }
        model_results.append(result)

    for lexical, label in (
        (False, "Modern-era multiple-choice candidate ranker"),
        (True, "Modern-era lexical multiple-choice ranker"),
    ):
        predictions, probabilities, details = fit_candidate_ranker(
            modern_train_rows, test_rows, lexical
        )
        result = evaluate_predictions(
            label, y_test, predictions, probabilities, majority_predictions, novel_mask,
            test_rows,
        )
        result["details"] = details | {
            "lexical": lexical,
            "train_scope": "S03-S08 only; chosen before S09-S10 evaluation",
        }
        model_results.append(result)

    tree_predictions, tree_probabilities, tree_details = fit_extra_trees(train_rows, test_rows)
    tree_result = evaluate_predictions(
        "Engineered Extra Trees", y_test, tree_predictions, tree_probabilities,
        majority_predictions, novel_mask, test_rows,
    )
    tree_result["details"] = tree_details
    model_results.append(tree_result)

    modern_tree_predictions, modern_tree_probabilities, modern_tree_details = fit_extra_trees(
        modern_train_rows, test_rows
    )
    modern_tree_result = evaluate_predictions(
        "Modern-era engineered Extra Trees", y_test, modern_tree_predictions,
        modern_tree_probabilities, majority_predictions, novel_mask, test_rows,
    )
    modern_tree_result["details"] = modern_tree_details | {
        "train_scope": "S03-S08 only; chosen before S09-S10 evaluation"
    }
    model_results.append(modern_tree_result)

    overall_counts = letter_counts(rows)
    uniform_test = chisquare([overall_counts[letter] for letter in LETTERS])
    n = len(rows)
    uniform_v = math.sqrt(float(uniform_test.statistic) / n)
    played_rows = [row for row in rows if not int(row["is_no_stakes"])]
    non_switch_rows = [row for row in rows if not int(row["is_switched_original"])]
    all_q2_plus_rows = [row for row in rows if int(row["question_number"]) > 1]
    modern_q1_rows = [row for row in modern_rows if int(row["question_number"]) == 1]
    modern_q2_plus_rows = [row for row in modern_rows if int(row["question_number"]) > 1]
    correct_longest = sum(int(row["correct_is_longest"]) for row in rows)
    correct_shortest = sum(int(row["correct_is_shortest"]) for row in rows)
    mixed_numeric_rows = [
        row for row in rows
        if 0 < sum(int(row[f"option_{letter.lower()}_numeric"]) for letter in LETTERS) < 4
    ]

    best_model = max(model_results, key=lambda model: float(model["accuracy"]))
    test_counts = letter_counts(test_rows)
    test_uniform = chisquare([test_counts[letter] for letter in LETTERS])
    majority_significance = binomtest(
        int(np.sum(y_test == majority_index)), len(y_test), 0.25, alternative="greater"
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "questions_path": str(QUESTIONS.relative_to(ROOT)),
            "questions_sha256": hashlib.sha256(QUESTIONS.read_bytes()).hexdigest(),
            "row_count": len(rows),
            "episode_count": len({row["episode_id"] for row in rows}),
            "date_min": min(str(row["airing_date"]) for row in rows),
            "date_max": max(str(row["airing_date"]) for row in rows),
            "lowercase_target_rows": sum(int(row["target_was_lowercase"]) for row in rows),
            "known_source_gap_questions": sum(len(value) for value in SOURCE_GAPS.values()),
            "normalized_duplicate_question_rows": sum(
                count for count in Counter(row["question_fingerprint"] for row in rows).values() if count > 1
            ),
        },
        "filters": {
            "all": len(rows),
            "played_for_stakes": len(played_rows),
            "excluding_switched_originals": len(non_switch_rows),
            "charity_or_vip": sum(int(row["is_charity_or_vip"]) for row in rows),
        },
        "overall": {
            "letters": distribution(overall_counts),
            "uniform_chi_square": float(uniform_test.statistic),
            "uniform_p_value": float(uniform_test.pvalue),
            "uniform_effect_size_v": uniform_v,
            "played_letters": distribution(letter_counts(played_rows)),
            "non_switch_letters": distribution(letter_counts(non_switch_rows)),
            "q2_plus_uniformity": uniformity_test(all_q2_plus_rows),
        },
        "grouped": {
            field: grouped_distribution(rows, field)
            for field in ("season", "question_number", "difficulty_band", "host_name", "weekday", "topic_hint")
        },
        "question_position": {
            **question_number_information(rows),
            "q1_by_season": grouped_distribution(
                [row for row in rows if int(row["question_number"]) == 1], "season"
            ),
        },
        "modern_era": {
            "definition": "S03-S10, Jure Godler era",
            "row_count": len(modern_rows),
            "letters": distribution(letter_counts(modern_rows)),
            "q1_letters": distribution(letter_counts(modern_q1_rows)),
            "q2_plus_letters": distribution(letter_counts(modern_q2_plus_rows)),
            "q2_plus_by_season": grouped_distribution(modern_q2_plus_rows, "season"),
            "by_question_number": grouped_distribution(modern_rows, "question_number"),
            "by_season": grouped_distribution(modern_rows, "season"),
            "q2_plus_uniformity": uniformity_test(modern_q2_plus_rows),
            "q2_plus_question_number_test": contingency_test(
                modern_q2_plus_rows, "question_number"
            ),
            "sequence": sequence_analysis(modern_rows),
            "q2_plus_rolling": rolling_distributions(modern_q2_plus_rows, window=200),
            "training_row_count": len(modern_train_rows),
        },
        "association_tests": [
            contingency_test(rows, field)
            for field in ("season", "question_number", "difficulty_band", "host_name", "weekday", "topic_hint")
        ],
        "topic_forecasting": {
            "assignment_method": (
                "Complete row-by-row GPT semantic review of the Slovenian question "
                "and all four answer options"
            ),
            "specific_topic_count": len({str(row["topic_hint"]) for row in rows}),
            "broad_topic_count": len({str(row["topic_broad_id"]) for row in rows}),
            "confidence_counts": dict(Counter(str(row["topic_confidence"]) for row in rows)),
            "chronological_selection_rule": (
                "Choose topic/meta key and shrinkage on S08 after fitting S03-S07; "
                "refit on S03-S08 and evaluate once on S09-S10"
            ),
            "model": topic_result,
        },
        "sequence": sequence_analysis(rows),
        "long_sequence": long_sequence,
        "option_shape": {
            "correct_is_longest_count": correct_longest,
            "correct_is_longest_share": correct_longest / len(rows),
            "correct_is_shortest_count": correct_shortest,
            "correct_is_shortest_share": correct_shortest / len(rows),
            "mixed_numeric_option_rows": len(mixed_numeric_rows),
            "mixed_numeric_correct_share": (
                sum(int(row["correct_is_numeric"]) for row in mixed_numeric_rows) / len(mixed_numeric_rows)
                if mixed_numeric_rows else 0
            ),
            "holdout_q2_plus_candidate_heuristics": engineered_candidate_heuristics(
                test_rows,
                str(modern_details["rules"]["q2_plus"]["predicted_letter"]),
            ),
        },
        "prospective_scatter": prospective_scatter_analysis(modern_rows),
        "rolling": rolling_distributions(rows),
        "holdout": {
            "rule": "Train S01-S08; test S09-S10",
            "train_n": len(train_rows),
            "test_n": len(test_rows),
            "test_novel_question_n": int(novel_mask.sum()),
            "test_letters": distribution(test_counts),
            "test_uniform_chi_square": float(test_uniform.statistic),
            "test_uniform_p_value": float(test_uniform.pvalue),
            "majority_letter": majority_letter,
            "majority_vs_uniform_p_value": float(majority_significance.pvalue),
            "q2_plus_uniformity": uniformity_test([
                row for row in test_rows if int(row["question_number"]) > 1
            ]),
        },
        "models": model_results,
        "best_model": best_model["name"],
    }


def json_default(value: object) -> object:
    if isinstance(value, np.generic):
        return value.item()
    raise TypeError(type(value).__name__)


def main() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    raw_rows = load_questions()
    feature_rows = engineer_features(raw_rows)
    write_csv(feature_rows)
    results = run_analysis(feature_rows)
    payload = json.dumps(results, ensure_ascii=False, indent=2, default=json_default)
    RESULTS.write_text(payload + "\n", encoding="utf-8")
    print(json.dumps({
        "features": str(FEATURES),
        "results": str(RESULTS),
        "rows": len(feature_rows),
        "best_model": results["best_model"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
