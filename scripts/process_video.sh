#!/bin/bash
# process_video.sh <slug> <source_mp4_path>
#
# Orchestrates: symlink → transcribe (HYBRID) → clean → translate → vtt.
# Outputs land in <repo>/subtitles/<slug>.{fr,en}.{srt,vtt}.

set -euo pipefail

SLUG="${1:?usage: process_video.sh <slug> <source_mp4_path>}"
SRC_MP4="${2:?usage: process_video.sh <slug> <source_mp4_path>}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TRANSCRIBE_BASE="/Users/yacine/Documents/Transcribe"
TO_TRANSCRIBE="$TRANSCRIBE_BASE/to_transcribe"
DONE_DIR="$TRANSCRIBE_BASE/done"
VENV_PY="$TRANSCRIBE_BASE/.venv-whisperx/bin/python"
SUB_DIR="$REPO_ROOT/subtitles"

mkdir -p "$SUB_DIR"

echo "── [$SLUG] step 1/5: symlink"
ln -sfn "$SRC_MP4" "$TO_TRANSCRIBE/$SLUG.mp4"

if [ ! -f "$DONE_DIR/$SLUG.srt" ]; then
  echo "── [$SLUG] step 2/5: transcribe (HYBRID, mlx-whisper + WhisperX align)"
  cd "$TRANSCRIBE_BASE"
  echo "1" | "$VENV_PY" transcribe_all.py
else
  echo "── [$SLUG] step 2/5: skipped (already in done/)"
fi

if [ ! -f "$DONE_DIR/$SLUG.srt" ]; then
  echo "ERROR: transcription did not produce $DONE_DIR/$SLUG.srt"
  exit 1
fi

echo "── [$SLUG] step 3/5: clean Whisper hallucinations"
"$VENV_PY" "$REPO_ROOT/scripts/srt_clean.py" "$DONE_DIR/$SLUG.srt" "$SUB_DIR/$SLUG.fr.srt"

echo "── [$SLUG] step 4/5: translate FR → EN (gpt-4.1)"
"$VENV_PY" "$REPO_ROOT/scripts/translate_srt.py" "$SUB_DIR/$SLUG.fr.srt" "$SUB_DIR/$SLUG.en.srt"

echo "── [$SLUG] step 5/5: convert SRT → VTT for both langs"
"$VENV_PY" "$REPO_ROOT/scripts/srt_to_vtt.py" "$SUB_DIR/$SLUG.fr.srt" "$SUB_DIR/$SLUG.fr.vtt"
"$VENV_PY" "$REPO_ROOT/scripts/srt_to_vtt.py" "$SUB_DIR/$SLUG.en.srt" "$SUB_DIR/$SLUG.en.vtt"

echo "── [$SLUG] DONE"
ls -lh "$SUB_DIR/$SLUG".*
