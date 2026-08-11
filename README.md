# IPODekho

An IPO board for Indian retail investors — lot size, price band, subscription, and grey market premium (GMP), with honest source confidence instead of blind numbers.

## Why

GMP is informal, unregulated dealer-street pricing — no official source exists anywhere. Every existing tracker shows it as a single number with false confidence. IPODekho scrapes multiple independent public GMP sources, aggregates with median + spread, and surfaces a confidence tier (High/Medium/Low) driven by how many sources agree and how far apart they are. A failing source degrades confidence; it never breaks the pipeline.

See `/Users/aikanodi/.claude/plans/fuzzy-dreaming-eagle.md` for the full build plan.

## Stack

- Next.js (App Router, TypeScript)
- PostgreSQL (Neon, via Vercel) + Prisma 7 (driver adapter: `@prisma/adapter-pg`)
- Vitest for ingestion/normalization logic

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm test` | Vitest suite (GMP confidence/fallback logic) |
| `npm run lint` | ESLint |
| `npx prisma migrate dev` | Apply schema changes locally |
