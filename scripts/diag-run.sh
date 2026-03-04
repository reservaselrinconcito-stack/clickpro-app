#!/bin/bash
BIN="src-tauri/target/debug/contikpro-core"
export RUST_BACKTRACE=1
export RUST_LOG=debug
echo "Running $BIN..."
"$BIN" 2>&1 | tee .diagnostics/run-bin-debug.txt
