#!/usr/bin/env python3
"""Build local synthetic listening examples, never assessment recordings.

Uses the already installed macOS Samantha voice. No network services are called.
Run from any directory; source text and stable IDs come from the content manifest.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import wave


ROOT = Path(__file__).resolve().parents[1]
VOICE = "Samantha"
RATE = 160
FORMAT = {"sampleRate": 16000, "channels": 1, "sampleWidth": 2}


def inspect_audio(path: Path) -> dict:
    with wave.open(str(path), "rb") as audio:
        if (audio.getframerate(), audio.getnchannels(), audio.getsampwidth(),
                audio.getcomptype()) != (16000, 1, 2, "NONE"):
            raise ValueError(f"Unexpected WAV format: {path.name}")
        frames = audio.getnframes()
        pcm = audio.readframes(frames)
        if frames <= 0 or len(pcm) != frames * 2 or not any(pcm):
            raise ValueError(f"Empty or truncated WAV: {path.name}")
    return {
        **FORMAT,
        "frames": frames,
        "durationSeconds": round(frames / FORMAT["sampleRate"], 6),
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def run(arguments: list[str]) -> str:
    result = subprocess.run(arguments, check=True, capture_output=True,
                            text=True, timeout=90)
    return result.stdout


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path,
                        default=ROOT / "docs/content/ft-target-words-2026-09-14.json")
    parser.add_argument("--report", type=Path,
                        default=ROOT / "docs/content/ft-target-audio-2026-09-14.json")
    parser.add_argument("--workers", type=int, choices=(2, 3, 4), default=3)
    args = parser.parse_args()
    voices = run(["/usr/bin/say", "-v", "?"])
    if not re.search(r"^Samantha\s+en_US\s", voices, re.MULTILINE):
        raise RuntimeError("Installed Samantha en_US voice was not found.")
    manifest_bytes = args.manifest.read_bytes()
    manifest = json.loads(manifest_bytes)
    items = manifest["items"]
    seen: set[str] = set()
    for item in items:
        item_id, text, kind = item["id"], item["text"], item["kind"]
        if (not isinstance(item_id, str)
                or not re.fullmatch(r"ft-(?:word|sentence)-[a-z0-9-]+", item_id)
                or item_id in seen or kind not in ("word", "sentence")
                or not item_id.startswith(f"ft-{kind}-")
                or not isinstance(text, str) or not text.strip()):
            raise ValueError(f"Invalid or duplicate content item: {item_id!r}")
        seen.add(item_id)
    previous = {}
    if args.report.exists():
        old = json.loads(args.report.read_text())
        if old.get("voice") == VOICE and old.get("wordsPerMinute") == RATE:
            previous = {entry["id"]: entry for entry in old.get("items", [])}
    output_dir = ROOT / "public/samples"
    output_dir.mkdir(parents=True, exist_ok=True)
    original_files = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in output_dir.glob("*.wav") if path.stem not in seen
    }

    def generate(item: dict) -> tuple[dict, bool]:
        item_id = item["id"]
        destination = output_dir / f"{item_id}.wav"
        saved = previous.get(item_id)
        generated = True
        if destination.exists() and saved and saved.get("text") == item["text"]:
            try:
                info = inspect_audio(destination)
                generated = info["sha256"] != saved.get("sha256")
            except (ValueError, wave.Error, EOFError):
                generated = True
        if generated:
            with tempfile.TemporaryDirectory(prefix=f".{item_id}-", dir=output_dir) as temp:
                folder = Path(temp)
                source = folder / "text.txt"
                source.write_text(item["text"], encoding="utf-8")
                aiff = folder / "sample.aiff"
                wav = folder / "sample.wav"
                run(["/usr/bin/say", "-v", VOICE, "-r", str(RATE),
                     "-f", str(source), "-o", str(aiff)])
                run(["/usr/bin/afconvert", "-f", "WAVE", "-d", "LEI16@16000",
                     "-c", "1", str(aiff), str(wav)])
                info = inspect_audio(wav)
                wav.replace(destination)
        return ({"id": item_id, "text": item["text"], "kind": item["kind"],
                 "file": f"public/samples/{item_id}.wav", **info}, generated)

    completed: dict[str, dict] = {}
    generated_count = 0
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(generate, item): item["id"] for item in items}
        for future in as_completed(futures):
            entry, generated = future.result()
            completed[entry["id"]] = entry
            generated_count += int(generated)
            if len(completed) % 25 == 0 or len(completed) == len(items):
                print(f"Validated {len(completed)}/{len(items)} local examples", flush=True)
    for filename, expected in original_files.items():
        if hashlib.sha256((output_dir / filename).read_bytes()).hexdigest() != expected:
            raise RuntimeError(f"Preexisting unrelated sample changed: {filename}")
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceManifest": str(args.manifest.resolve().relative_to(ROOT)),
        "sourceManifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "contentVersion": manifest["contentVersion"],
        "sourceWorkbookSha256": manifest["sourceSha256"],
        "generator": "macOS say + afconvert (installed local voice)",
        "voice": VOICE, "locale": "en_US", "wordsPerMinute": RATE,
        "purpose": "Synthetic listening examples; not human speech, assessment results, or accuracy validation.",
        "format": {"container": "WAV", "encoding": "PCM signed 16-bit little-endian", **FORMAT},
        "counts": {"words": sum(i["kind"] == "word" for i in items),
                   "sentences": sum(i["kind"] == "sentence" for i in items),
                   "total": len(items), "generated": generated_count,
                   "reusedValid": len(items) - generated_count},
        "preservedExistingSamples": original_files,
        "items": [completed[item["id"]] for item in items],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"report": str(args.report), "counts": report["counts"],
                      "preservedExisting": len(original_files)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
