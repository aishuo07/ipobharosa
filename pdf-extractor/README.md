# Experimental financial candidate extractor

This local Python tool produces review candidates from an official RHP/DRHP.
It is **not** a source of truth and it never publishes financial values.

Current parser limitations include imperfect table detection, uncertain units,
fiscal-period inference, consolidated/standalone scope, and audit/restatement
classification. Every submitted candidate is routed to the human review queue.

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

Do not point this tool at Production until the later document-ingestion,
native-extraction, semantic-validation, and review-hardening PRs are complete.
The Preview must also set `ENABLE_EXPERIMENTAL_FINANCIAL_SUBMISSION=true`;
Production must leave that flag unset.
