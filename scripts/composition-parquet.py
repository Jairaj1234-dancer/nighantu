#!/usr/bin/env python3
"""
Publish the formulary compositions as Apache Parquet, one row per ingredient.

WHY A SEPARATE SCRIPT. The other four Parquet files are produced by package-datasets.py, which
also builds the Hugging Face card and the Zenodo bundle and writes into dist/. This one writes
into public/parquet/ and is committed, like those four are, because the build pipeline is Node
only: adding pyarrow to CI to convert a file that changes a few times a year would be a poor
trade. The freshness check that keeps a committed file honest is scripts/check-parquet.mjs, which
is Node and does run in CI.

WHAT IT WRITES. The same rows as composition.csv, typed rather than stringified, so a consumer
can filter on a quantity without parsing it back out of text. The amount and the unit are split
into separate columns for exactly that reason: "4.800 kg." is not a number, and a dataset that
makes you regex your way to one is not much better than the page it came from.

A quantity the scan could not resolve is null and the row carries illegible = true. It is never
zero. Zero is a quantity.

    python3 scripts/composition-parquet.py [--check]
"""
import hashlib
import json
import os
import re
import sys

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "data", "composition.json")
OUT_DIR = os.path.join(ROOT, "public", "parquet")
OUT = os.path.join(OUT_DIR, "composition.parquet")
SIDECAR = os.path.join(OUT_DIR, "composition.parquet.json")

# The AFI's own abbreviations for parts of plants, as used by src/components/Composition.astro
# and scripts/composition-dataset.mjs. Kept identical to those so the three never disagree.
PARTS = {
    "Rt.": "root", "Rz.": "rhizome", "Fr.": "fruit", "Sd.": "seed", "Lf.": "leaf", "Fl.": "flower",
    "St.": "stem", "St. Bk.": "stem bark", "Rt. Bk.": "root bark", "Ht. Wd.": "heart wood",
    "Pl.": "whole plant", "P.": "pericarp", "Exd.": "exudate", "Bl.": "bulb", "Ol.": "oil",
    "Dr. Fr.": "dry fruit", "Dr. Sd.": "dry seed", "Ifl.": "inflorescence", "Gl.": "gall",
    "Stmn.": "stamens", "Fl. Bd.": "flower bud", "Rt. Tr.": "root tuber", "St. Tr.": "stem tuber",
    "Fr. R.": "fruit rind", "Enm.": "endosperm", "Rt./St.Bk.": "root or stem bark",
    "Rt./St. Bk.": "root or stem bark", "S.C.": "silicaceous concretion",
}


def part_label(p):
    if not p:
        return None
    if p in PARTS:
        return PARTS[p]
    k = re.sub(r"\s+", " ", str(p)).replace(" . ", ". ").strip()
    return PARTS.get(k) or PARTS.get(k.rstrip(".") + ".") or p


def is_marked(v):
    return bool(re.match(r"^\[illegible", str(v or ""), re.I))


# The quantity cell, as the formulary prints it. Five shapes occur and a parser that handles only
# the first drops 87 real rows on the floor, which on a dataset whose whole claim is that figures
# are checkable is the worst available outcome. So each shape is parsed into what it actually
# states, and what cannot be resolved says so instead of becoming null.
#
#   4.800 kg.                                     a mass or a volume
#   49.152 l. reduced to 12.288 l.                a decoction: both figures are real
#   768 g. (drugs 4 to 16 in equal proportion)    a figure with a note attached
#   1000 in number                                a count, not a mass
#   Q.S.                                          quantum satis: the formulary's own instruction
#   96 £.   960 2.   25.6                         the figure survived the scan and the unit did not
UNIT = r"kg|g|gm|gms|mg|ml|mil|l|litre|liter|part|parts|%"
UNIT_FOLD = {"gm": "g", "gms": "g", "litre": "l", "liter": "l", "parts": "part", "mil": "ml"}

# A decimal point lost to a space in the scan: "9. 219 kg." is 9.219 kg, not 9 and then 219.
SPACED_DECIMAL = re.compile(r"(\d)\.\s+(\d)")
LEAD = re.compile(rf"^\s*(\d+(?:\.\d+)?)\s*(?:({UNIT})\b|([^\s\d]))?", re.I)
REDUCED = re.compile(rf"reduced\s+to\s+(\d+(?:\.\d+)?)\s*({UNIT})?\b", re.I)
COUNT = re.compile(r"\bin\s+number\b", re.I)
QS = re.compile(r"\bq\.?\s*s\.?\b", re.I)
NOTE = re.compile(r"\((.*?)\)|,\s*(as OCR.*)$", re.I | re.S)


