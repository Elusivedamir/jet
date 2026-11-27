#!/usr/bin/env python3
"""Compare a Maven dependency:tree JSON snapshot with a committed version lock."""
import argparse
import json
from pathlib import Path


def walk(node, output):
    if all(node.get(key) for key in ("groupId", "artifactId", "version")):
        output.add(":".join((
            node["groupId"], node["artifactId"], node["version"], node.get("scope") or ""
        )))
    for child in node.get("children") or []:
        walk(child, output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tree", required=True)
    parser.add_argument("--lock", required=True)
    args = parser.parse_args()
    tree = json.loads(Path(args.tree).read_text(encoding="utf-8"))
    actual = set()
    walk(tree, actual)
    expected = {
        line.strip() for line in Path(args.lock).read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
    added, removed = sorted(actual - expected), sorted(expected - actual)
    print(f"resolved={len(actual)} locked={len(expected)} added={len(added)} removed={len(removed)}")
    if added or removed:
        for item in added:
            print("UNLOCKED:", item)
        for item in removed:
            print("NO LONGER RESOLVED:", item)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
