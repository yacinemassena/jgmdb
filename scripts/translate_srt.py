#!/usr/bin/env python3
"""
translate_srt.py — translate French SRT to English using gpt-4.1, preserving cue timing.

Input: cleaned French SRT (timestamps + text).
Output: English SRT with identical cue indices and timestamps, only text translated.

Strategy:
- Parse SRT into cues.
- Group into chunks of CHUNK_SIZE cues.
- Send each chunk to gpt-4.1 with structured JSON output: caller passes a JSON
  list of {i, t}, model returns same shape with `t` translated.
- Run chunks in parallel with a thread pool.
- Reassemble in cue-index order; verify no cue lost.
"""
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from openai import OpenAI

MODEL = "gpt-4.1-2025-04-14"
CHUNK_SIZE = 25
MAX_WORKERS = 8
MAX_RETRIES = 3

TS_RE = re.compile(r"(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})")

SYSTEM_PROMPT = """You are a professional French→English subtitle translator working on a real-estate investment training course (marchand-de-biens / property flipping in France).

You will receive a JSON object with a `cues` array. Each entry is `{"i": <int>, "t": "<French text>"}`. The cues are CONSECUTIVE chunks of speech that together form longer sentences — you can READ them as context, but you must TRANSLATE each cue STRICTLY in isolation.

You must return a JSON object with a `translations` array. Each entry must be `{"i": <same int>, "t": "<English text>"}`.

CRITICAL — boundary preservation:
- Translate cue N's text into cue N's translation. NEVER move content from cue N into cue N-1 or N+1, even if it would read more naturally as a redistributed sentence.
- If a digit (e.g. "26", "100", "30%") appears in cue N's source, it MUST appear in cue N's translation — never in a neighbor.
- If a proper noun (Jean-Guillaume, BIFF, Versailles, etc.) appears in cue N's source, it MUST appear in cue N's translation.
- Fragments stay fragments. If cue N is "avec les 70", the translation is "with the 70" — DO NOT pull content from cue N+1 to make it a complete English sentence.
- Subtitles are timed to the exact spoken word — redistributing meaning across cues breaks the sync.

Other rules:
1. Return EXACTLY one translation per input cue, with the same `i` value. Never merge, split, drop, or reorder cues.
2. Translate into natural spoken English. The speaker is informal and energetic; preserve that register.
3. Do NOT translate proper nouns: people's names, place names (Versailles, Miami, BIFF, etc.), brand names.
4. Keep numbers, currency amounts, and percentages exactly as in source (e.g. "200M$" stays "200M$").
5. Each translated `t` should be roughly the same length as the source.
6. Do not invent content. If a cue is a single word, translate it as a single word.
"""


def parse_srt(text):
    """Return list of (idx, start, end, text)."""
    cues = []
    blocks = re.split(r"\n\s*\n", text.strip())
    for block in blocks:
        lines = [l for l in block.splitlines() if l.strip()]
        if len(lines) < 2:
            continue
        if lines[0].strip().isdigit():
            idx = int(lines[0].strip())
            ts_line, text_lines = lines[1], lines[2:]
        else:
            idx = len(cues) + 1
            ts_line, text_lines = lines[0], lines[1:]
        m = TS_RE.match(ts_line)
        if not m:
            continue
        cue_text = " ".join(l.strip() for l in text_lines).strip()
        if cue_text:
            cues.append((idx, m.group(1), m.group(2), cue_text))
    return cues


def write_srt(cues, path):
    lines = []
    for i, (_idx, start, end, text) in enumerate(cues, 1):
        lines.append(str(i))
        lines.append(f"{start} --> {end}")
        lines.append(text)
        lines.append("")
    Path(path).write_text("\n".join(lines), encoding="utf-8")