def parse_quantity(raw):
    """
    What the cell states, as a dict. Never guesses a unit the scan did not give up: a figure whose
    unit is garbled is published with its amount, a null unit and kind "unit-unresolved", which a
    consumer can filter on. Reading "96 £." as 96 g would be inventing a figure.
    """
    blank = {"amount": None, "unit": None, "kind": None, "note": None,
             "reduced_amount": None, "reduced_unit": None}
    if not raw or is_marked(raw):
        return blank

    text = SPACED_DECIMAL.sub(r"\1.\2", str(raw)).strip()
    out = dict(blank)

    note = NOTE.search(text)
    if note:
        out["note"] = (note.group(1) or note.group(2) or "").strip() or None

    if QS.match(text):
        out["kind"] = "quantum-satis"
        return out

    m = LEAD.match(text)
    if not m:
        out["kind"] = "unresolved"
        return out

    out["amount"] = float(m.group(1))
    if m.group(2):
        out["unit"] = UNIT_FOLD.get(m.group(2).lower(), m.group(2).lower())
        out["kind"] = "proportion" if out["unit"] in ("part", "%") else "measure"
    elif COUNT.search(text):
        out["kind"] = "count"
    else:
        # The figure came through the scan and the unit did not. Said plainly rather than guessed.
        out["kind"] = "unit-unresolved"

    red = REDUCED.search(text)
    if red:
        out["reduced_amount"] = float(red.group(1))
        out["reduced_unit"] = UNIT_FOLD.get((red.group(2) or "").lower(), (red.group(2) or "").lower()) or out["unit"]
        out["kind"] = "measure-reduced"

    return out


def rows_from(records):
    out = []
    for slug, rec in records.items():
        n_ing = 0
        for r in rec.get("rows", []):
            if r.get("structural"):
                # The book's own furniture: sub-headings and continuation lines. Kept out of the
                # tabular dataset entirely, because a row with no ingredient is not an ingredient.
                continue
            n_ing += 1
            raw_qty = r.get("quantity")
            q = parse_quantity(raw_qty)
            # A reduction stated in its own field rather than inside the quantity string.
            if r.get("reduction") and q["reduced_amount"] is None:
                red = REDUCED.search(str(r["reduction"]))
                if red:
                    q["reduced_amount"] = float(red.group(1))
                    q["reduced_unit"] = UNIT_FOLD.get((red.group(2) or "").lower(), (red.group(2) or "").lower()) or q["unit"]
                    q["kind"] = "measure-reduced"
            illegible = is_marked(raw_qty) or is_marked(r.get("part")) or is_marked(r.get("name"))
            out.append({
                "formulation": slug,
                "afi_part": rec.get("afiPart"),
                "afi_entry": rec.get("entryNumber"),
                "entry_heading": (rec.get("entryHeading") or "").strip() or None,
                "classical_source": rec.get("classicalSource"),
                "formulary_dose": rec.get("dose"),
                "ingredient_n": r.get("n"),
                "ingredient": None if is_marked(r.get("name")) else r.get("name"),
                "gloss": None if is_marked(r.get("gloss")) else r.get("gloss"),
                "plant_part": None if is_marked(r.get("part")) else part_label(r.get("part")),
                "plant_part_as_printed": None if is_marked(r.get("part")) else r.get("part"),
                "quantity_as_printed": None if is_marked(raw_qty) else raw_qty,
                "quantity_amount": q["amount"],
                "quantity_unit": q["unit"],
                # measure, measure-reduced, proportion, count, quantum-satis, unit-unresolved,
                # unresolved, or null when the cell was blank or illegible. Filter on this before
                # summing anything.
                "quantity_kind": q["kind"],
                "quantity_note": q["note"],
                "reduced_to_amount": q["reduced_amount"],
                "reduced_to_unit": q["reduced_unit"],
                "illegible_in_scan": bool(illegible),
                "transcription_corrected": bool(r.get("ocrCorrected")),
                "page": f"https://nighantu.ageayurveda.com/formulation/{slug}/",
            })
    return out


