"""Bounded, deterministic selection of an RHP/DRHP PDF from official downloads."""

import io
import re
import zipfile

MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
MAX_PDF_BYTES = 50 * 1024 * 1024
MAX_ZIP_ENTRIES = 100
MAX_TOTAL_PDF_BYTES = 75 * 1024 * 1024


def filing_name_score(name: str, doc_type: str) -> int:
    words = re.sub(r"[^a-z0-9]+", " ", name.lower()).strip().split()
    joined = " ".join(words)
    if doc_type.upper() == "DRHP":
        if "drhp" in words:
            return 3
        if "draft red herring prospectus" in joined:
            return 2
        return 0
    if "rhp" in words and "drhp" not in words:
        return 3
    if "red herring prospectus" in joined and "draft red herring prospectus" not in joined:
        return 2
    return 0


def extract_filing_pdf_bytes(download: bytes, doc_type: str) -> tuple[bytes, str | None]:
    """Return PDF bytes from a direct PDF or a bounded official ZIP archive."""
    if download.startswith(b"%PDF-"):
        if len(download) > MAX_PDF_BYTES:
            raise ValueError("PDF exceeds the 50 MB extraction limit")
        return download, None
    if not download.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        raise ValueError("Source did not return a PDF or ZIP archive")

    with zipfile.ZipFile(io.BytesIO(download)) as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ZIP_ENTRIES:
            raise ValueError(f"Official ZIP exceeds {MAX_ZIP_ENTRIES} entry safety limit")
        pdfs = [info for info in infos if not info.is_dir() and info.filename.lower().endswith(".pdf")]
        if not pdfs:
            raise ValueError("Official ZIP contains no PDF filing")
        if any(info.flag_bits & 0x1 for info in pdfs):
            raise ValueError("Encrypted ZIP filing entries are not supported")
        if any(info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED) for info in pdfs):
            raise ValueError("Unsupported ZIP compression method")
        if any(info.file_size > MAX_PDF_BYTES for info in pdfs):
            raise ValueError("Official ZIP contains a PDF over the 50 MB safety limit")
        if sum(info.file_size for info in pdfs) > MAX_TOTAL_PDF_BYTES:
            raise ValueError("Official ZIP PDFs exceed the expanded byte safety limit")

        scored = [(filing_name_score(info.filename, doc_type), info) for info in pdfs]
        best_score = max(score for score, _ in scored)
        best = [info for score, info in scored if score == best_score]
        if best_score == 0 and len(pdfs) == 1:
            selected = pdfs[0]
        elif best_score == 0 or len(best) != 1:
            raise ValueError(f"Official ZIP has ambiguous {doc_type.upper()} PDF entries")
        else:
            selected = best[0]
        pdf_bytes = archive.read(selected)
        if len(pdf_bytes) > MAX_PDF_BYTES or not pdf_bytes.startswith(b"%PDF-"):
            raise ValueError("Selected ZIP entry is not a valid bounded PDF filing")
        return pdf_bytes, selected.filename
