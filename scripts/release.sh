#!/usr/bin/env bash
set -euo pipefail

# Usage: npm run release [patch|minor|major]
# Builds, tests, publishes to npm, deploys to Cloudflare Workers,
# and creates a GitHub release.
#
# Requires:
#   NPM_TOKEN  — granular access token from https://www.npmjs.com/settings/tokens
#                with read/write permissions for @paragraph-com/mcp.
#                Must NOT require 2FA. You can delete it after the release.
#   wrangler   — must be authenticated (`wrangler login` or CLOUDFLARE_API_TOKEN).

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: npm run release [patch|minor|major]"
  exit 1
fi

if [[ -z "${NPM_TOKEN:-}" ]]; then
  echo "Error: NPM_TOKEN is not set."
  echo ""
  echo "Create a granular access token at https://www.npmjs.com/settings/tokens"
  echo "  - Type: Granular Access Token"
  echo "  - Packages: Read and write, scoped to @paragraph-com/mcp"
  echo "  - Do NOT require 2FA on the token"
  echo "  - You can delete the token after the release"
  echo ""
  echo "Then run: NPM_TOKEN=<token> npm run release $BUMP"
  exit 1
fi

# Verify wrangler is authenticated
if ! npx wrangler whoami &>/dev/null; then
  echo "Error: wrangler is not authenticated."
  echo ""
  echo "Run 'wrangler login' or set CLOUDFLARE_API_TOKEN."
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

# Build and test
echo "=> Building..."
yarn build

echo "=> Testing..."
yarn test

# Bump version (updates package.json + creates git tag)
echo "=> Bumping $BUMP version..."
NEW_VERSION="$(npm version "$BUMP" --message "release: v%s")"
echo "   New version: $NEW_VERSION"

# Push commit + tag
echo "=> Pushing to origin..."
git push && git push --tags

# Publish to npm
echo "=> Publishing to npm..."
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc
trap 'rm -f .npmrc' EXIT
if ! npm publish; then
  echo ""
  echo "ERROR: npm publish failed. The git tag $NEW_VERSION has been pushed."
  echo "To retry: npm publish"
  echo "To rollback: git tag -d $NEW_VERSION && git push origin :refs/tags/$NEW_VERSION && git reset --hard HEAD~1 && git push --force"
  exit 1
fi

# Deploy to Cloudflare Workers
echo "=> Deploying to Cloudflare Workers..."
if ! yarn deploy; then
  echo ""
  echo "ERROR: wrangler deploy failed. npm package was published successfully."
  echo "To retry: yarn deploy"
  exit 1
fi

# Create GitHub release
echo "=> Creating GitHub release..."
if ! gh release create "$NEW_VERSION" \
  --title "$NEW_VERSION" \
  --generate-notes; then
  echo "WARNING: GitHub release creation failed. npm + worker deploy succeeded."
fi

echo ""
echo "=> Released $NEW_VERSION"
echo "   npm:    https://www.npmjs.com/package/@paragraph-com/mcp"
echo "   worker: https://mcp.paragraph.com"
echo "   gh:     https://github.com/paragraph-xyz/paragraph-mcp/releases/tag/${NEW_VERSION}"
