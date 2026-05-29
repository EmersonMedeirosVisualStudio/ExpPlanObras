#!/bin/sh
# Pre-commit check: typecheck + tests + build
# Install: cp scripts/pre-commit-check.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

set -e

echo "🔍 [pre-commit] Running TypeScript checks..."

cd backend
echo "  → backend: tsc --noEmit"
npx tsc --noEmit

echo "  → backend: vitest run"
npx vitest run

cd ../frontend
echo "  → frontend: tsc --noEmit"
npx tsc --noEmit

cd ..
echo "✅ [pre-commit] All checks passed."
