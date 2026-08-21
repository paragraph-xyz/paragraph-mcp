#!/usr/bin/env bash
set -euo pipefail

# Usage: npm run release [patch|minor|major]
#
# Runs the checks locally, bumps the version, and pushes the tag. The tag is
# the trigger: .github/workflows/release.yml publishes to npm, creates the
# GitHub release, and deploys the Worker.
#
# Requires no credentials. npm auth is OIDC (trusted publishing) inside the
# workflow, so there is no NPM_TOKEN to mint, hold, or leak, and nobody needs
# npm publish rights on this package to cut a release.

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: npm run release [patch|minor|major]"
  exit 1
fi

# Ensure clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

# Ensure on main
BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must be on main branch (currently on $BRANCH)."
  exit 1
fi

# Pull latest
git pull --rebase

# Install deps with --immutable: fails loudly on a lockfile/package.json
# mismatch and refreshes node_modules so the build can't run against a stale
# SDK version.
echo "=> Installing dependencies..."
yarn install --immutable

# Build and test locally before tagging. CI runs these again, but failing here
# costs a rerun instead of a published-then-yanked version.
echo "=> Building..."
yarn build

echo "=> Testing..."
yarn test

# Bump version (updates package.json + creates git tag)
echo "=> Bumping $BUMP version..."
NEW_VERSION="$(npm version "$BUMP" --message "release: v%s")"
echo "   New version: $NEW_VERSION"

# Push commit + tag. Pushing the tag is what starts the release workflow, so it
# goes last: a failure above leaves nothing half-released.
echo "=> Pushing to origin..."
git push && git push --tags

echo ""
echo "=> Tagged $NEW_VERSION - CI is publishing it now."
echo "   actions: https://github.com/paragraph-xyz/paragraph-mcp/actions"
echo "   npm:     https://www.npmjs.com/package/@paragraph-com/mcp"
echo "   worker:  https://mcp.paragraph.com"
echo ""
echo "   If the run fails, fix forward and release again rather than reusing"
echo "   $NEW_VERSION - npm will not accept a republished version."
