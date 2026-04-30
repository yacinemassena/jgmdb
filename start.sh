#!/bin/sh
set -e
if [ -x ./jgmdb ]; then
  exec ./jgmdb
fi
exec go run main.go
