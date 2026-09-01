#!/usr/bin/env python3
"""Build src/theory/chord-library.json from the free-midi-chords corpus.

Developer-only; never runs for users. Usage:
    python3 scripts/build_chord_library.py path/to/free-midi-chords

Strategy (SPEC.md §8.2, preferred): parse the progression definitions straight
from the generator source (chords.py declares prog_maj / prog_min as
'NUMERALS... =Mood Mood' strings). Roman numerals are key-independent, which
is exactly what we want. Modal progressions are skipped in v1 — our key
detection only produces major/minor keys, so they could never be offered.
Stdlib only.
"""

import ast
import json
import re
import subprocess
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "theory" / "chord-library.json"

# SPEC.md §8.2 voicings, verbatim.
VOICINGS = {
    "maj": [0, 4, 7],
    "min": [0, 3, 7],
    "maj7": [0, 4, 7, 11],
    "min7": [0, 3, 7, 10],
    "dom7": [0, 4, 7, 10],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
    "add9": [0, 4, 7, 14],
    "min9": [0, 3, 7, 10, 14],
    "maj9": [0, 4, 7, 11, 14],
}

# Longest alternatives first, or "IV" would match as "I" + suffix "V".
NUMERAL_RE = re.compile(r"^(vii|iii|vi|iv|ii|i|v)(.*)$", re.IGNORECASE)

# Corpus suffix → nearest quality in our vocabulary (approximations noted).
def quality_for(base: str, suffix: str) -> str:
    minor = base.islower()
    s = suffix.lower()
    if s in ("", "m-5", "5", "6", "69"):  # plain / approximations
        return "min" if minor else "maj"
    if s in ("m7",):
        return "min7"
    if s == "7":
        return "min7" if minor else "dom7"
    if s == "dom7":
        return "dom7"
    if s in ("sus2", "sus4"):
        return s
    if s == "add9":
        return "min9" if minor else "add9"
    if s == "dim":
        return "min"  # no diminished voicing in v1
    return "min" if minor else "maj"


def parse_list(source: str, name: str) -> list[str]:
    match = re.search(rf"^{name}\s*=\s*(\[.*?^\])", source, re.MULTILINE | re.DOTALL)
    if not match:
        raise SystemExit(f"could not find {name} in chords.py")
    value = ast.literal_eval(match.group(1))
    if not isinstance(value, list):
        raise SystemExit(f"{name} is not a list")
    return value


def parse_entry(entry: str):
    if "=" in entry:
        chords_part, tags_part = entry.split("=", 1)
        tags = [t.lower() for t in tags_part.split() if t.lower() != "new"]
    else:
        chords_part, tags = entry, []
    numerals: list[str] = []
    qualities: list[str] = []
    for token in chords_part.split():
        m = NUMERAL_RE.match(token)
        if not m:
            return None  # skip anything exotic (bIII etc. only appear in modal)
        base, suffix = m.group(1), m.group(2)
        numerals.append(base)
        qualities.append(quality_for(base, suffix))
    return numerals, qualities, sorted(set(tags))


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    repo = Path(sys.argv[1])
    source = (repo / "chords.py").read_text()
    try:
        rev = subprocess.run(
            ["git", "-C", str(repo), "log", "-1", "--format=%h %as"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except Exception:
        rev = "unknown revision"

    progressions = []
    seen: set[str] = set()
    for mode, name in (("major", "prog_maj"), ("minor", "prog_min")):
        counter = 0
        for entry in parse_list(source, name):
            parsed = parse_entry(entry)
            if parsed is None:
                continue
            numerals, qualities, tags = parsed
            key = f"{mode}|{' '.join(numerals)}|{' '.join(qualities)}"
            if key in seen:
                continue  # dedupe rhythmic variants; we only need the chords
            seen.add(key)
            counter += 1
            progressions.append({
                "id": f"{mode[:3]}-{counter:04d}",
                "mode": mode,
                "numerals": numerals,
                "qualities": qualities,
                "tags": tags,
                "bars": len(numerals),
            })

    library = {
        "source": f"ldrolez/free-midi-chords @ {rev}, MIT",
        "progressions": progressions,
        "voicings": VOICINGS,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(library, indent=1) + "\n")
    size = OUT.stat().st_size
    print(f"wrote {OUT} — {len(progressions)} progressions, {size} bytes")
    if size > 300 * 1024:
        raise SystemExit("library exceeds the 300 KB budget")


if __name__ == "__main__":
    main()
