#!/usr/bin/env bash
# Shared fixture repository for the Ubuntu harness. SOURCED (not executed)
# by check.sh and webkit-check.sh so both seed the exact shape the e2e specs
# assume (tests/e2e/blob-highlight.spec.ts, file-tree.spec.ts):
#
#   * branch `powergit` checked out (tree rows click data-label="powergit")
#   * frontend/src/graph/layout.ts present at HEAD (copied from the repo)
#   * README.md at the root
#   * a second author, a `feature` branch, a dozen work commits
#   * per-repo git identity (the container has no global one; without it the
#     first commit aborts with exit 128 and nothing gets tested)
#
# Usage:  source /path/to/seed-repo.sh; seed_repo /tmp/seed [/repo]
seed_repo() {
  local dest=${1:-/tmp/seed} src=${2:-/repo}
  rm -rf "$dest" && mkdir -p "$dest"
  ( set -e
    cd "$dest"
    git init -b powergit -q
    git config user.email "seed@powergit.test"
    git config user.name "Seed Author"
    mkdir -p frontend
    cp -r "$src/frontend/src" frontend/src
    cp "$src/README.md" .
    git add . && git commit -qm "seed: frontend tree"
    echo "a" > frontend/src/new-file.txt && git add . && git commit -qm "same author 2"
    echo "b" > other.txt && git add . \
      && GIT_AUTHOR_NAME="Other Dev" GIT_AUTHOR_EMAIL=o@x.io git commit -qm "other author"
    local i
    for i in $(seq 1 12); do echo "l$i" >> log.txt; git add .; git commit -qm "work $i"; done
    git tag v1.0.0
    git checkout -q -b feature && echo f > feature.txt && git add . && git commit -qm "feature commit"
    git checkout -q powergit
  )
}
