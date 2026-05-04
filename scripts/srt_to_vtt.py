#!/usr/bin/env python3
"""
srt_to_vtt.py — convert SRT to WebVTT.

WebVTT differs from SRT only by:
- WEBVTT header line at top
- "." instead of "," in millisecond separator
- cue indices are optional (we omit them)
"""
import re
import sys
from pathlib import Path


def main():
    if len(sys.argv) != 3:
        print("usage: srt_to_vtt.py <input.srt> <output.vtt>", file=sys.stderr)
        sys.exit(1)
    src = Path(sys.argv[1]).read_text(encoding="utf-8")

    blocks = re.split(r"\n\s*\n", src.strip())
    out_blocks = ["WEBVTT", ""]

    for block in blocks:
        lines = [l for l in block.splitlines() if l.strip() != ""]
        if len(lines) < 2:
            continue
        # Drop leading numeric index if present.
        if lines[0].strip().isdigit():
            lines = lines[1:]
        if not lines:
            continue
        # Convert timestamp commas to dots.
        lines[0] = lines[0].replace(",", ".")
        out_blocks.append("\n".join(lines))
        out_blocks.append("")

    Path(sys.argv[2]).write_text("\n".join(out_blocks), encoding="utf-8")
    print(f"  wrote {sys.argv[2]}")


if __name__ == "__main__":
    main()
