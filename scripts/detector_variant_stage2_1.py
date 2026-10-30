"""
StoreGrid NLP Experimental Detector Variant — Stage 2.1 (Policy Severity Floor Ranking)
Talent AP Mega Hackathon 2026 — Problem R5: Voice-of-Store Engine

This module implements an isolated experimental variant of candidate ranking:
Instead of sorting candidates solely by raw z-score, it weights the anomaly signal by
the domain policy severity floor from data/issue_taxonomy.csv:
    rank_score = z * policy_weight
where policy_weight is 2.0 for high policy severity floor issues (food safety, contamination,
cold-chain failure, expired goods, physical safety, staff misconduct) and 1.0 otherwise.

Strictly preserves:
- Zero future-data leakage (temporal cutoff at Monday 00:00:00).
- Max 3 flags per week.
- Evidence validity (>= 2 valid feedback records).
- Deterministic sorting and reproducibility.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import pandas as pd

# Add original detector module
nlp_dir = Path(__file__).resolve().parent.parent / "storegrid-nlp"
sys.path.insert(0, str(nlp_dir))
import detector

FLAG_COLS = detector.FLAG_COLS
PRED_COLS = detector.PRED_COLS
NON_ISSUE = detector.NON_ISSUE


def detect_emerging_incidents_weighted(
    labeled_fb: pd.DataFrame,
    weeks: list[str],
    emit_weeks: list[str],
    tax: pd.DataFrame | None = None,
    names: dict[str, str] | None = None,
    loc_map: dict[str, str] | None = None,
    z_threshold: float = 2.5,
    min_count: int = 2,
    max_flags_per_week: int = 3,
    high_severity_weight: float = 2.0,
) -> pd.DataFrame:
    """
    Detects emerging operational issues using a rolling historical z-score,
    ranking candidates by policy-weighted risk score: z * severity_weight.
    """
    if labeled_fb.empty:
        return pd.DataFrame(columns=FLAG_COLS)

    fb = labeled_fb.copy()
    if "created_at" not in fb.columns:
        return pd.DataFrame(columns=FLAG_COLS)

    # Weekly bucketing: Monday start
    fb["week_start"] = pd.to_datetime(fb["created_at"]).dt.to_period("W-SUN").dt.start_time.dt.strftime("%Y-%m-%d")

    # Attribute store_id (including locality fallback for missing store_ids)
    if loc_map:
        fb["store_id_resolved"] = fb.apply(lambda r: detector.resolve_store_id(r, loc_map), axis=1)
    else:
        fb["store_id_resolved"] = fb["store_id"].dropna().astype(str)

    # Filter to operational issues and resolvable stores only
    issues = fb[(~fb["issue_type_id"].isin(NON_ISSUE)) & fb["store_id_resolved"].notna()].copy()
    if issues.empty:
        return pd.DataFrame(columns=FLAG_COLS)

    # Build weekly count matrix and evidence feedback ID lists
    counts = (
        issues.groupby(["store_id_resolved", "issue_type_id", "week_start"])
        .size()
        .unstack(fill_value=0)
        .reindex(columns=weeks, fill_value=0)
    )

    evidence_groups = issues.groupby(["store_id_resolved", "issue_type_id", "week_start"])["feedback_id"].apply(
        lambda s: ";".join(sorted(dict.fromkeys(str(x) for x in s if str(x).strip())))
    )

    flags: list[dict[str, Any]] = []
    store_names = names or {}

    # Extract policy severity floor lookup
    if tax is not None and "policy_severity_floor" in tax.columns:
        floor_lookup = tax["policy_severity_floor"].to_dict()
    else:
        floor_lookup = {}

    for i, w in enumerate(weeks):
        # Need at least 4 historical weeks before flagging, and week must be in emit list
        if i < 4 or w not in emit_weeks:
            continue

        hist = counts.iloc[:, max(0, i - 8): i]
        cur = counts.iloc[:, i]
        mu = hist.mean(axis=1)
        sd = hist.std(axis=1, ddof=0).clip(lower=1.0)
        z = (cur - mu) / sd

        # Candidate criteria: >= min_count in current week and z >= z_threshold
        cand = z[(cur >= min_count) & (z >= z_threshold)].reset_index()
        if cand.empty:
            continue

        cand.columns = ["store_id", "issue_type_id", "z"]
        cand["store_id"] = cand["store_id"].astype(str)
        cand["name"] = cand["store_id"].map(store_names).fillna(cand["store_id"])

        # Stage 2.1 Alternative Ranking: policy-weighted risk anomaly score
        cand["policy_floor"] = cand["issue_type_id"].map(floor_lookup).fillna("low")
        weights = {"high": high_severity_weight, "medium": 1.2, "low": 1.0}
        cand["rank_score"] = cand["z"] * cand["policy_floor"].map(weights).fillna(1.0)

        # Deterministic sorting: highest rank_score first, ties broken by store name, then issue_type_id
        cand = cand.sort_values(
            ["rank_score", "name", "issue_type_id"],
            ascending=[False, True, True],
            kind="mergesort"
        )

        week_flags_count = 0
        for r in cand.itertuples():
            key = (r.store_id, r.issue_type_id, w)
            ev_str = evidence_groups.get(key, "")
            ev_list = [x.strip() for x in ev_str.split(";") if x.strip()]

            # Enforce evidence rule: must have >= 2 valid feedback records
            if len(ev_list) < 2:
                continue

            flags.append({
                "as_of_week_start": w,
                "store_id": r.store_id,
                "issue_type_id": r.issue_type_id,
                "confidence": round(float(min(1.0, r.z / 10)), 3),
                "evidence_feedback_ids": ";".join(ev_list),
            })
            week_flags_count += 1
            if week_flags_count >= max_flags_per_week:
                break

    return pd.DataFrame(flags, columns=FLAG_COLS)


def run_experiment(
    output_dir: Path,
    high_severity_weight: float = 2.0,
    z_threshold: float = 2.5,
    min_count: int = 2,
) -> Path:
    """Runs the experimental detector variant and outputs submission files to output_dir."""
    fb_path = detector.find_reference_file("feedback.csv", None)
    tax_path = detector.find_reference_file("issue_taxonomy.csv", fb_path)
    cal_path = detector.find_reference_file("week_calendar.csv", fb_path)
    sm_path = detector.find_reference_file("store_master.csv", fb_path)

    tax = pd.read_csv(tax_path).set_index("issue_type_id")
    weeks = pd.read_csv(cal_path)["week_start"].tolist()
    sm = pd.read_csv(sm_path)
    names = dict(zip(sm["store_id"], sm["store_name"]))
    loc_map = detector.extract_localities(sm)

    fb = pd.read_csv(fb_path, dtype={"store_id": str, "feedback_id": str})
    labeled = detector.label_feedback(fb, tax)

    flags = detect_emerging_incidents_weighted(
        labeled,
        weeks=weeks,
        emit_weeks=weeks,
        tax=tax,
        names=names,
        loc_map=loc_map,
        z_threshold=z_threshold,
        min_count=min_count,
        max_flags_per_week=3,
        high_severity_weight=high_severity_weight,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    # We do NOT touch the original submission files! We write directly to output_dir.
    labeled[PRED_COLS].to_csv(output_dir / "R5_predictions.csv", index=False)
    flags[FLAG_COLS].to_csv(output_dir / "R5_emerging_flags.csv", index=False)
    cmd_text = "python storegrid-nlp/detector.py --feedback {feedback} --as-of {asof} --out {out}\n"
    (output_dir / "detector_cmd.txt").write_text(cmd_text, encoding="utf-8")
    return output_dir


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Stage 2.1 Detector Variant Generator")
    ap.add_argument("--out-dir", required=True, help="Directory to save experimental submission")
    ap.add_argument("--weight", type=float, default=2.0, help="High severity weight multiplier")
    ap.add_argument("--z", type=float, default=2.5, help="Z threshold")
    ap.add_argument("--min-count", type=int, default=2, help="Min count")
    args = ap.parse_args()

    out_path = Path(args.out_dir)
    run_experiment(out_path, high_severity_weight=args.weight, z_threshold=args.z, min_count=args.min_count)
    print(f"Generated experimental files in {out_path}")
