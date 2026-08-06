#!/usr/bin/env bash
# Local/dev compile. Stamps the binary's version from `git describe` so
# `./ellipsis --version` reports exactly what it was built from, e.g.
# "0.1.0-2-g08ea24d-dirty" = 2 commits past v0.1.0 at 08ea24d with
# uncommitted changes (a tagged, clean checkout reads the bare "0.1.0").
set -euo pipefail
cd "$(dirname "$0")/.."
version="$(git describe --tags --always --dirty | sed 's/^v//')"
exec bun build src/cli.ts --compile --outfile ellipsis \
  --define "BUILD_GIT_VERSION=\"${version}\""
