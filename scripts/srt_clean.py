#!/usr/bin/env python3
"""
srt_clean.py — drop Whisper hallucinations + zero-duration cues from a SRT.

Reads a SRT on argv[1], writes a cleaned SRT to argv[2].

Heuristics:
- drop cues where text is empty or whitespace-only
- drop cues where end <= start (zero/negative duration)
- collapse runs of N identical-text cues to a single cue spanning the run
- drop known Whisper hallucination phrases when they appear in suspicious bursts
  (3+ consecutive identical cues)
- re-number cues sequentially
"""
import re
import sys
from pathlib import Path

TS_RE = re.compile(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})")

# Phrases Whisper hallucinates on silence/applause/music. Compared
# case-insensitively, normalized whitespace.
HALLUCINATION_PHRASES = {
    "thank you.",
    "thanks for watching.",
    "thanks for watching!",
    "thank you for watching.",
    "thank you very much.",
    "you",
    "...",
    ". . .",
    "merci.",
    "merci",
    "merci beaucoup.",
    "sous-titres réalisés par la communauté d'amara.org",
    "sous-titres réalisés par les sourds-malentendants",
    "sous-titres faits par la communauté d'amara.org",
    "sous-titrage st' 501",
    "♪",
    "♪♪",
    "[music]",
    "[musique]",
    "[applause]",
    "[applaudissements]",
}


def parse_ts(s):
    m = TS_RE.match(s)
    if not m:
        return None
    h, mi, se, ms, h2, mi2, se2, ms2 = (int(x) for x in m.groups())
    start = h * 3600 + mi * 60 + se + ms / 1000
    end = h2 * 3600 + mi2 * 60 + se2 + ms2 / 1000
    return start, end


def fmt_ts(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms == 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def parse_srt(text):
    """Return list of (start, end, text) triples."""
    cues = []
    blocks = re.split(r"\n\s*\n", text.strip())
    for block in blocks:
        lines = [l for l in block.splitlines() if l.strip()]
        if len(lines) < 2:
            continue
        # First line might be index, second might be timestamp,
        # OR first line might already be timestamp.
        if TS_RE.match(lines[0]):
            ts_line, text_lines = lines[0], lines[1:]
        elif len(lines) >= 3 and TS_RE.match(lines[1]):
            ts_line, text_lines = lines[1], lines[2:]
        else:
            continue
        ts = parse_ts(ts_line)
        if not ts:
            continue
        cue_text = " ".join(l.strip() for l in text_lines).strip()
        cues.append((ts[0], ts[1], cue_text))
    return cues


def clean_cues(cues):
    """Apply all heuristics. Returns cleaned list of (start, end, text)."""
    out = []

    # Step 1: drop empty + zero-duration.
    for start, end, text in cues:
        if not text or not text.strip():
            continue
        if end - start < 0.05:
            continue
        out.append((start, end, text))

    # Step 2: collapse runs of identical text.
    collapsed = []
    i = 0
    while i < len(out):
        s, e, t = out[i]
        j = i + 1
        while j < len(out) and out[j][2].strip().lower() == t.strip().lower():
            j += 1
        run_len = j - i
        if run_len >= 3 and t.strip().lower() in HALLUCINATION_PHRASES:
            # Hallucination burst — drop entirely.
            i = j
            continue
        elif run_len >= 2:
            # Real repeated phrase — collapse to single cue spanning the run.
            collapsed.append((s, out[j - 1][1], t))
            i = j
            continue
        else:
            collapsed.append((s, e, t))
            i += 1

    # Step 3: drop standalone hallucination phrases that span > 10s
    # (Whisper hallucinates "Thank you." over 30s silences).
    final = []
    for s, e, t in collapsed:
        if t.strip().lower() in HALLUCINATION_PHRASES and (e - s) > 10:
            continue
        final.append((s, e, t))

    return final


def write_srt(cues, path):
    lines = []
    for i, (s, e, t) in enumerate(cues, 1):
        lines.append(str(i))
        lines.append(f"{fmt_ts(s)} --> {fmt_ts(e)}")
        lines.append(t)
        lines.append("")
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def main():
    if len(sys.argv) != 3:
        print("usage: srt_clean.py <input.srt> <output.srt>", file=sys.stderr)
        sys.exit(1)
    src = Path(sys.argv[1]).read_text(encoding="utf-8")
    cues = parse_srt(src)
    cleaned = clean_cues(cues)
    write_srt(cleaned, sys.argv[2])
    dropped = len(cues) - len(cleaned)
    print(f"  in: {len(cues)} cues  out: {len(cleaned)} cues  dropped: {dropped}")


if __name__ == "__main__":
    main()
