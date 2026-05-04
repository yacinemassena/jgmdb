#!/usr/bin/env python3
"""
qc_shift_detect.py — heuristic to spot cue-shift bugs where the translator
reorganized meaning across cues. Suspicious patterns:

1. Length mismatch: FR cue is 1-3 words but EN cue is much longer (or vice-versa).
2. EN cue contains a number that doesn't appear in the corresponding FR cue
   but DOES appear in an adjacent FR cue — strong signal that content shifted.

Numbers are the easiest signal because they're invariant under translation
(cardinal numbers and percentages stay as digits).
"""
import re
import sys
from pathlib import Path

SUB_DIR = Path("/Users/yacine/Downloads/JG LMS/subtitles")
TS_RE = re.compile(r"(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})")
NUM_RE = re.compile(r"\b\d+\b")


def parse(path):
    blocks = re.split(r"\n\s*\n", path.read_text(encoding="utf-8").strip())
    cues = {}
    for block in blocks:
        lines = [l for l in block.splitlines() if l.strip()]
        if len(lines) < 3 or not lines[0].strip().isdigit():
            continue
        idx = int(lines[0].strip())
        m = TS_RE.match(lines[1])
        if not m:
            continue
        text = " ".join(l.strip() for l in lines[2:]).strip()
        cues[idx] = (m.group(1), text)
    return cues


def find_number_shifts(fr, en, slug):
    common = sorted(set(fr.keys()) & set(en.keys()))
    issues = []
    for idx in common:
        _, fr_t = fr[idx]
        _, en_t = en[idx]
        en_nums = set(NUM_RE.findall(en_t))
        fr_nums = set(NUM_RE.findall(fr_t))
        # Numbers in EN that aren't in FR are suspicious — but only flag if
        # the number appears in an adjacent FR cue (within ±2), strong shift signal.
        suspicious = en_nums - fr_nums
        for num in suspicious:
            for delta in (-2, -1, 1, 2):
                neighbor = fr.get(idx + delta)
                if neighbor and num in NUM_RE.findall(neighbor[1]):
                    issues.append((idx, delta, num, fr_t, en_t, neighbor[1]))
                    break
    return issues


def main():
    slugs = sorted({p.stem.rsplit(".", 1)[0] for p in SUB_DIR.glob("*.fr.srt")})
    for slug in slugs:
        fr = parse(SUB_DIR / f"{slug}.fr.srt")
        en = parse(SUB_DIR / f"{slug}.en.srt")
        issues = find_number_shifts(fr, en, slug)
        print(f"\n{'='*70}")
        print(f"{slug}: {len(issues)} suspected shifts (number appears in EN but in adjacent FR)")
        print('='*70)
        for idx, delta, num, fr_t, en_t, neighbor_fr in issues[:8]:
            print(f"\n#{idx} (number '{num}' shifted from cue {idx+delta:+d})")
            print(f"  FR (this):     {fr_t}")
            print(f"  FR (neighbor): {neighbor_fr}")
            print(f"  EN (this):     {en_t}")
        if len(issues) > 8:
            print(f"\n  ... and {len(issues) - 8} more")


if __name__ == "__main__":
    main()
