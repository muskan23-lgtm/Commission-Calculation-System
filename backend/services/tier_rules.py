from __future__ import annotations

from typing import Tuple

# Tier thresholds per level (Agent → Director).
TIER_RULES = {
    1: [(0, 25_000, 0.00), (25_000, 50_000, 0.02), (50_000, 100_000, 0.03), (100_000, float("inf"), 0.05)],
    2: [(0, 100_000, 0.00), (100_000, 250_000, 0.03), (250_000, 500_000, 0.05), (500_000, float("inf"), 0.07)],
    3: [(0, 500_000, 0.00), (500_000, 1_000_000, 0.04), (1_000_000, 2_000_000, 0.06), (2_000_000, float("inf"), 0.08)],
    4: [(0, 1_000_000, 0.00), (1_000_000, 3_000_000, 0.05), (3_000_000, 5_000_000, 0.07), (5_000_000, float("inf"), 0.10)],
}


def tier_rate(level: int, volume: float) -> float:
    tiers = TIER_RULES.get(level, TIER_RULES[1])
    for lower, upper, rate in tiers:
        if lower <= volume < upper:
            return rate
    return tiers[-1][2]


def tier_name_and_rate(level: int, volume: float) -> Tuple[str, float]:
    tiers = TIER_RULES.get(level, TIER_RULES[1])
    names = ["Bronze", "Silver", "Gold", "Platinum"]
    for idx, (lower, upper, rate) in enumerate(tiers):
        if lower <= volume < upper:
            return names[idx], rate
    return names[-1], tiers[-1][2]
