#!/usr/bin/env python3
"""
qc_diff.py — sample random cues from FR + EN SRTs and print them side-by-side
for human QC. Picks evenly-spaced sample points + a few random ones, so we
cover beginning/middle/end and catch isolated issues.
"""
import random
import re
import sys
from pathlib import Path

SUB_DIR = Path("/Users/yacine/Downloads/JG LMS/subtitles")
TS_RE = re.compile(r"(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})")
N_EVENLY_SPACED = 10
N_RANDOM = 5


def parse(path):
    blocks = re.split(r"\n\s*\n", path.read_text(encoding="utf-8").strip())
    cues = {}
    for block in blocks:
        lines = [l for l in block.splitlines() if l.strip()]
        if len(lines) < 3:
            continue
        if not lines[0].strip().isdigit():
            continue
        idx = int(lines[0].strip())
        m = TS_RE.match(lines[1])
        if not m:
            continue
        text = " ".join(l.strip() for l in lines[2:]).strip()
        cues[idx] = (m.group(1), text)
    return cues


def main():
    slugs = sorted({p.stem.rsplit(".", 1)[0] for p in SUB_DIR.glob("*.fr.srt")})
    random.seed(42)
    for slug in slugs:
        fr = parse(SUB_DIR / f"{slug}.fr.srt")
        en = parse(SUB_DIR / f"{slug}.en.srt")
        common = sorted(set(fr.keys()) & set(en.keys()))
        if not common:
            print(f"\n=== {slug}: no overlapping cues ===")
            continue

        evenly = [common[i] for i in range(0, len(common), max(1, len(common) // N_EVENLY_SPACED))][:N_EVENLY_SPACED]
        randos = random.sample(common, min(N_RANDOM, len(common)))
        sample = sorted(set(evenly + randos))

        print(f"\n{'='*70}")
        print(f"{slug}  —  {len(common)} cues total, sampling {len(sample)}")
        print('='*70)
        for idx in sample:
            ts, fr_t = fr[idx]
            _, en_t = en[idx]
            short_ts = ts.split(",")[0]
            print(f"\n#{idx} @{short_ts}")
            print(f"  FR: {fr_t}")
            print(f"  EN: {en_t}")


if __name__ == "__main__":
    main()
