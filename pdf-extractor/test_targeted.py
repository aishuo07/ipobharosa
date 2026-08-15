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

INDO_MIM_SAMPLE = """
SUMMARY OF RESTATED CONSOLIDATED STATEMENT OF PROFIT AND LOSS
(in ₹ million)
Particulars As at March 31, 2026 As at March 31, 2025 As at March 31, 2024
Income
Revenue from operations 41,929.85 33,295.77 28,703.95
Other income 1,277.17 443.95 299.87
Restated profit before tax 7,337.40 5,810.03 4,352.05
Restated profit for the year 5,335.43 4,237.34 2,837.34
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

    def test_extracts_exchange_rhp_summary_layout_with_shared_scope(self):
        rows = extract_summary_page(INDO_MIM_SAMPLE, 66)
        self.assertEqual(len(rows), 6)
        self.assertEqual(
            [(row["metric"], row["fiscalYear"], row["scope"], row["rawValue"]) for row in rows],
            [
                ("REVENUE", "31 Mar 2026", "Consolidated", "₹41,929.85 Mn"),
                ("REVENUE", "31 Mar 2025", "Consolidated", "₹33,295.77 Mn"),
                ("REVENUE", "31 Mar 2024", "Consolidated", "₹28,703.95 Mn"),
                ("PAT", "31 Mar 2026", "Consolidated", "₹5,335.43 Mn"),
                ("PAT", "31 Mar 2025", "Consolidated", "₹4,237.34 Mn"),
                ("PAT", "31 Mar 2024", "Consolidated", "₹2,837.34 Mn"),
            ],
        )
        self.assertTrue(all(row["auditStatus"] == "Restated" and row["pageNumber"] == 66 for row in rows))


if __name__ == "__main__":
    unittest.main()
