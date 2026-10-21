#!/bin/sh
cd "$(dirname "$0")"
mkdir -p out
javac -encoding UTF-8 -d out src/medifind/*.java || { echo "Compilation failed. Install JDK 11+"; exit 1; }
java -cp out medifind.Server "$@"
