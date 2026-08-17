#!/usr/bin/env python3
"""
RHP/DRHP Financial Table Extraction
Parses Indian IPO prospectus documents and extracts financial metrics.
"""

import re
import requests
import json
import sys
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse
import hashlib
from io import BytesIO
from pypdf import PdfReader
from filing_archive import MAX_DOWNLOAD_BYTES, extract_filing_pdf_bytes, filing_request_headers
from targeted import extract_from_pages

# Financial metric keywords
METRICS_MAP = {
    "revenue from operations": "REVENUE",
    "revenue from operation": "REVENUE",
    "total revenue": "REVENUE",
    "net revenue": "REVENUE",
    "total income": "REVENUE",
    "profit before tax": "PAT",
    "profit after tax": "PAT",
    "pbt": "PAT",
    "pat": "PAT",
    "net profit": "PAT",
    "ebitda": "EBITDA",
    "operating profit": "EBITDA",
    "earnings before interest": "EBITDA",
    "total assets": "ASSETS",
    "assets": "ASSETS",
    "net worth": "NET_WORTH",
    "equity": "NET_WORTH",
    "shareholders equity": "NET_WORTH",
    "net borrowings": "BORROWINGS",
    "borrowings": "BORROWINGS",
    "debt": "BORROWINGS",
    "earnings per share": "EPS",
    "eps": "EPS",
}

FY_PATTERNS = [
    r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})",
    r"(\d{4})[–\-](\d{2,4})",
    r"FY\s*(\d{2,4})[–\-](\d{2,4})",
]


def parse_number(text: str) -> Optional[float]:
    """Parse Indian financial numbers: ₹3,449.96 Mn → 3449.96"""
    if not text or not str(text).strip():
        return None

    text = str(text).strip()
    # Remove currency symbols and common text
    text = re.sub(r'[₹€$]', '', text)
    text = re.sub(r'(million|million|crore|cr|mn|lakh)', '', text, flags=re.IGNORECASE)
    text = text.strip()

    # Handle parentheses as negatives
    if text.startswith('(') and text.endswith(')'):
        text = '-' + text[1:-1]

    # Remove commas and parse
    try:
        text = text.replace(',', '')
        value = float(text)

        # Sanity check: Indian financials usually ₹10 Cr to ₹100,000 Cr
        if value < 0 or value > 999_999_999:
            return None

        return value
    except:
        return None

def parse_fiscal_year(text: str) -> Optional[str]:
    """Extract fiscal year from text. Returns 'DD Mon YYYY' format."""
    if not text:
        return None

    text = str(text)

    for pattern in FY_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            groups = match.groups()
            if len(groups) >= 3:
                try:
                    day = groups[0]
                    month = groups[1][:3] if len(groups[1]) > 0 else "Jan"
                    year = groups[2]
                    return f"{day} {month} {year}"
                except:
                    pass
            elif len(groups) == 2:
                # FY format like 2023-24
                year = groups[0]
                return f"31 Mar {year}"

    return None

def extract_from_pdf(pdf_url: str, ipo_id: str, doc_type: str) -> Dict[str, Any]:
    """
    Download and extract financial tables from RHP/DRHP PDF.

    Returns:
    {
        "rawExtractions": [
            {
                "metric": "REVENUE",
                "originalLabel": "Revenue from Operations (Net)",
                "rawValue": "₹3,449.96 Cr",
                "fiscalYear": "31 Mar 2026",
                "scope": "Consolidated",
                "auditStatus": "Audited",
                "pageNumber": 12,
                "tableReference": "Table 5.1",
                "ocrUsed": false,
                "extractionConfidence": 0.85
            },
            ...
        ],
        "pageCount": 45,
        "extractionQuality": "HIGH|MEDIUM|LOW",
        "issues": []
    }
    """

    issues = []
    extractions = []
    page_count = 0

    try:
        # Download PDF
        print(f"⬇️  Downloading {pdf_url}...")
        parsed_url = urlparse(pdf_url)
        if parsed_url.scheme != "https":
            raise ValueError("Only HTTPS PDF sources are allowed")

        response = requests.get(pdf_url, headers=filing_request_headers(), timeout=30)
        if response.status_code != 200:
            return {
                "rawExtractions": [],
                "pageCount": 0,
                "extractionQuality": "LOW",
                "issues": [f"Failed to fetch PDF: HTTP {response.status_code}"]
            }

        download_bytes = response.content
        if len(download_bytes) > MAX_DOWNLOAD_BYTES:
            raise ValueError("Filing download exceeds the 50 MB safety limit")
        pdf_bytes, archive_entry = extract_filing_pdf_bytes(download_bytes, doc_type)
        if archive_entry:
            print(f"📦 Selected {archive_entry} from official ZIP")

        document_sha256 = hashlib.sha256(pdf_bytes).hexdigest()

        reader = PdfReader(BytesIO(pdf_bytes))
        page_count = len(reader.pages)
        print(f"📄 PDF has {page_count} pages")
        print("🔍 Locating explicit summary/restated financial statements...")
        page_texts = ((page.extract_text() or "") for page in reader.pages)
        extractions, evidence_pages = extract_from_pages(page_texts)
        if evidence_pages:
            print(f"  📊 Filing-backed summary found on PDF page(s): {', '.join(map(str, evidence_pages))}")

        # Dedup by metric + fiscal year
        seen = set()
        unique = []
        for e in extractions:
            key = f"{e['metric']}:{e['fiscalYear']}"
            if key not in seen:
                seen.add(key)
                unique.append(e)

        quality = "HIGH" if len(unique) >= 6 else "MEDIUM" if len(unique) >= 3 else "LOW"

        if len(unique) == 0:
            issues.append(f"No complete, filing-backed summary metrics detected in {page_count} pages")

        print(f"\n✅ Extracted {len(unique)} metrics (quality: {quality})")

        return {
            "rawExtractions": unique,
            "pageCount": page_count,
            "extractionQuality": quality,
            "issues": issues,
            "document": {
                "sourceUrl": pdf_url,
                "documentType": doc_type,
                "sha256": document_sha256,
                "pageCount": page_count,
                "archiveEntry": archive_entry
            }
        }

    except Exception as e:
        return {
            "rawExtractions": [],
            "pageCount": 0,
            "extractionQuality": "LOW",
            "issues": [f"PDF extraction error: {str(e)}"]
        }

