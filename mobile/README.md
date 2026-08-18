# IPOBharosa mobile

Companion Android + iOS app for IPOBharosa, built with Expo / React Native.

## Features

- **IPO Board** — date-first board with GMP states and subscription, powered by
  the public API `GET /api/public/board`. GMP follows the web product's source
  policy: only launch-approved provider quotes are shown; otherwise an explicit
  "No tracked GMP quote yet" state. When a quote exists, the row shows the GMP
  premium (+X%) and the detail screen shows the estimated listing price.
- **PAN Cards** — saved locally on the device only (Expo SecureStore, or
  localStorage on web). PANs are never sent to any IPOBharasa server.
- **Allotment** — automatic lookup for MUFG / Link Intime IPOs via the
  registrar's CAPTCHA-free official `SearchOnPan` endpoint; deep-links to the
  official registrar portal for CAPTCHA-gated registrars (KFintech, Bigshare,
  BSE and others), which are never bypassed.

## Screenshots

See [`screenshots/`](./screenshots) — captured from the web build at a phone
viewport (390×844):

1. `1-board.png` — IPO Board
2. `2-board-mainboard.png` — IPO Board filtered to Mainboard
3. `3-ipo-detail.png` — IPO detail (offer details, timeline, GMP, registrar)
4. `4-pan-cards.png` — PAN Cards (on-device storage)
5. `5-allotment.png` — Allotment check

## Test it on a phone

The fastest way to try the app on your own or a friend's phone is **Expo Go**
(no Apple/Google account, no code signing, no Play Store needed).

### 1) Install Expo Go

- **Android**: Play Store → [Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)
- **iOS**: App Store → [Expo Go](https://apps.apple.com/us/app/expo-go/id982107779)

### 2) Start the dev server on your laptop

```bash
cd mobile
npm ci
npx expo start
```

### 3) Connect the phone

Make sure the phone and laptop are on the **same Wi-Fi network**, then:

- **Android**: open Expo Go → scan the QR code shown in the terminal.
- **iOS**: use the built-in Camera app to scan the QR code (opens Expo Go).

The app loads and is live-reloaded as you edit.

### 4) Point at production or a preview

By default the app talks to the production API (`https://ipobharosa.vercel.app`).
To point at a Preview deployment:

```bash
EXPO_PUBLIC_API_URL=https://<preview-alias>.vercel.app npx expo start
```

### Build an installable APK (Android)

For a standalone `.apk` you can share with people directly, use EAS Build.
You need an Expo account (free) — run `npx eas-cli login` once:

```bash
npm i -g eas-cli
eas login
eas build -p android --profile preview
```

The `eas.json` defines the build profiles:

- `preview` — internal Android `.apk` (share with anyone via "install from
  unknown sources") and an iOS simulator build.
- `development` — Expo Go dev-client build.
- `production` — signed Play Store `app-bundle` + App Store Connect iOS build,
  ready for `eas submit`.

The resulting `.apk` can be installed by anyone with "install from unknown
sources" enabled. iOS standalone builds require an Apple Developer account.

## Run the web build (no phone needed)

```bash
npx expo export --platform web
npx serve dist -l 3000
```

Open http://localhost:3000 in a mobile-sized browser window. Note: a browser
loading the app from a non-Vercel origin needs the API to send CORS headers
(`Access-Control-Allow-Origin: *`), which the public board endpoint does.

## Checks

```bash
npx tsc --noEmit      # typecheck
npm run lint          # lint (eslint .)
npx vitest run        # logic tests (PAN validation, registrar routing, MUFG XML parsing)
npx expo export --platform android --platform ios && rm -rf dist   # verify bundles
```

## Safety rails

- PAN data is local-only; no server sync, no analytics, no logging of PANs.
- Allotment checking talks only to the official registrar endpoint (MUFG) or
  opens the official registrar portal. CAPTCHA-gated portals are never
  automated or bypassed.
- No real IPO-application/bidding flow is implemented.
- GMP is unofficial sentiment shown only from launch-approved provider quotes;
  it is never invented, and listing-price estimates are clearly labelled as
  estimates.