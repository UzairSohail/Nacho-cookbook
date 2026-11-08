#!/usr/bin/env bash
# Netlify "ignore" step: decides whether a build should run at all.
# Exit 0 = skip the build (no deploy, no credits). Exit 1 = build.
#
# Each production deploy costs 15 of the free plan's 300 monthly credits,
# while deploy previews are free. So:
#   1. Nothing is built when a change can't affect the web app
#      (Android workflow, docs, database SQL, sync rules, tests).
#   2. With the Netlify variable WEB_DEPLOY_MODE=batched, merges to master
#      no longer publish on their own. The site is published only by the
#      "Publish web app" GitHub workflow, which calls a Netlify build hook
#      (a button in GitHub Actions, plus once a week if anything changed).
set -u

# Builds started by a build hook are deliberate publishes: always build.
if [ -n "${INCOMING_HOOK_URL:-}" ] || [ -n "${INCOMING_HOOK_TITLE:-}" ]; then
  echo "Build hook: building."
  exit 1
fi

if [ "${CONTEXT:-}" = "production" ] && [ "${WEB_DEPLOY_MODE:-}" = "batched" ]; then
  echo "Batched publishing is on: skipping this merge. Run the 'Publish web app' workflow to publish."
  exit 0
fi

base="${CACHED_COMMIT_REF:-}"
head="${COMMIT_REF:-HEAD}"
if [ -z "$base" ] || [ "$base" = "$head" ] || ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "No earlier build to compare with: building."
  exit 1
fi

if git diff --quiet "$base" "$head" -- . \
  ':(exclude).github' ':(exclude).claude' ':(exclude).vscode' \
  ':(exclude)docs' ':(exclude)supabase' ':(exclude)powersync' \
  ':(exclude)README.md' ':(exclude)AGENTS.md' ':(exclude).env.example' \
  ':(exclude)vitest.config.mts' ':(glob,exclude)**/__tests__/**'; then
  echo "Only non-web files changed since the last build: skipping."
  exit 0
fi

echo "Web app files changed: building."
exit 1
