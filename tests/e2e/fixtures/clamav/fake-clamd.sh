#!/bin/sh
set -eu

payload="$(mktemp)"
trap 'rm -f "$payload"' EXIT
cat >"$payload"
if grep -a -q 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE' "$payload"; then
  printf 'stream: Eicar-Signature FOUND\n'
else
  printf 'stream: OK\n'
fi