def extract_from_lines(lines: List[str], page_num: int) -> List[Dict]:
    """Extract metrics from text lines."""
    extractions = []

    for i, line in enumerate(lines):
        line_lower = line.lower()

        # Find matching metric
        metric = None
        matched_keyword = None
        for keyword, metric_name in METRICS_MAP.items():
            if keyword in line_lower:
                metric = metric_name
                matched_keyword = keyword
                break

        if not metric:
            continue

        # Look ahead for numbers
        for look_ahead in range(min(3, len(lines) - i - 1)):
            next_line = lines[i + look_ahead]
            value = parse_number(next_line)

            if value is not None:
                # Try to find fiscal year in surrounding context
                fy = None
                for look_back in range(max(0, i - 5), min(len(lines), i + 5)):
                    fy_candidate = parse_fiscal_year(lines[look_back])
                    if fy_candidate:
                        fy = fy_candidate
                        break

                if not fy:
                    # Do not manufacture a reporting period. Keep the
                    # candidate visibly incomplete for human review.
                    fy = "UNKNOWN"

                extractions.append({
                    "metric": metric,
                    "originalLabel": matched_keyword.title(),
                    "rawValue": f"₹{value}",
                    "fiscalYear": fy,
                    "scope": "UNKNOWN",
                    "auditStatus": "UNKNOWN",
                    "pageNumber": page_num,
                    "tableReference": f"Page {page_num}",
                    "ocrUsed": False,
                    "extractionConfidence": 0.75
                })
                break

    return extractions

def extract_from_table(table: List[List[str]], page_num: int, table_idx: int) -> List[Dict]:
    """Extract metrics from a structured table."""
    extractions = []

    if not table or len(table) < 2:
        return extractions

    # Assume first row is header, subsequent rows are data
    for row_idx, row in enumerate(table[1:], 1):
        if not row or len(row) < 2:
            continue

        label = str(row[0]).lower() if row[0] else ""
        value_str = str(row[-1]) if row[-1] else ""  # Last column likely is the value

        # Match metric
        metric = None
        for keyword, metric_name in METRICS_MAP.items():
            if keyword in label:
                metric = metric_name
                break

        if not metric:
            continue

        value = parse_number(value_str)
        if value is None:
            continue

        extractions.append({
            "metric": metric,
            "originalLabel": label.title(),
            "rawValue": f"₹{value}",
            "fiscalYear": "UNKNOWN",
            "scope": "UNKNOWN",
            "auditStatus": "UNKNOWN",
            "pageNumber": page_num,
            "tableReference": f"Table {table_idx + 1}",
            "ocrUsed": False,
            "extractionConfidence": 0.80
        })

    return extractions

def submit_to_api(base_url: str, ipo_id: str, extractions: Dict, admin_token: str) -> bool:
    """Submit extracted financials to the main app API."""

    if not extractions['rawExtractions']:
        print("⚠️  No extractions to submit")
        return False

    url = f"{base_url}/api/admin/submit-extracted-financials"

    payload = {
        "ipoId": ipo_id,
        "document": extractions["document"],
        "extractions": extractions['rawExtractions']
    }

    headers = {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }

    try:
        print(f"📤 Submitting {len(extractions['rawExtractions'])} metrics to {url}...")
        response = requests.post(url, json=payload, headers=headers, timeout=30)

        if response.status_code == 200:
            print("✅ Submitted successfully!")
            return True
        else:
            print(f"❌ API error: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Submission error: {str(e)}")
        return False

if __name__ == "__main__":
    import os

    if len(sys.argv) < 3:
        print("Usage: python extract.py <RHP_URL> <IPO_ID> [DOC_TYPE] [API_BASE] [ADMIN_TOKEN] [--submit]")
        print("\nExample:")
        print("  python extract.py https://example.com/technocraft-rhp.pdf abc123 RHP http://localhost:3000 token123")
        sys.exit(1)

    pdf_url = sys.argv[1]
    ipo_id = sys.argv[2]
    doc_type = sys.argv[3] if len(sys.argv) > 3 else "RHP"
    api_base = sys.argv[4] if len(sys.argv) > 4 else "http://localhost:3000"
    admin_token = os.getenv("ADMIN_TOKEN")
    should_submit = "--submit" in sys.argv[5:]

    print(f"\n🚀 Extracting from: {pdf_url}")
    print(f"   IPO: {ipo_id} | Type: {doc_type}\n")

    result = extract_from_pdf(pdf_url, ipo_id, doc_type)

    print(f"\n📊 Result:")
    print(json.dumps(result, indent=2))

    # Extraction is review-only by default. Submission requires both an
    # explicit flag and a configured Development token.
    if should_submit and result['rawExtractions']:
        if not admin_token:
            print("❌ ADMIN_TOKEN is required with --submit")
            sys.exit(1)
        submit_to_api(api_base, ipo_id, result, admin_token)
    elif result['rawExtractions']:
        print("\nℹ️  Candidates were not submitted. Re-run with ADMIN_TOKEN and --submit after reviewing the JSON evidence.")
