#!/bin/sh
# Run from the root of your git repo.
# Moves all markdown docs into MD/, stops tracking markdown in git, and
# makes sure *.md / MD/ are ignored going forward.

mkdir -p MD
git mv *.md MD/ 2>/dev/null || mv *.md MD/ 2>/dev/null

# Untrack any .md files already pushed to git (keeps them on disk, just
# removes them from version control).
git rm -r --cached '*.md' 2>/dev/null
git rm -r --cached MD 2>/dev/null

# Make sure .gitignore has the rules (no-op if already present).
grep -qxF '*.md' .gitignore || echo '*.md' >> .gitignore
grep -qxF 'MD/' .gitignore || echo 'MD/' >> .gitignore

git add .gitignore
git commit -m "Move docs into MD/ and stop tracking markdown files"
