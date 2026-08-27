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

COMPACT_CONSOLIDATED_SUMMARY = """
G. SUMMARY OF RESTATED FINANCIAL INFORMATION
CONSOLIDATED FINANCIAL STATEMENT (₹ in Lakhs)
Particulars For the financial year ended on
March 31, 2025 March 31, 2024 March 31, 2023
Networth 9,731.50 5,980.77 5,315.78
Total Revenue 12,506.85 5,498.76 3,169.48
Profit after Tax 1,721.86 665.00 (827.54)
Total Borrowings 9.44 44.27 90.00
Basic EPS (₹) 13.37 5.17 6.43
"""

FY_STANDALONE_SUMMARY = """
SUMMARY OF RESTATED FINANCIAL INFORMATION
The table is derived from the Restated Financial Information on a standalone basis.
(in ₹ lakhs unless indicated otherwise)
Particulars Six months ended September 30, 2025 FY 2025 FY 2024 FY 2023
Net worth 1,503.41 1,002.62 391.74 133.90
Revenue from Operations 1,231.22 1,008.65 458.30 481.71
Profit/(loss) after tax 396.49 290.42 34.38 (68.08)
Total Borrowings 374.51 101.36 32.46 150.95
"""

UNLABELED_ISSUER_SUMMARY = """
SUMMARY OF OUR FINANCIAL STATEMENTS
ANNEXURE-I: RESTATED STATEMENT OF ASSETS AND LIABILITIES
(All amounts in Lakhs, except as otherwise stated)
Particulars 31-03-2025 31-03-2024 31-03-2023
Total Assets 13,592.27 9,674.69 9,094.34
Revenue from Operations 15,000.00 12,000.00 10,000.00
Profit after Tax 1,500.00 1,200.00 1,000.00
"""

MIXED_SCOPE_STATEMENT = """
SUMMARY OF FINANCIAL INFORMATION
Derived from the Restated Consolidated and Standalone Financial Information.
All amounts are in ₹ Millions unless otherwise stated
Particulars 31st March, 2026 31st March, 2025 31st March, 2024
Consolidated Consolidated Standalone
Total Assets 3,053.06 2,948.58 1,498.15
Revenue from operations 4,500.00 4,000.00 3,000.00
Profit after tax 300.00 250.00 180.00
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

    def test_extracts_compact_consolidated_summary_without_treating_eps_as_crores(self):
        rows = extract_summary_page(COMPACT_CONSOLIDATED_SUMMARY, 28)
        self.assertEqual(len(rows), 12)
        self.assertEqual({row["metric"] for row in rows}, {"REVENUE", "PAT", "NET_WORTH", "BORROWINGS"})
        self.assertTrue(all(row["scope"] == "Consolidated" for row in rows))
        self.assertFalse(any(row["metric"] == "EPS" for row in rows))

    def test_ignores_interim_column_and_extracts_fy_annual_columns(self):
        rows = extract_summary_page(FY_STANDALONE_SUMMARY, 62)
        self.assertEqual(len(rows), 12)
        self.assertEqual({row["fiscalYear"] for row in rows}, {"31 Mar 2025", "31 Mar 2024", "31 Mar 2023"})
        self.assertTrue(all(row["scope"] == "Standalone" for row in rows))
        revenue_2025 = next(row for row in rows if row["metric"] == "REVENUE" and row["fiscalYear"] == "31 Mar 2025")
        self.assertEqual(revenue_2025["rawValue"], "₹1,008.65 Lakhs")

    def test_preserves_explicit_mixed_scope_per_annual_column(self):
        rows = extract_summary_page(MIXED_SCOPE_STATEMENT, 78)
        revenue = [row for row in rows if row["metric"] == "REVENUE"]
        self.assertEqual(
            [(row["fiscalYear"], row["scope"]) for row in revenue],
            [("31 Mar 2026", "Consolidated"), ("31 Mar 2025", "Consolidated"), ("31 Mar 2024", "Standalone")],
        )

    def test_compact_summary_still_fails_closed_without_scope_or_unit(self):
        no_scope = COMPACT_CONSOLIDATED_SUMMARY.replace("CONSOLIDATED FINANCIAL STATEMENT", "FINANCIAL STATEMENT")
        no_unit = COMPACT_CONSOLIDATED_SUMMARY.replace("(₹ in Lakhs)", "")
        self.assertEqual(extract_summary_page(no_scope, 1), [])
        self.assertEqual(extract_summary_page(no_unit, 1), [])

    def test_uses_standalone_only_when_filing_explicitly_has_no_group_entities(self):
        issuer_context = """
        Our Company does not have any subsidiary companies.
        Our Company does not have any associate or joint ventures.
        """
        rows, evidence_pages = extract_from_pages([issuer_context, UNLABELED_ISSUER_SUMMARY])
        self.assertEqual(evidence_pages, [2])
        self.assertEqual(len(rows), 9)
        self.assertTrue(all(row["scope"] == "Standalone" for row in rows))

        ambiguous_rows, _ = extract_from_pages([
            "Our Company does not have any subsidiary companies.",
            UNLABELED_ISSUER_SUMMARY,
        ])
        self.assertEqual(ambiguous_rows, [])

    def test_page_context_never_reuses_old_metric_values(self):
        continuation = """
        RESTATED STATEMENT OF PROFIT AND LOSS
        (₹ in Lakhs)
        Particulars March 31, 2022 March 31, 2021 March 31, 2020
        Revenue from operations 900.00 800.00 700.00
        Profit after tax 90.00 80.00 70.00
        """
        rows, evidence_pages = extract_from_pages([COMPACT_CONSOLIDATED_SUMMARY, continuation])
        self.assertEqual(evidence_pages, [1, 2])
        assets = [row for row in rows if row["metric"] == "ASSETS"]
        self.assertEqual(assets, [])
        revenue = [row for row in rows if row["metric"] == "REVENUE"]
        self.assertEqual(len(revenue), 6)
        revenue_2022 = next(row for row in revenue if row["fiscalYear"] == "31 Mar 2022")
        self.assertEqual(revenue_2022["rawValue"], "₹900.00 Lakhs")


if __name__ == "__main__":
    unittest.main()
