# IPOBharosa mobile

Companion Android + iOS app for IPOBharosa, built with Expo / React Native.

## Features

- **IPO Board** — date-first board with GMP states and subscription, powered by
  the public API `GET /api/public/board`. GMP follows the web product's source
  policy: only launch-approved provider quotes are shown; otherwise an explicit
  "No tracked GMP quote yet" state.
- **PAN Cards** — saved locally on the device only (Expo SecureStore). PANs are
  never sent to any IPOBharosa server.
- **Allotment** — automatic lookup for MUFG / Link Intime IPOs via the
  registrar's CAPTCHA-free official `SearchOnPan` endpoint; deep-links to the
  official registrar portal for CAPTCHA-gated registrars (KFintech, Bigshare,
  BSE and others), which are never bypassed.

## Run it

```bash
npm ci
npx expo start
```

Scan with Expo Go (Android/iOS), or run `npm run android` / `npm run ios`.

Point the app at a Preview deployment during development:

```bash
EXPO_PUBLIC_API_URL=https://<preview-alias>.vercel.app npx expo start
```

## Checks

```bash
npx tsc --noEmit      # typecheck
npx expo lint         # lint
npx vitest run        # logic tests (PAN validation, registrar routing)
npx expo export --platform android && rm -rf dist   # verify native bundle
```

## Safety rails

- PAN data is local-only; no server sync, no analytics, no logging of PANs.
- Allotment checking talks only to the official registrar endpoint (MUFG) or
  opens the official registrar portal. CAPTCHA-gated portals are never
  automated or bypassed.
- No real IPO-application/bidding flow is implemented.