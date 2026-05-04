#!/usr/bin/env python3
"""
fix_proper_nouns.py — patch known Whisper misreadings of proper nouns across
all SRT files in subtitles/, then regenerate VTT files from the fixed SRT.

Replacements are surgical (case-sensitive where safe, word-boundary regexes
otherwise) so we don't munge legitimate uses of common English words like
"big".
"""
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SUB_DIR = REPO / "subtitles"
SRT2VTT = REPO / "scripts" / "srt_to_vtt.py"
VENV_PY = "/Users/yacine/Documents/Transcribe/.venv-whisperx/bin/python"

REPLACEMENTS = [
    # Misheard speaker name. Always wrong, case-sensitive.
    (re.compile(r"\bJean-Germes\b"), "Jean-Guillaume"),
    # "BIFF" is the conference name. Whisper hears it as "beef" (EN) or "bif" (FR).
    # Only replace contextual matches to avoid clobbering real "big"/"beef" uses.
    (re.compile(r"\bau beef\b", re.IGNORECASE), "au BIFF"),
    (re.compile(r"\bdu beef\b", re.IGNORECASE), "du BIFF"),
    (re.compile(r"\bthe beef\b", re.IGNORECASE), "the BIFF"),
    (re.compile(r"\bat the beef\b", re.IGNORECASE), "at the BIFF"),
    (re.compile(r"\b(le|au) bif\b"), r"\1 BIFF"),
    (re.compile(r"\bdans le bif\b"), "dans le BIFF"),
    (re.compile(r"\bau BIF\b"), "au BIFF"),
    (re.compile(r"\bBIF (\d{4})\b"), r"BIFF \1"),
    (re.compile(r"\bbif (\d{4})\b"), r"BIFF \1"),
]


def fix_file(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    total = 0
    for pat, repl in REPLACEMENTS:
        text, n = pat.subn(repl, text)
        total += n
    if total > 0:
        path.write_text(text, encoding="utf-8")
    return total


def main():
    srts = sorted(SUB_DIR.glob("*.srt"))
    if not srts:
        print(f"no .srt files in {SUB_DIR}", file=sys.stderr)
        sys.exit(1)

    grand_total = 0
    fixed_files = []
    for srt in srts:
        n = fix_file(srt)
        if n > 0:
            fixed_files.append(srt)
            grand_total += n
            print(f"  {srt.name}: {n} fix(es)")

    print(f"total: {grand_total} fix(es) across {len(fixed_files)} file(s)")

    # Regenerate the VTT for every fixed SRT.
    for srt in fixed_files:
        vtt = srt.with_suffix(".vtt")
        subprocess.run([VENV_PY, str(SRT2VTT), str(srt), str(vtt)], check=True)


if __name__ == "__main__":
    main()