def _call_model(client, payload, expected_count):
    """One LLM call. Returns dict {idx: text}."""
    r = client.chat.completions.create(
        model=MODEL,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"You will receive {expected_count} cue(s). "
                f"Your `translations` array MUST contain EXACTLY {expected_count} item(s), "
                f"one per input cue, with the same `i` values.\n\n"
                f"{json.dumps(payload, ensure_ascii=False)}"
            )},
        ],
    )
    data = json.loads(r.choices[0].message.content)
    translations = data.get("translations") or data.get("cues") or []
    return {item["i"]: item["t"] for item in translations if "i" in item and "t" in item}


def translate_chunk(client, chunk):
    """chunk: list of (idx, start, end, fr_text). Returns dict {idx: en_text}.

    Strategy: try the chunk as a batch. For any cues missing from the response,
    retranslate individually. After MAX_RETRIES individual attempts fail,
    fall back to the original French text rather than aborting the whole video.
    """
    input_ids = {idx for idx, *_ in chunk}
    text_by_idx = {idx: text for idx, _s, _e, text in chunk}
    payload = {"cues": [{"i": idx, "t": text} for idx, _s, _e, text in chunk]}

    out = {}
    try:
        out = _call_model(client, payload, len(chunk))
    except Exception as e:
        print(f"    chunk @{chunk[0][0]} batch call failed: {e}", file=sys.stderr)

    missing = sorted(input_ids - set(out.keys()))
    if not missing:
        return out

    # Retry missing cues one-by-one (last-cue-of-chunk drop is the common
    # failure mode; isolating it usually succeeds).
    for idx in missing:
        single_payload = {"cues": [{"i": idx, "t": text_by_idx[idx]}]}
        translated = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                got = _call_model(client, single_payload, 1)
                if idx in got:
                    translated = got[idx]
                    break
            except Exception as e:
                print(f"    cue {idx} attempt {attempt} failed: {e}", file=sys.stderr)
            time.sleep(2 ** attempt)
        if translated is None:
            print(f"    cue {idx} fallback to French (translation failed)", file=sys.stderr)
            translated = text_by_idx[idx]
        out[idx] = translated

    return out


def main():
    if len(sys.argv) != 3:
        print("usage: translate_srt.py <fr.srt> <en.srt>", file=sys.stderr)
        sys.exit(1)

    src_path, dst_path = sys.argv[1], sys.argv[2]
    api_key = None
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("OPENAI_API_KEY="):
                api_key = line.split("=", 1)[1].strip()
                break
    api_key = api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY not found in .env or environment", file=sys.stderr)
        sys.exit(2)

    client = OpenAI(api_key=api_key)
    src = Path(src_path).read_text(encoding="utf-8")
    cues = parse_srt(src)
    print(f"  parsed {len(cues)} cues from {src_path}")

    chunks = [cues[i:i + CHUNK_SIZE] for i in range(0, len(cues), CHUNK_SIZE)]
    print(f"  → {len(chunks)} chunks of up to {CHUNK_SIZE}, running with {MAX_WORKERS} workers")

    all_translations = {}
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(translate_chunk, client, c): c for c in chunks}
        done_count = 0
        for fut in as_completed(futures):
            try:
                tr = fut.result()
                all_translations.update(tr)
            except Exception as e:
                # translate_chunk now self-heals via per-cue retry + French fallback,
                # so this branch should never fire — but log it if it ever does.
                print(f"    chunk failed unexpectedly: {e}", file=sys.stderr)
            done_count += 1
            if done_count % 5 == 0 or done_count == len(chunks):
                elapsed = time.time() - t0
                print(f"    progress: {done_count}/{len(chunks)} chunks ({elapsed:.0f}s)")

    # Reassemble in original order.
    out_cues = []
    missing = []
    for idx, start, end, _fr in cues:
        en = all_translations.get(idx)
        if en is None:
            missing.append(idx)
            continue
        out_cues.append((idx, start, end, en))

    if missing:
        print(f"  WARNING: {len(missing)} cues missing translation: {missing[:10]}...", file=sys.stderr)

    write_srt(out_cues, dst_path)
    print(f"  wrote {dst_path} ({len(out_cues)} cues, {time.time() - t0:.0f}s total)")


if __name__ == "__main__":
    main()
