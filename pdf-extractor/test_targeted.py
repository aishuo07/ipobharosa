import unittest

from targeted import detect_unit, extract_periods, extract_summary_page


LOHIA_SAMPLE = """
SUMMARY OF RESTATED STATEMENT OF PROFIT AND LOSS
(All amounts are in ₹ in million, unless otherwise stated)
Particulars Restated consolidated Year ended March 31, 2026
Restated consolidated Year ended March 31, 2025
Restated standalone Year ended March 31, 2024
I. Revenue from operations 17,169.95 13,768.72 -
VIII. Profit/(loss) for the year/period (VI-VII) 1,934.52 1,178.41 (0.09)
Basic earning per share (₹) 18.31 13.70 (0.90)
"""


class TargetedExtractionTests(unittest.TestCase):
    def test_detects_explicit_unit_and_period_scope(self):
        self.assertEqual(detect_unit(LOHIA_SAMPLE), "Mn")
        self.assertEqual(
            [(p.fiscal_year, p.scope) for p in extract_periods(LOHIA_SAMPLE)],
            [("31 Mar 2026", "Consolidated"), ("31 Mar 2025", "Consolidated"), ("31 Mar 2024", "Standalone")],
        )

    def test_extracts_only_values_with_complete_metadata(self):
        rows = extract_summary_page(LOHIA_SAMPLE, 77)
        self.assertEqual(len(rows), 5)
        revenue_2026 = next(r for r in rows if r["metric"] == "REVENUE" and r["fiscalYear"] == "31 Mar 2026")
        self.assertEqual(revenue_2026["rawValue"], "₹17,169.95 Mn")
        self.assertEqual(revenue_2026["scope"], "Consolidated")
        self.assertEqual(revenue_2026["auditStatus"], "Restated")
        self.assertEqual(revenue_2026["pageNumber"], 77)
        pat_2026 = next(r for r in rows if r["metric"] == "PAT" and r["fiscalYear"] == "31 Mar 2026")
        self.assertEqual(pat_2026["rawValue"], "₹1,934.52 Mn")

    def test_fails_closed_without_unit_or_periods(self):
        self.assertEqual(extract_summary_page("SUMMARY OF RESTATED STATEMENT OF PROFIT AND LOSS\nRevenue from operations 10", 3), [])

    def test_does_not_parse_non_summary_mentions(self):
        self.assertEqual(extract_summary_page("Revenue from operations ₹10 million", 3), [])


if __name__ == "__main__":
    unittest.main()
