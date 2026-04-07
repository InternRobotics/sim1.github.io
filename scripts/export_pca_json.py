#!/usr/bin/env python3
"""Regenerate Webpage/data/pca_points_3groups.json from pca_points_3groups.npz (run from repo root)."""
import json
import os
import sys

try:
    import numpy as np
except ImportError:
    print("pip install numpy", file=sys.stderr)
    raise

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
NPZ = os.path.join(ROOT, "pca_points_3groups.npz")
OUT = os.path.join(ROOT, "Webpage", "data", "pca_points_3groups.json")

# Sim Generated has many points → subsample for faster page load (≈1/3, fixed RNG).
GEN_FRACTION = 1
GEN_SAMPLE_SEED = 42

# Output labels (fixed for the webpage); NPZ keys may differ (e.g. "Sim Generated Data 1").
LABEL_REAL = "Real Data"
LABEL_TELE = "Sim Teleoperated Data"
LABEL_GEN = "Sim Generated Data"


def _pick_npz_key(keys, predicate):
    """First key in sorted order that satisfies predicate(k)."""
    for k in sorted(keys):
        if predicate(k):
            return k
    return None


def resolve_group_keys(files):
    """
    Fuzzy-match NPZ array names to three groups:
    - real: contains 'real' (case-insensitive), not tele/gen
    - tele: contains 'tele'
    - gen: contains 'gen' (covers 'Generated', 'Sim Generated Data 1', etc.)
    """
    keys = list(files)
    real_k = _pick_npz_key(
        keys,
        lambda k: "real" in k.lower() and "tele" not in k.lower() and "gen" not in k.lower(),
    )
    if real_k is None:
        real_k = _pick_npz_key(keys, lambda k: "real" in k.lower())
    tele_k = _pick_npz_key(keys, lambda k: "tele" in k.lower())
    gen_k = _pick_npz_key(keys, lambda k: "gen" in k.lower())

    missing = []
    if real_k is None:
        missing.append("real")
    if tele_k is None:
        missing.append("tele")
    if gen_k is None:
        missing.append("gen (substring 'gen')")
    if missing:
        raise KeyError(
            f"Could not resolve NPZ keys for: {missing}. Available keys: {keys}"
        )
    if len({real_k, tele_k, gen_k}) < 3:
        raise ValueError(
            f"Resolved keys must be distinct; got real={real_k!r}, tele={tele_k!r}, gen={gen_k!r}"
        )
    return real_k, tele_k, gen_k


def main():
    z = np.load(NPZ, allow_pickle=True)
    rng = np.random.default_rng(GEN_SAMPLE_SEED)

    def maybe_subsample_gen(display_label, arr):
        if "gen" not in display_label.lower():
            return arr
        n = arr.shape[0]
        k = max(1, int(n * GEN_FRACTION))
        idx = rng.choice(n, size=k, replace=False)
        return arr[np.sort(idx)]

    real_k, tele_k, gen_k = resolve_group_keys(z.files)
    groups = [
        (LABEL_REAL, z[real_k]),
        (LABEL_TELE, z[tele_k]),
        (LABEL_GEN, maybe_subsample_gen(LABEL_GEN, z[gen_k])),
    ]
    colors = [
        [0.75, 0.75, 0.78],
        [0.79, 0.68, 0.77],
        [0.50, 0.43, 0.61],
    ]
    hex_colors = ["#bfbfbf", "#caacc5", "#806d9b"]

    out = {"groups": []}
    for (name, arr), rgb, hx in zip(groups, colors, hex_colors):
        assert arr.shape[1] == 3
        pts = np.round(arr.astype(np.float64), 6).tolist()
        out["groups"].append(
            {
                "label": name,
                "color": rgb,
                "colorHex": hx,
                "n": len(pts),
                "points": pts,
            }
        )

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print("Wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
