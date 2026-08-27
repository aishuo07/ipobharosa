# Official-source Production no-write audit — 2026-08-14

Command:

```text
npx vercel env run -e production -- npx tsx scripts/audit-official-coverage.ts --summary
```

Safety: the audit read the 33 Production `DRAFT`/`QUARANTINED` records and queried NSE/BSE public endpoints. It did not update, publish, reject, or migrate any Production record.

## Final routing

| Outcome | Count | Meaning |
|---|---:|---|
| `AUTO_PUBLISH` | 12 | All 10 material fields match a complete official BSE IPO record; no official source conflicts. |
| `RETRY` | 13 | Neither NSE nor BSE currently contains a matching current/historical issue record. These remain visible as verification pending and are retried with backoff. |
| `EXCEPTION` | 3 | An official record exists, but stored discovery data conflicts on a material field. No automatic correction or publication. |
| `WRONG_TYPE_FPO` | 4 | BSE classifies these as FPOs, so they must leave the IPO queue. |
| `WRONG_TYPE_INVIT` | 1 | BSE classifies this as an InvIT, so it must leave the IPO queue. |
| **Total** | **33** | Counts are mutually exclusive and sum exactly to the audited candidate set. |

## Eligible after official verification (12)

- Aegeus Technologies
- ENS Enterprises
- Fusion Klassroom
- G.V. Electricals
- H.R. Hygiene Products
- LAPL Automotive
- Oneindig Technologies
- Poojaa Precision
- Shree Balaji (Mala) Textiles
- Silverstorm Parks
- Sotefin Bharat
- Technocrats Plasma

Each candidate was `NSE: NOT_FOUND`, `BSE: FOUND`, issue type `IPO`, with 10/10 material fields matched.

## Still pending official coverage (13)

- Adon Agro Commodities
- Atharva Polyplast
- CSM Technologies
- Crazy Snacks
- Credent Connect N Care
- Devson Catalyst
- Fascinate Textiles
- Kratikal Tech
- Millworks Technologies
- Pramodini Medicare
- Sampark India Logistics
- Seemax Resources
- Skytech Infinite Platform

For each candidate, both NSE and BSE returned `NOT_FOUND`. This is not treated as proof that the IPO is invalid; it is a coverage-pending state with retry/backoff.

## Material conflicts requiring review (3)

- Dhaval Packaging — BSE official record conflicts on `lotSize` and `registrar`.
- Knack Packaging — NSE official record conflicts on `leadManagers`.
- SBI Funds Management — NSE official record conflicts on `leadManagers`.

## Removed from the IPO queue by official issue type (5)

- Advance Technoforge — FPO
- Gulf Lloyds — FPO
- Q&T Foods — FPO
- Sham Foam — FPO
- Cube Highways Trust InvIT — InvIT

## Release interpretation

The BSE integration raises the current official-verification yield from NSE-only coverage while keeping the fail-closed policy. The 12 matches are eligible only after the additive migration and feature-flag release sequence is followed. This report did not publish them.
