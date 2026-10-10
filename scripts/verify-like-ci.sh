#!/usr/bin/env bash
# Run exactly what the deploy workflow runs, in exactly its order, by reading the workflow.
#
# WHY THIS EXISTS. On 10 October a commit passed a hand-written local gate sweep and then failed the
# deploy on `compoundsResolved fell from 455 to 442`. The local sweep was not wrong about the gates
# it ran; it ran the wrong set, in the wrong order, against stale data. CI runs
# ./scripts/build-downloads.sh BEFORE auditing, which regenerates compounds and chemistry from
# content. The local sweep skipped it, so audit.mjs compared a committed 455 against itself and
# printed PASS while the real figure was 442.
#
# That is a false negative in a safety check, which is worse than no check: every green sweep that
# day was weaker than it looked, and the one that mattered was wrong.
#
# THE FIX IS NOT A LONGER LIST. Two hand-maintained lists drift, which is how this happened. This
# one is DERIVED from .github/workflows/deploy.yml, so a gate added to CI is a gate run here with no
# second edit, and a gate removed cannot linger here pretending to still matter.
#
#   ./scripts/verify-like-ci.sh            run everything, stop at the first failure
#   ./scripts/verify-like-ci.sh --list     print the derived step list and run nothing
set -uo pipefail

WORKFLOW=".github/workflows/deploy.yml"
LIST_ONLY="${1:-}"

if [ ! -f "$WORKFLOW" ]; then
  echo "Cannot find $WORKFLOW. Run this from the repository root."
  exit 1
fi

# Pair each `- name:` with the `run:` that follows it, in file order. The extraction is a separate
# helper rather than a heredoc inside a process substitution: nesting those let the shell mangle the
# Python before it ever ran, which is its own small lesson about doing one thing per step.
STEPFILE="$(mktemp)"
trap 'rm -f "$STEPFILE"' EXIT
python3 scripts/lib/ci-steps.py "$WORKFLOW" > "$STEPFILE"
STEP_COUNT=$(wc -l < "$STEPFILE" | tr -d ' ')

if [ "$LIST_ONLY" = "--list" ]; then
  echo "Derived $STEP_COUNT steps from $WORKFLOW:"
  nl -ba "$STEPFILE" | sed 's/\t/  /'
  exit 0
fi

echo "Derived $STEP_COUNT steps from $WORKFLOW"
echo

declare -i ran=0 skipped=0
while IFS=$'\t' read -r name cmd; do
  [ -z "${cmd:-}" ] && continue

  # A multiline block, a git write, or a CI-only step cannot run on a developer machine.
  case "$cmd" in
    '|'*) echo "  SKIP  $name  (multiline block, CI only)"; skipped+=1; continue ;;
    git*|gh\ *) echo "  SKIP  $name  (writes to the remote)"; skipped+=1; continue ;;
  esac
  case "$name" in
    *IndexNow*|*Commit*|*baseline*) echo "  SKIP  $name  (CI only)"; skipped+=1; continue ;;
  esac

  printf '  RUN   %-52s ' "$cmd"
  if out=$(eval "$cmd" 2>&1); then
    echo "ok"
    ran+=1
  else
    echo "FAILED"
    echo
    echo "----- $name -----"
    echo "$out" | tail -25
    echo
    echo "Stopped at the first failure, as CI does. $ran step(s) passed before it."
    exit 1
  fi
done < "$STEPFILE"

echo
echo "All $ran steps passed, $skipped skipped as CI-only."
echo "This is the same set, in the same order, as the deploy workflow."
