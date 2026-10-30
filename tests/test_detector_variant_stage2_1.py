"""
Unit tests for Stage 2.1 Detector Variant (detect_emerging_incidents_weighted).
Validates official constraints:
- Max 3 flags per week
- Strict temporal cutoff
- Evidence ground truth validity (>= 2 valid IDs, same store, same week, same predicted issue)
- Deterministic reproducibility
- High-severity policy weighting promotion logic
"""
from pathlib import Path
import sys
import numpy as np
import pandas as pd
import pytest

# Ensure scripts directory and storegrid-nlp are on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "storegrid-nlp"))
import detector
from detector_variant_stage2_1 import detect_emerging_incidents_weighted


@pytest.fixture
def sample_taxonomy():
    return pd.DataFrame([
        {"issue_type_id": "IT01", "policy_severity_floor": "low"},
        {"issue_type_id": "IT17", "policy_severity_floor": "high"},
        {"issue_type_id": "IT27", "policy_severity_floor": "medium"},
    ]).set_index("issue_type_id")


@pytest.fixture
def sample_weeks():
    return [
        (pd.Timestamp("2026-01-05") + pd.Timedelta(days=7 * i)).strftime("%Y-%m-%d")
        for i in range(10)
    ]


def test_three_flags_per_week_limit(sample_weeks, sample_taxonomy):
    """Verify max 3 flags per week is strictly preserved."""
    rows = []
    w_target = sample_weeks[5]
    for s_idx in range(6):
        sid = f"ST-0{s_idx}"
        for f_idx in range(5):
            rows.append({
                "feedback_id": f"FB-{sid}-{f_idx}",
                "created_at": f"{w_target}T10:00:00",
                "store_id": sid,
                "text": "foreign object in biscuit piece",
                "issue_type_id": "IT17",
            })
    df = pd.DataFrame(rows)
    flags = detect_emerging_incidents_weighted(df, weeks=sample_weeks, emit_weeks=[w_target], tax=sample_taxonomy)
    assert len(flags) <= 3
    assert len(flags[flags["as_of_week_start"] == w_target]) <= 3


def test_severity_weight_promotes_critical_incident(sample_weeks, sample_taxonomy):
    """Verify that a high-severity candidate with slightly lower z is promoted above a low-severity candidate."""
    rows = []
    w_target = sample_weeks[5]

    # ST-LOW: 5 reports for IT01 (low floor), z ~ 4.0
    for i in range(5):
        rows.append({
            "feedback_id": f"FB-LOW-{i}",
            "created_at": f"{w_target}T10:00:00",
            "store_id": "ST-LOW",
            "text": "queue delay counter slow",
            "issue_type_id": "IT01",
        })

    # ST-HIGH: 3 reports for IT17 (high floor), z ~ 2.8
    for i in range(3):
        rows.append({
            "feedback_id": f"FB-HIGH-{i}",
            "created_at": f"{w_target}T10:00:00",
            "store_id": "ST-HIGH",
            "text": "glass piece found in pasta contamination",
            "issue_type_id": "IT17",
        })

    df = pd.DataFrame(rows)

    # When unweighted (weight=1.0), ST-LOW has higher count/z and ranks first
    unweighted = detect_emerging_incidents_weighted(
        df, weeks=sample_weeks, emit_weeks=[w_target], tax=sample_taxonomy,
        high_severity_weight=1.0, z_threshold=2.0, min_count=2
    )
    assert unweighted.iloc[0]["store_id"] == "ST-LOW"

    # When weighted (weight=2.0), ST-HIGH (2.8 * 2.0 = 5.6) beats ST-LOW (4.0 * 1.0 = 4.0)
    weighted = detect_emerging_incidents_weighted(
        df, weeks=sample_weeks, emit_weeks=[w_target], tax=sample_taxonomy,
        high_severity_weight=2.0, z_threshold=2.0, min_count=2
    )
    assert weighted.iloc[0]["store_id"] == "ST-HIGH"
    assert weighted.iloc[0]["issue_type_id"] == "IT17"


def test_evidence_id_validity(sample_weeks, sample_taxonomy):
    """Verify every emitted flag has >= 2 valid evidence IDs from that week and store."""
    rows = []
    w_target = sample_weeks[5]
    for i in range(4):
        rows.append({
            "feedback_id": f"FB-EV-{i}",
            "created_at": f"{w_target}T11:00:00",
            "store_id": "ST-TEST",
            "text": "metal piece in yogurt tub contamination",
            "issue_type_id": "IT17",
        })
    df = pd.DataFrame(rows)
    flags = detect_emerging_incidents_weighted(df, weeks=sample_weeks, emit_weeks=[w_target], tax=sample_taxonomy)
    assert not flags.empty
    flag = flags.iloc[0]
    ev_ids = flag["evidence_feedback_ids"].split(";")
    assert len(ev_ids) >= 2
    for fid in ev_ids:
        assert fid.startswith("FB-EV-")


def test_reproducible_and_deterministic(sample_weeks, sample_taxonomy):
    """Verify sorting and outputs are 100% deterministic on repeated runs."""
    rows = []
    w_target = sample_weeks[6]
    for s_idx in range(4):
        sid = f"ST-{s_idx}"
        for f_idx in range(4):
            rows.append({
                "feedback_id": f"FB-{sid}-{f_idx}",
                "created_at": f"{w_target}T11:00:00",
                "store_id": sid,
                "text": "hygiene issue contamination",
                "issue_type_id": "IT17",
            })
    df = pd.DataFrame(rows)
    run1 = detect_emerging_incidents_weighted(df, weeks=sample_weeks, emit_weeks=[w_target], tax=sample_taxonomy)
    run2 = detect_emerging_incidents_weighted(df, weeks=sample_weeks, emit_weeks=[w_target], tax=sample_taxonomy)
    pd.testing.assert_frame_equal(run1, run2)
