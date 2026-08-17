"""Fail-closed extraction from filing summary financial statements."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class Period:
    fiscal_year: str
    scope: str


UNIT_PATTERNS = (
    (re.compile(r"(?:in\s+)?(?:₹|rs\.?)\s*(?:in\s+)?(?:million|millions|mn)\b", re.I), "Mn"),
    (re.compile(r"(?:in\s+)?(?:₹|rs\.?)\s*(?:in\s+)?(?:crore|crores|cr)\b", re.I), "Cr"),
    (re.compile(r"(?:in\s+)?(?:₹|rs\.?)\s*(?:in\s+)?(?:lakh|lakhs|lac|lacs)\b", re.I), "Lakhs"),
)

PERIOD_PATTERN = re.compile(
    r"restated\s+(consolidated|standalone)\s+(?:year|period)\s+ended\s+march\s+31,?\s*(\d{4})",
    re.I,
)

GENERIC_PERIOD_PATTERN = re.compile(
    r"(?:as\s+(?:at|of)|(?:for\s+the\s+)?(?:financial\s+)?(?:year|period)\s+ended)\s+march\s+31,?\s*(\d{4})",
    re.I,
)

MARCH_HEADER_PATTERN = re.compile(r"\bmarch\s+31,?\s*(\d{4})\b", re.I)

SUMMARY_SCOPE_PATTERN = re.compile(r"summary\s+of\s+restated\s+(consolidated|standalone)\b", re.I)

METRIC_ROWS = (
    ("REVENUE", re.compile(r"(?:^|\n)\s*(?:I\.?\s*)?Revenue from operations\s+([^\n]+)", re.I)),
    ("PAT", re.compile(
        r"(?:^|\n)\s*(?:VIII\.?\s*)?(?:Restated\s+)?(?:Net\s+)?Profit(?:/\(loss\))?\s+(?:after tax|for the (?:year|period)|for the year after tax)[^\n]*?\s+([^\n]+)",
        re.I,
    )),
)

DOCUMENT_SCOPE_PATTERN = re.compile(
    r"restated financial information.{0,900}?\b(standalone|consolidated) basis\b",
    re.I | re.S,
)


def detect_unit(text: str) -> str | None:
    for pattern, unit in UNIT_PATTERNS:
        if pattern.search(text):
            return unit
    return None


def extract_periods(text: str, default_scope: str | None = None) -> list[Period]:
    explicit = [
        Period(fiscal_year=f"31 Mar {year}", scope=scope.title())
        for scope, year in PERIOD_PATTERN.findall(text)
    ]
    if explicit:
        return explicit
    scope_match = SUMMARY_SCOPE_PATTERN.search(text)
    scope = scope_match.group(1).title() if scope_match else default_scope
    if not scope:
        return []
    seen: set[str] = set()
    periods: list[Period] = []
    years = GENERIC_PERIOD_PATTERN.findall(text)
    if not years:
        years = MARCH_HEADER_PATTERN.findall(text)
    for year in years:
        if year in seen:
            continue
        seen.add(year)
        periods.append(Period(fiscal_year=f"31 Mar {year}", scope=scope))
    return periods


def parse_values(text: str) -> list[str | None]:
    tokens = re.findall(r"\([\d,]+(?:\.\d+)?\)|-?[\d,]+(?:\.\d+)?|-", text)
    values: list[str | None] = []
    for token in tokens:
        if token == "-":
            values.append(None)
        else:
            values.append(token)
    return values


def extract_summary_page(text: str, page_number: int, default_scope: str | None = None) -> list[dict]:
    """Extract only explicit restated summary columns; never infer missing metadata."""
    lowered = text.lower()
    statement_title = "statement of profit and loss" in lowered or "statement of profit & loss" in lowered
    if not statement_title or ("summary" not in lowered and "restated statement" not in lowered):
        return []
    unit = detect_unit(text)
    periods = extract_periods(text, default_scope)
    if unit is None or not periods:
        return []

    rows: list[dict] = []
    for metric, pattern in METRIC_ROWS:
        match = pattern.search(text)
        if not match:
            continue
        # Labels sometimes contain numeric-looking note references or formula
        # punctuation before the actual period columns. Filing tables put the
        # period values at the right edge, so align from the end.
        values = parse_values(match.group(1))[-len(periods):]
        if len(values) < len(periods):
            continue
        for period, value in zip(periods, values, strict=False):
            if value is None:
                continue
            rows.append({
                "metric": metric,
                "originalLabel": match.group(0).strip().split("\n")[0],
                "rawValue": f"₹{value} {unit}",
                "fiscalYear": period.fiscal_year,
                "scope": period.scope,
                "auditStatus": "Restated",
                "pageNumber": page_number,
                "tableReference": "Restated Statement of Profit and Loss",
                "ocrUsed": False,
                "extractionConfidence": 0.92,
            })
    return rows


def extract_from_pages(pages: Iterable[str]) -> tuple[list[dict], list[int]]:
    page_texts = [text or "" for text in pages]
    document_scope_matches = {
        scope.title()
        for text in page_texts
        for scope in DOCUMENT_SCOPE_PATTERN.findall(text)
    }
    # Use document-level scope only when the filing says exactly one thing.
    # Filings containing both standalone and consolidated statements remain
    # fail-closed unless the individual table labels its own scope.
    default_scope = next(iter(document_scope_matches)) if len(document_scope_matches) == 1 else None
    rows: list[dict] = []
    evidence_pages: list[int] = []
    seen: set[tuple[str, str, str]] = set()
    for page_number, text in enumerate(page_texts, 1):
        page_rows = extract_summary_page(text, page_number, default_scope)
        if page_rows:
            evidence_pages.append(page_number)
        for row in page_rows:
            key = (row["metric"], row["fiscalYear"], row["scope"])
            if key in seen:
                continue
            seen.add(key)
            rows.append(row)
    return rows, evidence_pages
