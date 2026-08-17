#!/usr/bin/env python3
"""Extract complete filing-backed candidates and submit them for human review."""

from __future__ import annotations

import os
import sys

import requests

from extract import extract_from_pdf
from filing_archive import filing_source_candidates


def main() -> int:
    base_url = os.environ.get("API_BASE", "https://ipobharosa.vercel.app").rstrip("/")
    token = os.environ.get("ADMIN_TOKEN")
    if not token:
        print("ADMIN_TOKEN is required", file=sys.stderr)
        return 2
    headers = {"Authorization": f"Bearer {token}"}
    queue = requests.get(
        f"{base_url}/api/admin/submit-extracted-financials",
        headers=headers,
        timeout=30,
    )
    queue.raise_for_status()
    documents = queue.json().get("documents", [])
    print(f"Found {len(documents)} unprocessed filing(s)")

    submitted = 0
    skipped = 0
    failed = 0
    for document in documents:
        name = document["companyName"]
        print(f"\n=== {name} ===")
        result = None
        for position, source_url in enumerate(filing_source_candidates(document["sourceUrl"])):
            if position > 0:
                print(f"OFFICIAL MIRROR: retrying from {source_url}")
            result = extract_from_pdf(source_url, document["ipoId"], document["documentType"])
            if result.get("rawExtractions"):
                break
            issues = result.get("issues", [])
            if not any("HTTP 403" in issue or "HTTP 406" in issue for issue in issues):
                break
        assert result is not None
        rows = result.get("rawExtractions", [])
        if not rows:
            skipped += 1
            print(f"SKIP: {'; '.join(result.get('issues', [])) or 'no complete summary rows'}")
            continue
        response = requests.post(
            f"{base_url}/api/admin/submit-extracted-financials",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "ipoId": document["ipoId"],
                "document": result["document"],
                "extractions": rows,
            },
            timeout=45,
        )
        if response.ok:
            submitted += 1
            print(f"QUEUED: {len(rows)} candidate(s) for human review")
        else:
            failed += 1
            print(f"FAILED: HTTP {response.status_code} {response.text[:500]}")

    print(f"\nSummary: submitted={submitted} skipped={skipped} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
