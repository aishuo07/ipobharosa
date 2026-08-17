import io
import unittest
import zipfile

from filing_archive import extract_filing_pdf_bytes, filing_request_headers


def archive(entries):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as value:
        for name, content in entries.items():
            value.writestr(name, content)
    return output.getvalue()


class FilingDownloadTests(unittest.TestCase):
    def test_requests_pdf_and_archive_bytes_with_identified_user_agent(self):
        headers = filing_request_headers()
        self.assertIn("IPOBharosa/1.0", headers["User-Agent"])
        self.assertIn("application/pdf", headers["Accept"])
        self.assertIn("application/zip", headers["Accept"])

    def test_keeps_direct_pdf_bytes(self):
        content = b"%PDF-direct"
        self.assertEqual(extract_filing_pdf_bytes(content, "RHP"), (content, None))

    def test_selects_requested_rhp_from_zip(self):
        content = archive({
            "docs/company_DRHP.pdf": b"%PDF-draft",
            "docs/company_RHP.pdf": b"%PDF-final",
            "readme.txt": b"ignore",
        })
        self.assertEqual(
            extract_filing_pdf_bytes(content, "RHP"),
            (b"%PDF-final", "docs/company_RHP.pdf"),
        )

    def test_rejects_ambiguous_requested_filing(self):
        content = archive({"one_RHP.pdf": b"%PDF-one", "two_RHP.pdf": b"%PDF-two"})
        with self.assertRaisesRegex(ValueError, "ambiguous RHP"):
            extract_filing_pdf_bytes(content, "RHP")

    def test_rejects_non_filing_download(self):
        with self.assertRaisesRegex(ValueError, "PDF or ZIP"):
            extract_filing_pdf_bytes(b"<html>blocked</html>", "RHP")

    def test_rejects_archive_beyond_entry_limit(self):
        content = archive({f"entry-{index}.txt": b"ignored" for index in range(101)})
        with self.assertRaisesRegex(ValueError, "100 entry safety limit"):
            extract_filing_pdf_bytes(content, "RHP")


if __name__ == "__main__":
    unittest.main()
