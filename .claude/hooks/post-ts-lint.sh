#!/usr/bin/env bash
set -uo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Only run for TypeScript files that exist on disk
if [[ "$file_path" != *.ts && "$file_path" != *.tsx ]]; then
  exit 0
fi
if [[ ! -f "$file_path" ]]; then
  exit 0
fi

project_dir=$(echo "$input" | jq -r '.cwd // ""')
if [[ -z "$project_dir" || ! -d "$project_dir" ]]; then
  project_dir="$(cd "$(dirname "$file_path")" && pwd)"
fi
cd "$project_dir"

feedback=""

# ESLint — runs on the specific file only (fast)
eslint_out=$(npx eslint "$file_path" 2>&1)
eslint_exit=$?
if [[ $eslint_exit -ne 0 && -n "$eslint_out" ]]; then
  feedback+="=== ESLint ===\n${eslint_out}\n\n"
fi

# TypeScript — full project check to catch cross-file type errors
tsc_out=$(npx tsc --noEmit 2>&1)
tsc_exit=$?
if [[ $tsc_exit -ne 0 && -n "$tsc_out" ]]; then
  feedback+="=== TypeScript ===\n${tsc_out}\n"
fi

if [[ -n "$feedback" ]]; then
  printf "Issues found after editing %s — fix before proceeding:\n\n%b" "$file_path" "$feedback" >&2
  exit 2
fi

exit 0
