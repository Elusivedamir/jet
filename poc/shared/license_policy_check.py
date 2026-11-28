#!/usr/bin/env python3
"""Conservative CycloneDX license inventory gate.

Only clearly permissive licenses are accepted by default. Copyleft, custom,
missing and unrecognized declarations are reported for explicit review.
This is an engineering gate, not legal advice.
"""
import argparse
import json
from pathlib import Path

DEFAULT_ALLOWED = {
    "Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause",
    "ISC", "0BSD", "Zlib", "Unlicense",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sbom", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--allow", action="append", default=[])
    args = parser.parse_args()
    allowed = DEFAULT_ALLOWED | set(args.allow)
    document = json.loads(Path(args.sbom).read_text(encoding="utf-8"))
    components = []
    review = []
    for component in document.get("components", []):
        licenses = []
        for entry in component.get("licenses") or []:
            item = entry.get("license") or {}
            license_id = item.get("id") or item.get("name") or entry.get("expression") or "UNKNOWN"
            licenses.append(str(license_id))
        licenses = sorted(set(licenses))
        accepted = bool(licenses) and all(value in allowed for value in licenses)
        record = {
            "name": component.get("name"),
            "version": component.get("version"),
            "licenses": licenses,
            "status": "ALLOWED" if accepted else "REVIEW_REQUIRED",
        }
        components.append(record)
        if not accepted:
            review.append(record)
    result = {
        "policy": "permissive-only-default",
        "allowed_licenses": sorted(allowed),
        "component_count": len(components),
        "review_required_count": len(review),
        "status": "PASS" if not review else "REVIEW_REQUIRED",
        "review_required": review,
        "components": components,
        "disclaimer": "Automated inventory only; license compatibility and obligations require human/legal review.",
    }
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("component_count", "review_required_count", "status")}, indent=2))
    if review:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
