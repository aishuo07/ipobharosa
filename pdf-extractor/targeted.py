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
    (re.compile(r"\b(?:amounts?\s+)?in\s+(?:lakh|lakhs|lac|lacs)\b", re.I), "Lakhs"),
    (re.compile(r"\b(?:amounts?\s+)?in\s+(?:million|millions|mn)\b", re.I), "Mn"),
)

PERIOD_PATTERN = re.compile(
    r"restated\s+(consolidated|standalone)\s+(?:year|period)\s+ended\s+march\s+31,?\s*(\d{4})",
    re.I,
)

GENERIC_PERIOD_PATTERN = re.compile(
    r"(?:as\s+(?:at|of)|(?:for\s+the\s+)?(?:financial\s+)?(?:year|period)\s+ended)\s+march\s+31,?\s*(\d{4})",
    re.I,
)

MARCH_HEADER_PATTERN = re.compile(
    r"(?:\bmarch\s+31|\b31(?:st)?\s+march),?\s*(\d{4})\b",
    re.I,
)

NUMERIC_MARCH_HEADER_PATTERN = re.compile(r"\b31[-/.]0?3[-/.](\d{4})\b", re.I)

FY_HEADER_PATTERN = re.compile(r"\b(?:FY|Fiscal(?:\s+Year)?)\s*(\d{4})\b", re.I)

SUMMARY_SCOPE_PATTERN = re.compile(r"summary\s+of\s+restated\s+(consolidated|standalone)\b", re.I)

COMPACT_SUMMARY_PATTERN = re.compile(
    r"summary\s+(?:of\s+)?(?:our\s+|the\s+)?(?:selected\s+)?(?:restated\s+)?financial\s+(?:information|statements?)",
    re.I,
)

TITLE_SCOPE_PATTERN = re.compile(
    r"(?:summary[^\n]{0,100}|^)[\s\S]{0,120}?\b(consolidated|standalone)\s+financial\s+(?:statement|information)",
    re.I,
)

PAGE_BASIS_SCOPE_PATTERN = re.compile(r"\b(consolidated|standalone) basis\b", re.I)

RESTATED_SCOPE_PATTERN = re.compile(r"\brestated\s+(consolidated|standalone)\s+financial\s+information\b", re.I)

BASED_ON_SCOPE_PATTERN = re.compile(r"\bbased on the\s+(consolidated|standalone)\s+restated\b", re.I)

METRIC_ROWS = (
    ("REVENUE", re.compile(r"(?:^|\n)\s*(?:I\.?\s*)?Revenue from operations\s+([^\n]+)", re.I)),
    ("PAT", re.compile(
        r"(?:^|\n)\s*(?:VIII\.?\s*)?(?:Restated\s+)?(?:Net\s+)?Profit(?:/\(loss\))?\s+(?:after tax|for the (?:year|period)|for the year after tax)[^\n]*?\s+([^\n]+)",
        re.I,
    )),
)

SUMMARY_METRIC_ROWS = (
    ("REVENUE", re.compile(r"(?:^|\n)\s*(?:[IVX]+\.?\s+)?(?:Revenue from operations?|Total Revenue|Total Income(?:\s*\([^\n]*\))?)\s+([^\n]+)", re.I)),
    ("PAT", re.compile(r"(?:^|\n)\s*(?:[IVX]+\.?\s+)?Profit\s*/?\s*\(?loss\)?\s+after tax(?:\s+for\s+the\s+(?:period|year))?\s+([^\n]+)", re.I)),
    ("PAT", re.compile(r"(?:^|\n)\s*(?:[IVX]+\.?\s+)?Profit after Tax(?:\s+for\s+the\s+(?:period|year))?\s+([^\n]+)", re.I)),
    ("NET_WORTH", re.compile(r"(?:^|\n)\s*(?:[IVX]+\.?\s+)?Net\s*worth\s*#?\s+([^\n]+)", re.I)),
    ("BORROWINGS", re.compile(r"(?:^|\n)\s*(?:[IVX]+\.?\s+)?Total\s+Borrowings(?:\s*\([^\n]*\))?\s+([^\n]+)", re.I)),
    ("ASSETS", re.compile(r"(?:^|\n)\s*(?:[IVX]+\.?\s+)?Total\s+Assets\s+([^\n]+)", re.I)),
    ("EBITDA", re.compile(r"(?:^|\n)\s*(?:[IVX]+\.?\s+)?EBITDA(?:\s*\([^\n]*\))?\s+([^\n]+)", re.I)),
)

DOCUMENT_SCOPE_PATTERN = re.compile(
    r"restated financial information.{0,900}?\b(standalone|consolidated) basis\b",
    re.I | re.S,
)

PRESENTED_SCOPE_PATTERN = re.compile(
    r"information presented below relating to (?:the|our) company is based on (?:the )?restated\s+"
    r"(standalone|consolidated)\s+financial",
    re.I,
)

NO_SUBSIDIARY_PATTERN = re.compile(
    r"(?:does not have any subsidiary compan(?:y|ies)|has no subsidiary compan(?:y|ies))",
    re.I,
)

