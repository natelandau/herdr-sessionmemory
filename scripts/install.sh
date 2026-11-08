#!/usr/bin/env bash
# Copies the mod into the Herdr home. Herdr neither hot-reloads nor loads assets
# from a symlinked mod folder, so the mod is installed as a real copy.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
dest="$home/mods/sessionmemory"
[ -L "$dest" ] && rm "$dest"
mkdir -p "$dest"
rsync -a --delete --exclude test --exclude gpui-kit.d.ts --exclude herdr.d.ts --exclude jsconfig.json \
  "$here/mods/sessionmemory/" "$dest/"
herdr-app check "$dest"
