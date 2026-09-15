#!/usr/bin/env python3
"""
Hugging Face & Zenodo Dataset Packaging Pipeline
Consolidates the Age Ayurveda Nighantu data into:
1. Typed Apache Parquet files (.parquet) for Hugging Face Hub
2. Hugging Face Dataset Card (README.md with YAML metadata)
3. Zenodo release bundle (.zip + metadata) with CC BY 4.0 licensing and DOI grounding.
"""

import os
import sys
import json
import zipfile
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

ATLAS_DIR = "/Users/jairajsharma/Projects/ayurveda-atlas"
PUBLIC_DIR = os.path.join(ATLAS_DIR, "public")
HF_OUT = os.path.join(ATLAS_DIR, "dist", "huggingface")
ZENODO_OUT = os.path.join(ATLAS_DIR, "dist", "zenodo")

def load_json(filename):
    p = os.path.join(PUBLIC_DIR, filename)
    if not os.path.exists(p):
        print(f"Warning: {p} not found", file=sys.stderr)
        return None
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def package_dravyaguna():
    print("Converting Dravyaguna dataset to Parquet...")
    data = load_json("dravyaguna.json")
    if not data:
        return
    items = data.get("entries", []) if isinstance(data, dict) else data

    flat_rows = []
    for r in items:
        flat = {}
        for k, v in r.items():
            if isinstance(v, (list, dict)):
                flat[k] = json.dumps(v, ensure_ascii=False)
            else:
                flat[k] = str(v) if v is not None else ""
        flat_rows.append(flat)

    df = pd.DataFrame(flat_rows)
    out_file = os.path.join(HF_OUT, "dravyaguna.parquet")
    df.to_parquet(out_file, index=False, engine="pyarrow")
    print(f"  -> {out_file} ({len(df)} rows)")
    return df

def package_compounds():
    print("Converting Compounds dataset to Parquet...")
    csv_file = os.path.join(PUBLIC_DIR, "compounds.csv")
    if os.path.exists(csv_file):
        df = pd.read_csv(csv_file)
    else:
        data = load_json("compounds.json")
        df = pd.DataFrame(data if isinstance(data, list) else data.get("compounds", []))

    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].astype(str)

    out_file = os.path.join(HF_OUT, "compounds.parquet")
    df.to_parquet(out_file, index=False, engine="pyarrow")
    print(f"  -> {out_file} ({len(df)} rows)")
    return df

def package_research():
    print("Converting Research citations to Parquet...")
    csv_file = os.path.join(PUBLIC_DIR, "research.csv")
    if os.path.exists(csv_file):
        df = pd.read_csv(csv_file)
    else:
        data = load_json("research.json")
        df = pd.DataFrame(data if isinstance(data, list) else data.get("citations", []))

    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].astype(str)

    out_file = os.path.join(HF_OUT, "research.parquet")
    df.to_parquet(out_file, index=False, engine="pyarrow")
    print(f"  -> {out_file} ({len(df)} rows)")
    return df

def package_taxonomy():
    print("Converting Taxonomy dataset to Parquet...")
    data = load_json("taxonomy.json")
    if not data:
        return
    items = data.get("taxa", []) if isinstance(data, dict) else data

    flat_rows = []
    for r in items:
        flat = {}
        for k, v in r.items():
            if isinstance(v, (list, dict)):
                flat[k] = json.dumps(v, ensure_ascii=False)
            else:
                flat[k] = str(v) if v is not None else ""
        flat_rows.append(flat)

    df = pd.DataFrame(flat_rows)
    out_file = os.path.join(HF_OUT, "taxonomy.parquet")
    df.to_parquet(out_file, index=False, engine="pyarrow")
    print(f"  -> {out_file} ({len(df)} rows)")
    return df