NO_ASSOCIATE_OR_JV_PATTERN = re.compile(
    r"(?:does not have any associate(?: compan(?:y|ies))?\s+(?:or|and)\s+joint ventures?"
    r"|does not have any associate compan(?:y|ies) or joint ventures?)",
    re.I,
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
    scope_match = (
        SUMMARY_SCOPE_PATTERN.search(text)
        or TITLE_SCOPE_PATTERN.search(text)
        or PAGE_BASIS_SCOPE_PATTERN.search(text)
        or RESTATED_SCOPE_PATTERN.search(text)
        or BASED_ON_SCOPE_PATTERN.search(text)
    )
    scope = scope_match.group(1).title() if scope_match else default_scope
    seen: set[str] = set()
    years: list[str] = []
    # March-labelled columns are unambiguously annual and take precedence
    # over interim dates that may be present on the same table.
    years = MARCH_HEADER_PATTERN.findall(text)
    if not years:
        years = NUMERIC_MARCH_HEADER_PATTERN.findall(text)
    if not years:
        years = FY_HEADER_PATTERN.findall(text)
    if len(years) <= 1:
        # Some compact summaries print one "Fiscal" label followed by a row
        # of annual years. Restrict the fallback to the immediate header block.
        fiscal_blocks = re.findall(r"\bFiscal\b([\s\S]{0,180})", text, re.I)
        block_years = max((re.findall(r"\b20\d{2}\b", block) for block in fiscal_blocks), key=len, default=[])
        if len(block_years) >= 2:
            years = block_years
    annual_years: list[str] = []
    for year in years:
        if year not in seen:
            seen.add(year)
            annual_years.append(year)

    if not annual_years:
        return []

    scopes: list[str] = []
    for line in text.splitlines():
        line_scopes = [value.title() for value in re.findall(r"\b(?:consolidated|standalone)\b", line, re.I)]
        if len(line_scopes) >= len(annual_years):
            candidate = line_scopes[-len(annual_years):]
            if default_scope is None or default_scope in candidate or len(set(candidate)) > 1:
                scopes = candidate
                break
    if not scopes:
        if not scope:
            return []
        scopes = [scope] * len(annual_years)

    periods: list[Period] = []
    for year, column_scope in zip(annual_years, scopes, strict=False):
        periods.append(Period(fiscal_year=f"31 Mar {year}", scope=column_scope))
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


def summary_metadata_prefix(text: str) -> str:
    """Keep title/header metadata, never metric values, for page continuations."""
    starts = [
        match.start()
        for _, pattern in (*SUMMARY_METRIC_ROWS, *METRIC_ROWS)
        if (match := pattern.search(text)) is not None
    ]
    prefix = text[:min(starts)] if starts else text
    # Period columns must come from the page containing the values. Reusing a
    # previous page's years can map a continuation row to the wrong fiscal year.
    prefix = MARCH_HEADER_PATTERN.sub("", prefix)
    prefix = NUMERIC_MARCH_HEADER_PATTERN.sub("", prefix)
    prefix = FY_HEADER_PATTERN.sub("", prefix)
    return prefix


def extract_summary_page(text: str, page_number: int, default_scope: str | None = None) -> list[dict]:
    """Extract only explicit restated summary columns; never infer missing metadata."""
    lowered = text.lower()
    statement_title = "statement of profit and loss" in lowered or "statement of profit & loss" in lowered
    compact_summary = COMPACT_SUMMARY_PATTERN.search(text) is not None and "restated" in lowered
    if not compact_summary and (not statement_title or ("summary" not in lowered and "restated statement" not in lowered)):
        return []
    unit = detect_unit(text)
    periods = extract_periods(text, default_scope)
    if unit is None or not periods:
        return []

    rows: list[dict] = []
    metric_rows = SUMMARY_METRIC_ROWS if compact_summary else METRIC_ROWS
    for metric, pattern in metric_rows:
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
                "tableReference": "Restated Financial Summary" if compact_summary else "Restated Statement of Profit and Loss",
                "ocrUsed": False,
                "extractionConfidence": 0.92,
            })
    return rows


def extract_from_pages(pages: Iterable[str]) -> tuple[list[dict], list[int]]:
    page_texts = [text or "" for text in pages]
    document_text = "\n".join(page_texts)
    document_scope_matches = {
        scope.title()
        for text in page_texts
        for pattern in (DOCUMENT_SCOPE_PATTERN, PRESENTED_SCOPE_PATTERN)
        for scope in pattern.findall(text)
    }
    # Use document-level scope only when the filing says exactly one thing.
    # Filings containing both standalone and consolidated statements remain
    # fail-closed unless the individual table labels its own scope.
    default_scope = next(iter(document_scope_matches)) if len(document_scope_matches) == 1 else None
    # A filing that explicitly says the issuer has neither subsidiaries nor
    # associates/JVs cannot have a group-level consolidated statement. This is
    # stronger evidence than silently treating an unlabeled table as standalone.
    if (
        default_scope is None
        and NO_SUBSIDIARY_PATTERN.search(document_text)
        and NO_ASSOCIATE_OR_JV_PATTERN.search(document_text)
    ):
        default_scope = "Standalone"
    rows: list[dict] = []
    evidence_pages: list[int] = []
    seen: set[tuple[str, str, str]] = set()
    summary_metadata = ""
    continuation_pages_left = 0
    for page_number, text in enumerate(page_texts, 1):
        if COMPACT_SUMMARY_PATTERN.search(text):
            summary_metadata = summary_metadata_prefix(text)
            continuation_pages_left = 2
        extraction_text = text
        if continuation_pages_left > 0 and summary_metadata != text:
            extraction_text = f"{text}\n{summary_metadata}"
            continuation_pages_left -= 1
        page_rows = extract_summary_page(extraction_text, page_number, default_scope)
        added_on_page = False
        for row in page_rows:
            key = (row["metric"], row["fiscalYear"], row["scope"])
            if key in seen:
                continue
            seen.add(key)
            rows.append(row)
            added_on_page = True
        if added_on_page:
            evidence_pages.append(page_number)
    return rows, evidence_pages
