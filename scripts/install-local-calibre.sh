#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="$ROOT_DIR/tools/calibre"
LIB_DIR="$ROOT_DIR/tools/calibre-libs"
LIB_ARCH_DIR="$LIB_DIR/usr/lib/x86_64-linux-gnu"

mkdir -p "$INSTALL_DIR"

if [ ! -e "$LIB_ARCH_DIR/libxcb-cursor.so.0" ]; then
  mkdir -p "$LIB_DIR"
  tmpdir="$(mktemp -d)"
  cleanup() {
    rm -rf "$tmpdir"
  }
  trap cleanup EXIT

  (
    cd "$tmpdir"
    apt-get download libxcb-cursor0
    dpkg-deb -x ./*.deb "$LIB_DIR"
  )
fi

wget -nv -O- https://download.calibre-ebook.com/linux-installer.sh \
  | LD_LIBRARY_PATH="$LIB_ARCH_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" sh /dev/stdin install_dir="$INSTALL_DIR" isolated=1

if [ -x "$INSTALL_DIR/ebook-convert" ]; then
  EBOOK_CONVERT="$INSTALL_DIR/ebook-convert"
else
  EBOOK_CONVERT="$INSTALL_DIR/calibre/ebook-convert"
fi

LD_LIBRARY_PATH="$LIB_ARCH_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" "$EBOOK_CONVERT" --version