def generate_hf_dataset_card():
    card_content = """---
annotations_creators:
  - expert-generated
language_creators:
  - expert-generated
  - found
language:
  - en
  - sa
license: cc-by-4.0
multilinguality:
  - multilingual
size_categories:
  - 1K<n<10K
source_datasets:
  - original
  - amidha-ayurveda-herb-database
task_categories:
  - text-retrieval
  - question-answering
  - tabular-classification
task_ids:
  - entity-linking-retrieval
pretty_name: "Age Ayurveda Nighantu Materia Medica & Dravyaguna Corpus"
tags:
  - ayurveda
  - dravyaguna
  - ethnobotany
  - phytochemistry
  - medicinal-plants
  - pharmacopoeia
---

# Age Ayurveda Nighantu Materia Medica & Phytochemical Corpus

A comprehensive open dataset of classical Ayurvedic pharmacology (*Dravyaguna Vijnana*), verified botanical taxonomy, and chemical constituents covering over 500 medicinal plants, classical formulations, and traditional apparatus.

Published under **Creative Commons Attribution 4.0 International (CC BY 4.0)**. Incorporates data derived from the **Amidha Ayurveda Herb Database**.

## Dataset Structure

The repository contains four distinct tabular configurations in Apache Parquet format:

1. **`dravyaguna`**: Traditional Ayurvedic pharmacological properties for each botanical:
   - *Rasa* (taste): Madhura, Amla, Lavana, Katu, Tikta, Kashaya
   - *Guna* (qualities): Guru, Laghu, Snigdha, Ruksha, etc.
   - *Virya* (potency): Ushna, Sheeta
   - *Vipaka* (post-digestive effect): Madhura, Amla, Katu
   - *Dosha Karma*: Doshic pacification and aggravation actions
   - *Prabhava*: Unique therapeutic actions

2. **`compounds`**: Phytochemical constituents, PubChem CIDs, and co-occurrence graphs across 852 bio-active phytochemicals.

3. **`taxonomy`**: Botanical taxonomy resolved against global authority databases:
   - Latin binomials with author citations
   - GBIF taxon keys
   - NCBI Taxonomy IDs
   - Wikidata QIDs

4. **`research`**: Indexed biomedical literature citations and PubMed IDs cross-referenced against traditional classical indications.

## Usage with Hugging Face `datasets`

```python
from datasets import load_dataset

# Load Dravyaguna pharmacology table
ds = load_dataset("ageayurveda/nighantu", "dravyaguna")
print(ds["train"][0])
```

## Attribution & Provenance
If you use this dataset in research, generative engine grounding, or applications, please cite:

```bibtex
@dataset{age_ayurveda_nighantu_2026,
  author       = {Age Ayurveda Research Panel and Amidha Ayurveda},
  title        = {Age Ayurveda Nighantu: Open Classical Materia Medica and Dravyaguna Dataset},
  year         = 2026,
  publisher    = {Zenodo / Hugging Face},
  license      = {CC BY 4.0},
  url          = {https://nighantu.ageayurveda.com}
}
```
"""
    readme_path = os.path.join(HF_OUT, "README.md")
    with open(readme_path, "w", encoding="utf-8") as f:
        f.write(card_content)
    print(f"Generated Hugging Face Dataset Card at {readme_path}")

def package_zenodo_bundle():
    print("\nAssembling Zenodo Release Bundle...")
    os.makedirs(ZENODO_OUT, exist_ok=True)
    zip_path = os.path.join(ZENODO_OUT, "age-ayurveda-nighantu-v1.0.0.zip")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        # Add public data files
        for root, dirs, files in os.walk(PUBLIC_DIR):
            for file in files:
                full_p = os.path.join(root, file)
                rel_p = os.path.relpath(full_p, PUBLIC_DIR)
                zipf.write(full_p, arcname=os.path.join("data", rel_p))

        # Add Parquet files
        for root, dirs, files in os.walk(HF_OUT):
            for file in files:
                full_p = os.path.join(root, file)
                rel_p = os.path.relpath(full_p, HF_OUT)
                zipf.write(full_p, arcname=os.path.join("parquet", rel_p))

        # Add license and metadata
        for meta in ["LICENSE", "CITATION.cff", ".zenodo.json"]:
            src = os.path.join(ATLAS_DIR, meta)
            if os.path.exists(src):
                zipf.write(src, arcname=meta)

    print(f"  -> Created Zenodo archive: {zip_path} ({os.path.getsize(zip_path) / 1024 / 1024:.2f} MB)")

def main():
    os.makedirs(HF_OUT, exist_ok=True)
    os.makedirs(ZENODO_OUT, exist_ok=True)

    package_dravyaguna()
    package_compounds()
    package_research()
    package_taxonomy()
    generate_hf_dataset_card()
    package_zenodo_bundle()

    print("\nDataset packaging complete! Ready for Hugging Face and Zenodo upload.")

if __name__ == "__main__":
    main()