# Declared rather than inferred: pandas would type an all-null column as float64 and a consumer
# reading the schema would be told a text field is a number.
SCHEMA = pa.schema([
    ("formulation", pa.string()),
    ("afi_part", pa.string()),
    ("afi_entry", pa.string()),
    ("entry_heading", pa.string()),
    ("classical_source", pa.string()),
    ("formulary_dose", pa.string()),
    ("ingredient_n", pa.int32()),
    ("ingredient", pa.string()),
    ("gloss", pa.string()),
    ("plant_part", pa.string()),
    ("plant_part_as_printed", pa.string()),
    ("quantity_as_printed", pa.string()),
    ("quantity_amount", pa.float64()),
    ("quantity_unit", pa.string()),
    ("quantity_kind", pa.string()),
    ("quantity_note", pa.string()),
    ("reduced_to_amount", pa.float64()),
    ("reduced_to_unit", pa.string()),
    ("illegible_in_scan", pa.bool_()),
    ("transcription_corrected", pa.bool_()),
    ("page", pa.string()),
])


def main():
    raw = open(SRC, "rb").read()
    source_sha = hashlib.sha256(raw).hexdigest()
    records = json.loads(raw).get("records", {})
    rows = rows_from(records)

    if "--check" in sys.argv:
        if not os.path.exists(SIDECAR):
            print("composition.parquet.json is missing. Run this script without --check.")
            return 1
        side = json.load(open(SIDECAR))
        if side.get("sourceSha256") != source_sha:
            print("STALE: public/parquet/composition.parquet was built from a different "
                  "src/data/composition.json.")
            print(f"  recorded {side.get('sourceSha256')}")
            print(f"  current  {source_sha}")
            print("  Run: python3 scripts/composition-parquet.py")
            return 1
        if side.get("rows") != len(rows):
            print(f"STALE: sidecar says {side.get('rows')} rows, the source now yields {len(rows)}.")
            return 1
        print(f"parquet is current: {len(rows)} rows, source sha matches")
        return 0

    os.makedirs(OUT_DIR, exist_ok=True)
    df = pd.DataFrame(rows)
    # Nullable integer, so a missing ingredient number stays missing instead of becoming 0.
    df["ingredient_n"] = pd.array(df["ingredient_n"], dtype="Int32")
    table = pa.Table.from_pandas(df, schema=SCHEMA, preserve_index=False)
    pq.write_table(table, OUT, compression="zstd")

    quantified = sum(1 for r in rows if r["quantity_amount"] is not None)
    illegible = sum(1 for r in rows if r["illegible_in_scan"])
    stated = sum(1 for r in rows if r["quantity_as_printed"])
    unresolved = sum(1 for r in rows if r["quantity_kind"] in ("unresolved", "unit-unresolved"))
    if stated and quantified + unresolved < stated - sum(1 for r in rows if r["quantity_kind"] == "quantum-satis"):
        print(f"REFUSING TO WRITE: {stated} cells state a quantity and only "
              f"{quantified} parsed, with {unresolved} explicitly unresolved. Rows would be "
              f"silently dropped. Fix parse_quantity rather than publishing the gap.", file=sys.stderr)
        return 1
    json.dump({
        "note": "Freshness record for public/parquet/composition.parquet. The parquet file is "
                "committed rather than built in CI, so scripts/check-parquet.mjs compares this "
                "against src/data/composition.json on every build and fails if they have parted.",
        "builtFrom": "src/data/composition.json",
        "sourceSha256": source_sha,
        "rows": len(rows),
        "formulations": len(records),
        "rowsWithAParsedQuantity": quantified,
        "rowsIllegibleInScan": illegible,
        "rowsStatingAQuantity": stated,
        "rowsWhoseUnitTheScanLost": unresolved,
    }, open(SIDECAR, "w"), indent=2)
    open(SIDECAR, "a").write("\n")

    size = os.path.getsize(OUT)
    print(f"rows                      {len(rows)}")
    print(f"formulations              {len(records)}")
    print(f"with a parsed quantity    {quantified}")
    print(f"illegible in the scan     {illegible}")
    print(f"\nwrote public/parquet/composition.parquet ({size:,} bytes) and its freshness record")
    return 0


if __name__ == "__main__":
    sys.exit(main())
