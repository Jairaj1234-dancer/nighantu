#!/usr/bin/env bash
# One-command publication to Hugging Face Hub and Zenodo for Age Ayurveda Nighantu.
set -euo pipefail

HF_REPO="${HF_REPO:-ageayurveda/nighantu}"
DIST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dist"

echo "=== Age Ayurveda Open Dataset Distribution ==="

# 1. Hugging Face
if command -v huggingface-cli >/dev/null 2>&1; then
  echo "==> huggingface-cli found"
  if [[ -n "${HF_TOKEN:-}" ]]; then
    echo "==> uploading to Hugging Face: ${HF_REPO}"
    python3 -c "
from huggingface_hub import HfApi
import os
api = HfApi(token=os.environ.get('HF_TOKEN'))
api.create_repo(repo_id='${HF_REPO}', repo_type='dataset', exist_ok=True)
api.upload_folder(
    folder_path='${DIST_DIR}/huggingface',
    repo_id='${HF_REPO}',
    repo_type='dataset'
)
print('Successfully uploaded dataset to https://huggingface.co/datasets/${HF_REPO}')
"
  else
    echo "HF_TOKEN not set. Set HF_TOKEN=hf_... or run 'huggingface-cli login' to push to Hub."
  fi
else
  echo "Tip: Install huggingface_hub ('pip install huggingface_hub') to enable direct Hub pushing."
fi

# 2. Zenodo
ZENODO_ZIP="${DIST_DIR}/zenodo/age-ayurveda-nighantu-v1.0.0.zip"
if [[ -f "$ZENODO_ZIP" ]]; then
  echo "==> Zenodo package ready: ${ZENODO_ZIP} ($(du -h "$ZENODO_ZIP" | cut -f1))"
  if [[ -n "${ZENODO_TOKEN:-}" ]]; then
    echo "==> depositing to Zenodo API..."
    DEPOSIT=$(curl -sS -X POST "https://zenodo.org/api/deposit/depositions" \
      -H "Authorization: Bearer ${ZENODO_TOKEN}" \
      -H "Content-Type: application/json" -d '{}')
    DEP_ID=$(echo "$DEPOSIT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id', ''))")
    if [[ -n "$DEP_ID" ]]; then
      BUCKET=$(echo "$DEPOSIT" | python3 -c "import json,sys; print(json.load(sys.stdin)['links']['bucket'])")
      curl -sS -T "$ZENODO_ZIP" "${BUCKET}/age-ayurveda-nighantu-v1.0.0.zip" \
        -H "Authorization: Bearer ${ZENODO_TOKEN}"
      echo "Deposited successfully to Zenodo (Deposition ID: $DEP_ID)"
      echo "Review and publish at: https://zenodo.org/deposit/${DEP_ID}"
    else
      echo "Failed to create Zenodo deposition. Check ZENODO_TOKEN."
    fi
  else
    echo "ZENODO_TOKEN not set. Upload manually at https://zenodo.org/deposit/new or set ZENODO_TOKEN=..."
  fi
fi
