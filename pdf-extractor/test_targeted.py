import unittest

from targeted import detect_unit, extract_from_pages, extract_periods, extract_summary_page


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

AASHTA_CONTEXT = """
The Restated Financial Information comprising the restated statement of assets and liabilities
for the Financial Years ended March 31, 2025, March 31, 2024 and March 31, 2023,
which is on a standalone basis, and the restated statement of profit and loss.
"""

AASHTA_STATEMENT = """
RESTATED STATEMENT OF PROFIT & LOSS
(All amounts are in ₹ lakhs)
Particulars December 31, 2025 March 31, 2025 March 31, 2024 March 31, 2023
Revenue from operations 31,328.50 35,116.02 30,486.16 23,926.50
Net profit for the year after tax 1,755.62 2,291.62 1,628.76 105.83
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

    def test_extracts_real_rhp_lakh_layout_using_explicit_document_scope(self):
        rows, evidence_pages = extract_from_pages([AASHTA_CONTEXT, AASHTA_STATEMENT])

        self.assertEqual(evidence_pages, [2])
        self.assertEqual(
            [(row["metric"], row["fiscalYear"], row["scope"], row["rawValue"]) for row in rows],
            [
                ("REVENUE", "31 Mar 2025", "Standalone", "₹35,116.02 Lakhs"),
                ("REVENUE", "31 Mar 2024", "Standalone", "₹30,486.16 Lakhs"),
                ("REVENUE", "31 Mar 2023", "Standalone", "₹23,926.50 Lakhs"),
                ("PAT", "31 Mar 2025", "Standalone", "₹2,291.62 Lakhs"),
                ("PAT", "31 Mar 2024", "Standalone", "₹1,628.76 Lakhs"),
                ("PAT", "31 Mar 2023", "Standalone", "₹105.83 Lakhs"),
            ],
        )

    def test_does_not_guess_document_scope_when_both_scopes_are_present(self):
        mixed_context = AASHTA_CONTEXT + " Restated Financial Information is also on a consolidated basis."
        rows, _ = extract_from_pages([mixed_context, AASHTA_STATEMENT])
        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
