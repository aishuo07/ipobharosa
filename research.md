# Authoritative IPO source notes

- Existing discovery parses IPO Watch and currently treats a Sahi page `HEAD` success plus a filing link as enough to publish. That verifies page existence, not field agreement.
- NSE exposes current/upcoming issue catalogues and per-symbol issue details containing issuer, series, price range, issue period, bid lot, registrar, lead managers, and an NSE-hosted RHP.
- SEBI is the official filing fallback. BSE currently rejects automated access with `403`; the application must not bypass it.
- Registrar sites are authoritative for allotment/status, while bank pages are only secondary corroboration.
- Material publication fields for this change are issuer identity, board, price band, open/close dates, lot size, registrar, lead managers, and official RHP.
- Sector remains optional. Temporary official-source gaps must retry; actual cross-source conflicts must enter the exception queue.

