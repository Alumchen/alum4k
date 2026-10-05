#!/usr/bin/env bash
set -euo pipefail

# Reuse deployment checks and backups while requiring an existing installation.
export UPDATE_ONLY=1
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy-linux.sh"
