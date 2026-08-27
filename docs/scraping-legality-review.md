# Scraping legality review

Date: 2026-08-12
Scope: the three sites IPOBharosa's ingestion pipeline fetches from — `ipowatch.in`, `www.sahi.com`, `www.ipoji.com`. For each: what `robots.txt` says, what the site's Terms of Use say, and the resulting risk assessment. This is not legal advice — it's a factual record of what each source's own published rules say, so the risk is visible and can be decided on deliberately rather than discovered later.

Our scraper identifies itself honestly: `User-Agent: Mozilla/5.0 (compatible; IPOBharosaBot/1.0; +https://ipobharosa.vercel.app)` — the URL resolves to the live site, not a placeholder.

## Summary

| Source | robots.txt | ToS | Risk |
|---|---|---|---|
| ipowatch.in | Allows generic bots (`Content-Signal: use=reference`, `Allow: /`) | Prohibits reproduction/derivative works for commercial use **and explicitly bars using the site "to build a similar or competitive website"** | **Highest** — we are a competing IPO tracker |
| sahi.com | Allows generic bots (`Allow: /`, only `/_next/*` and `/api` blocked) | Prohibits reproducing/distributing/commercial use of "materials" without written consent | **Medium-high** — same category of restriction, no competitor-specific clause found |
| ipoji.com | Allows everything except `/profile` and `/bids` (neither of which we touch) | No reproduction/commercial-use/anti-competitor clause found | **Lower** — least contractually restrictive of the three, but silence isn't a guarantee |

**The core tension at all three:** `robots.txt` is a crawling-permission signal, not a license — a site can technically allow bots to fetch a page in `robots.txt` while its Terms of Use separately restrict what may be done with what's fetched (commercial reuse, republishing, derivative works). All three sites here fall into that pattern to varying degrees. Passing the `robots.txt` check does not clear the ToS question, and we should not treat it as if it does.

## ipowatch.in

**robots.txt** (fetched live): wildcard `User-Agent: *` block sets `Content-Signal: search=yes,ai-train=no,use=reference` and `Allow: /`. Specific bots are blocked by name (`GPTBot`, `ClaudeBot`, `Google-Extended`, `Amazonbot`, `Bytespider`, `CCBot`, `Applebot-Extended`, `meta-externalagent`, `CloudflareBrowserRenderingCrawler`) — our bot isn't one of them, so it falls under the wildcard `Allow: /`. A handful of unrelated paths are disallowed (`/wp-admin/`, `/wp-json/*`, a few slug patterns); the IPO detail pages we fetch (`/{slug}-ipo-gmp-grey-market-premium/`) aren't among them.

**Terms of Use** (`https://ipowatch.in/term-of-use/`): includes a standard "no reproduction, no derivative works, no commercial use without consent" clause, and — more specifically — states users "shall not access the Site in order to build a similar or competitive website."

**Risk**: IPOBharosa is, in plain terms, a competing IPO-tracking website, and we use ipowatch.in for (a) one of three GMP figures fed into our median and (b) discovering DRHP/RHP document links. That is a direct match for the clause above. `robots.txt` being permissive doesn't resolve this — the ToS is a separate, and here contradictory, restriction.

## sahi.com

**robots.txt** (fetched live, dated 2026-04-27 in the file itself): wildcard `User-Agent: *` block is `Allow: /` with only `/_next/*`, `/.next/`, and `/api` disallowed — all internal Next.js/app-infrastructure paths, not content. Named-bot blocks exist for `Bytespider` and `Amazonbot` only; every other bot, including unnamed ones like ours, falls under the permissive wildcard block. The `/blogs/{slug}-ipo-gmp-today` pages we fetch (GMP, subscription table, financials table) are unrestricted.

**Terms of Use** (`https://www.sahi.com/terms-of-use`): standard clause — "materials on this website are protected by copyright and no part... may be modified, reproduced, stored in a retrieval system, transmitted... copied, distributed, used for creating derivative works or used in any other way for commercial or public purposes without the prior written consent of AARITYA [Aaritya Broking Private Limited, SEBI INZ000317632]." No specific "competing website" language was found, but the general reproduction/commercial-use restriction still applies to what we extract (GMP figure, subscription numbers, financial figures).

**Risk**: Medium-high. We extract structured numeric data (not the page's prose or design), and Sahi itself explicitly attributes the subscription table to NSE — i.e., Sahi is itself republishing a primary regulatory source, not originating that data. That's relevant context but doesn't extend permission to us; it only tells us the subscription *numbers* ultimately trace back to NSE, a point already reflected on our [Methodology](/methodology) page.

## ipoji.com

**robots.txt** (fetched live): wildcard `User-Agent: *` block disallows only `/profile` and `/bids` — neither of which we ever fetch. The `/ipo/{slug}-ipo` pages we scrape are unrestricted.

**Terms of Use** (`https://www.ipoji.com/terms-conditions`): no clause found prohibiting reproduction, commercial use, derivative works, or competing use. The page is dominated by investment-disclaimer and liability language, not IP restrictions on the underlying content.

**Risk**: Lower than the other two, but "no clause found" is not the same as "no risk" — general copyright law can still apply to compiled/structured content regardless of what the Terms of Use happen to say, and this review only checked the single Terms page reachable from the site, not every legal document that might exist.

## What we do to reduce risk, regardless of source

- We extract a single numeric fact per source per cycle (a GMP figure, a subscription multiple, a financial line item) — not the page's text, layout, or images — and combine it with other sources rather than republishing any one source's page as-is.
- Every GMP/subscription/financial figure we show attributes its own data type's sourcing pattern on the [Methodology](/methodology) page (median-of-three for GMP, single-source-with-attribution for subscription, verified-gate for financials) — we don't claim these numbers as our own research.
- Document links point to the original filer's PDF (lead manager/company domain), never to a copy we host.
- We respect every `Disallow` path found in each site's `robots.txt`.
- Our bot identifies itself truthfully with a real, resolving contact URL.

## Open item

The ipowatch.in ToS conflict (competing-website clause) is a real, unresolved risk — not something the mitigations above make disappear, since they reduce *how much* we take, not *whether taking it at all* is permitted under that clause. Options, in order of how much they reduce risk:

1. Reach out to ipowatch.in for explicit permission to use their GMP figure and document index, given we already limit ourselves to single data points with attribution.
2. Drop ipowatch.in as a GMP source (keep Sahi + IPO Ji — median-of-2 with a wider confidence-tier threshold) and find an alternative document-index source, accepting a real drop in GMP confidence and document coverage.
3. Continue as-is, accepting the risk documented here.

This is a decision for the site owner, not something to resolve unilaterally in code — recorded here so it's visible rather than silently accepted.
