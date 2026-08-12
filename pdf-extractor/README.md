# Filing-backed financial candidate extractor

This local Python tool produces review candidates from an official RHP/DRHP.
It is **not** a source of truth and it never publishes financial values.

The worker locates explicit summary/restated profit-and-loss statements and
submits only rows carrying an explicit unit, fiscal period, scope, page, and
audit status. Unsupported layouts fail closed. Every submitted candidate is
routed to the human review queue; extraction never publishes values.

Run extraction without mutation:

```bash
python extract.py https://official.example/file.pdf <development-ipo-id> RHP
```

The batch tool is extraction-only. It intentionally marks unresolved fiscal
period, unit, scope, and audit status instead of guessing them. The submission
API rejects incomplete values, so candidates cannot enter the review queue
until those fields are backed by document evidence.

After the later extraction-hardening PR provides that evidence, an explicitly
reviewed payload can be sent only to a Development Preview:

```bash
ADMIN_TOKEN='<development-token>' \
  python extract.py https://official.example/file.pdf <development-ipo-id> RHP \
  https://your-preview.vercel.app --submit
```

The scheduled GitHub Actions worker reads captured, unprocessed filing records
through the token-protected API. Set `ADMIN_BEARER_TOKEN` in GitHub Actions and
Vercel, and `ENABLE_EXPERIMENTAL_FINANCIAL_SUBMISSION=true` in Vercel.
