# SkyCheck — Complete Setup & Troubleshooting Guide

**Code-B · BSCS-2C · Gordon College**
Version 1.0 · Stack: React 18 + Vite PWA + Node.js + Express + Prisma + PostgreSQL

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Structure](#2-project-structure)
3. [API Keys You Need (and Where to Get Them)](#3-api-keys-you-need)
4. [Database Setup (Neon.tech — Free PostgreSQL)](#4-database-setup)
5. [Backend Setup](#5-backend-setup)
6. [Frontend Setup](#6-frontend-setup)
7. [PWA Icon Generation](#7-pwa-icon-generation)
8. [Running the App](#8-running-the-app)
9. [Testing on a Physical Phone](#9-testing-on-a-physical-phone)
10. [Environment Variable Reference](#10-environment-variable-reference)
11. [Troubleshooting Guide](#11-troubleshooting-guide)
12. [API Architecture Decisions](#12-api-architecture-decisions)
13. [Offline / PWA Behavior](#13-offline--pwa-behavior)
14. [Deployment (Optional)](#14-deployment-optional)

---

## 1. Prerequisites

Install these tools **before anything else**. Run each version check to confirm.

### Node.js 20+ (LTS)

```bash
# Check current version
node --version     # must be v20.x.x or higher
npm --version      # must be 10.x.x or higher
```

If not installed or version is too old:
- Go to **https://nodejs.org** and download the **LTS** version (20.x)
- Or use nvm (Node Version Manager) — recommended for developers:

  ```bash
  # Install nvm (Windows: use nvm-windows from github.com/coreybutler/nvm-windows)
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
  # Restart terminal, then:
  nvm install 20
  nvm use 20
  ```

> **Important (Windows/Cursor):** Cursor ships with its own `node.exe`, but it may **not** include `npm`/`npx`.
> Always install Node.js from `nodejs.org` so `npm` and `npx` are available in your terminal.
> If you installed Node/Git while a terminal was already open, **close and reopen PowerShell** so PATH refreshes.

### Git

```bash
git --version     # any recent version is fine
```

Install from **https://git-scm.com** if missing.

### VS Code

Download from **https://code.visualstudio.com**

### Python 3 (for icon generation only)

```bash
python3 --version   # 3.8+ is fine
```

---

## 2. Project Structure

After unzipping or cloning, your folder should look like:

```
SkyCheck/                        ← Root folder (open this in VS Code)
├── SkyCheck.code-workspace      ← Open this file in VS Code
├── .gitignore
│
├── skycheck/                    ← Frontend (React + Vite PWA)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── index.html
│   ├── .env.example             ← Copy to .env
│   ├── public/
│   │   └── icons/               ← Put your PWA icons here
│   ├── scripts/
│   │   └── generate-icons.py
│   └── src/
│       ├── main.tsx
│       ├── App.tsx              ← Router + QueryClient
│       ├── index.css
│       ├── types/
│       ├── constants/
│       ├── utils/
│       ├── store/               ← Zustand auth store
│       ├── api/                 ← All backend API calls
│       ├── services/            ← Nominatim geocoding
│       ├── hooks/
│       ├── components/          ← Reusable UI components
│       └── pages/
│           ├── SplashPage.tsx
│           ├── auth/            ← Login, Signup, Verify, Forgot
│           └── app/             ← Dashboard, Routes, Alerts, Profile
│
└── skycheck-backend/            ← Backend (Node.js + Express + Prisma)
    ├── package.json
    ├── tsconfig.json
    ├── .env.example             ← Copy to .env
    ├── prisma/
    │   └── schema.prisma        ← Database models
    └── src/
        ├── index.ts             ← Express server entry
        ├── types/
        ├── constants/
        ├── utils/
        ├── middleware/          ← JWT auth
        ├── routes/              ← auth, weather, routes, alerts
        └── services/            ← weather, traffic, flood, cron, email
```

---

## 3. API Keys You Need

You need **4 external service keys** plus **Firebase project configuration**. All have free tiers, none require payment info except where noted.

### Key 1 — Neon.tech PostgreSQL (Required)

**Cost:** Free · **No credit card**
**Get it:** https://neon.tech

1. Sign up with GitHub or Google
2. Click **New Project** → name it `skycheck`
3. Select region: **AWS Asia Pacific (Singapore)** — closest to Philippines
4. After creation, click **Connection Details**
5. Copy the **Connection String** — it looks like:
   `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
6. Paste this into `skycheck-backend/.env` as `DATABASE_URL`

### Key 2 — OpenRouteService (Required for routing)

**Cost:** Free · 2,000 requests/day · **No credit card**
**Get it:** https://openrouteservice.org/dev/#/signup

1. Click **Sign Up** → verify email
2. Go to **Dashboard** → **API Keys**
3. Copy your default key
4. Paste into `skycheck-backend/.env` as `ORS_API_KEY`

> **Why ORS over Google Maps?** Google Maps requires a credit card for billing even on the free tier. ORS is completely free with no billing info needed.

### Key 3 — TomTom (Required for traffic)

**Cost:** Free · 2,500 requests/day · **No credit card, ever**
**Get it:** https://developer.tomtom.com

1. Click **Get Started for Free** → sign up
2. Go to **Access Manager** → **OAuth 2.0** or **API Keys**
3. Click **Create API Key** → copy the key
4. Paste into `skycheck-backend/.env` as `TOMTOM_API_KEY`

> **Why TomTom?** No credit card required — ever. 2,500 free requests/day with a graceful rush-hour heuristic fallback when the limit is reached. Works for Olongapo, Subic, and all major PH corridors.

### Key 4 — MapTiler (Optional but recommended for maps)

**Cost:** Free · 100,000 requests/month · **No credit card**
**Get it:** https://cloud.maptiler.com

1. Sign up → go to **Account** → **API Keys**
2. Copy the **Default** key
3. Paste into **both** `skycheck/.env` as `VITE_MAPTILER_KEY`
   AND `skycheck-backend/.env` as `MAPTILER_KEY`

> **If you skip this:** The map in the Add Route screen will use bare OpenStreetMap tiles instead. The app fully works without it, but MapTiler gives cleaner street-level map visuals.

### Firebase project configuration (Required for authentication)

**Cost:** Free tier available
**Get it:** https://console.firebase.google.com

1. Create or open your Firebase project
2. Go to **Authentication** → **Sign-in method**
3. Enable **Email/Password** and **Google**
4. Go to **Project settings** → **General** → **Your apps** → create/select a Web app
5. Copy the Firebase SDK config into `skycheck/.env` as the `VITE_FIREBASE_*` values
6. Go to **Project settings** → **Service accounts** → generate a new private key
7. Put these values in `skycheck-backend/.env`:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`

For deployment, add your Vercel domain and localhost domains in Firebase Authentication authorized domains.

### Keys NOT needed (already free, no registration)

| Service | Used For | Why No Key |
|---------|----------|------------|
| Open-Meteo | Weather data | Fully open, no auth |
| Open-Topo-Data | Elevation / flood | Fully open, no auth |
| Nominatim (OSM) | Address search | Fully open, no auth |

---

## 4. Database Setup

### Step 4a — Create your .env file

```bash
cd skycheck-backend
cp .env.example .env
```

Now open `.env` in VS Code and fill in your values:

```env
DATABASE_URL="postgresql://..."      ← from Neon.tech step above
JWT_SECRET="..."                     ← generate below
ORS_API_KEY="..."                    ← from ORS
TOMTOM_API_KEY="..."                   ← from TomTom
EMAIL_USER="your@gmail.com"
EMAIL_PASS="xxxx xxxx xxxx xxxx"     ← Gmail App Password (see below)
```

### Step 4b — Generate a JWT Secret

Open a terminal and run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output (64 hex chars) and paste it as `JWT_SECRET` in your `.env`.

### Step 4c — Gmail App Password (for email verification)

> You need this for the Sign Up verification email and Forgot Password email to work.

1. Log into the Gmail account you want to use
2. Go to **Account Settings** → **Security**
3. Turn on **2-Step Verification** if not already on
4. Go back to Security → scroll to **App Passwords**
5. Select app: **Mail** · device: **Other** → type "SkyCheck"
6. Copy the 16-character password (with spaces, e.g. `abcd efgh ijkl mnop`)
7. Paste as `EMAIL_PASS` in `.env`

### Step 4d — Install dependencies and run migrations

```bash
# Still in skycheck-backend/
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations (creates all tables)
npx prisma migrate dev
```

Expected output:
```
✓ Generated Prisma Client
✓ Applied migration(s)
```

If migration succeeds, you can view your database in a GUI:
```bash
npx prisma studio
# Opens http://localhost:5555 — a visual DB browser
```

---

## 5. Backend Setup

```bash
cd skycheck-backend

# Install all dependencies (if not done above)
npm install

# Start the backend in development mode (hot reload)
npm run dev
```

Expected output:
```
🌤  SkyCheck Backend running on http://localhost:3000
    Health: http://localhost:3000/health-check-server
    Env:    development

[Cron] Risk refresh scheduled every 15 minutes
[Cron] Morning alert cron scheduled (5:30 AM PHT)
```

### Verify the backend works

Open a browser or use curl:

```bash
curl http://localhost:3000/health-check-server
```

Should return:
```json
{ "status": "ok", "version": "2.0.0", "timestamp": "..." }
```

### Email verification (dev vs production)

- In **production**, email verification is required by default.
- In **development**, email verification is **disabled by default** so you can sign up and log in immediately (useful if email sending isn't configured).

Override behavior with:

```env
REQUIRE_EMAIL_VERIFICATION=true   # always require verification
REQUIRE_EMAIL_VERIFICATION=false  # never require verification
```

---

## 6. Frontend Setup

Open a **new terminal tab** (keep backend running in the first tab):

```bash
cd skycheck
cp .env.example .env
```

Edit `skycheck/.env`:
```env
VITE_API_BASE_URL=http://localhost:3000
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_MAPTILER_KEY=your_maptiler_key_here    ← optional
```

```bash
npm install
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in 400ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

Open **http://localhost:5173** in your browser. You should see the SkyCheck splash screen.

---

## 7. PWA Icon Generation

The app needs PNG icons for the PWA install prompt. Generate them once:

```bash
cd skycheck

# Install cairosvg
pip3 install cairosvg

# Generate icons
python3 scripts/generate-icons.py
```

If `cairosvg` fails to install (common on Windows):

```bash
# Fallback with Pillow (simpler, creates placeholder icons)
pip3 install Pillow
python3 scripts/generate-icons.py
```

Or on Windows with no Python SVG libraries, manually create two blue square PNG files:
- `skycheck/public/icons/pwa-192.png` (192×192px)
- `skycheck/public/icons/pwa-512.png` (512×512px)

Any blue square PNG will work for development.

---

## 8. Running the App

You need **two terminals** running simultaneously:

### Terminal 1 — Backend
```bash
cd skycheck-backend
npm run dev
```

### Terminal 2 — Frontend
```bash
cd skycheck
npm run dev
```

Then open **http://localhost:5173** in Chrome or Edge.

### VS Code Tasks (easier)

In VS Code with the workspace open:
1. Press `Ctrl+Shift+P` → type `Run Task`
2. Select **Start Backend (ts-node-dev)** → opens in terminal panel
3. Run Task again → select **Start Frontend (Vite)**

---

## 9. Testing GPS and PWA on a Physical Phone

To test on your actual phone (Android/iPhone on the same WiFi):

### Step 9a — Find your computer's local IP

**Windows:**
```bash
ipconfig
# Look for "IPv4 Address" under your WiFi adapter — e.g. 192.168.1.5
```

**Mac/Linux:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
# e.g. 192.168.1.5
```

### Step 9b — Update frontend .env

```env
VITE_API_BASE_URL=http://192.168.1.5:3000    ← replace with your actual IP
```

### Step 9c — Allow Vite to be accessed on network

Vite already binds to `0.0.0.0` by default. Restart `npm run dev`.

### Step 9d — Open on phone

On your phone browser, go to:
```
http://192.168.1.5:5173
```

### Step 9e — Install as PWA

**Android (Chrome):**
1. Open the URL → tap the 3-dot menu
2. Tap **Add to Home screen** or look for the install banner at the bottom
3. Tap **Install**

**iPhone (Safari):**
1. Open the URL in **Safari** (not Chrome — iOS PWA install requires Safari)
2. Tap the **Share** button (box with arrow)
3. Scroll down → tap **Add to Home Screen**
4. Tap **Add**

> **Note:** PWA service worker only activates on HTTPS in production. On local network (HTTP), the app still works but won't be installable on some iOS versions. For full PWA install on iOS, use ngrok (see below).

### Step 9f - GPS accuracy behavior

SkyCheck asks the user to grant GPS access on the Dashboard.

Expected behavior:

- If GPS succeeds, the dashboard uses the user's live coordinates and shows a green `Live +/-Xm` badge.
- If GPS fails, is blocked, or only returns a very rough PC/laptop estimate, the app automatically switches to `Subic, Zambales, Central Luzon, PH`.
- The app fetches weather/risk data for Subic using fallback coordinates `14.8799, 120.2343`.
- The user sees a warning that precise location is unavailable and that mobile GPS is recommended for better accuracy.

For best testing:

- Test on a phone outdoors or near a window.
- In Chrome/Edge, make sure the site permission for Location is set to **Allow**.
- After deploying a new GPS fix, hard refresh the browser or reinstall/refresh the PWA so the old service worker does not keep stale code.

### Step 9g — Using ngrok for HTTPS (optional but recommended for iOS)

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 5173
```

Copy the `https://xxxx.ngrok.io` URL. Update both:
- `skycheck/.env` → `VITE_API_BASE_URL=https://yyyy.ngrok.io` (run ngrok for port 3000 too)
- `skycheck-backend/.env` → `FRONTEND_URL=https://xxxx.ngrok.io`

---

## 10. Environment Variable Reference

### Frontend (`skycheck/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Yes | Backend URL. `http://localhost:3000` for local dev |
| `VITE_FIREBASE_API_KEY` | Yes | Firebase web app API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase web app ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Firebase storage bucket from web config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase sender ID from web config |
| `VITE_MAPTILER_KEY` | No | MapTiler API key for map tiles in route preview |

### Backend (`skycheck-backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string from Neon.tech |
| `JWT_SECRET` | **Yes** | Random 64-char hex string for signing JWTs |
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | No | Server port (default: 3000) |
| `APP_URL` | Yes | Base URL for email links (`http://localhost:3000` local) |
| `FRONTEND_URL` | Yes | Frontend URL for CORS (`http://localhost:5173` local) |
| `EMAIL_USER` | Yes | Gmail address for sending emails |
| `EMAIL_PASS` | Yes | Gmail App Password (16 chars) |
| `FIREBASE_PROJECT_ID` | Yes | Firebase Admin project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes | Firebase service account client email |
| `FIREBASE_PRIVATE_KEY` | Yes | Firebase service account private key |
| `ORS_API_KEY` | Yes | OpenRouteService API key |
| `TOMTOM_API_KEY` | Yes | TomTom API key for traffic data |
| `MAPTILER_KEY` | No | MapTiler key (also set in frontend) |

---

## 11. Troubleshooting Guide

### ❌ `npm install` fails with ERESOLVE or peer dependency errors

```bash
# Try with legacy peer deps flag
npm install --legacy-peer-deps
```

### ❌ Backend won't start — "Missing required environment variables"

Make sure you copied `.env.example` to `.env` (not just edited the example):
```bash
cd skycheck-backend
cp .env.example .env   # then fill in your values
```

### ❌ Prisma migrate fails — "Can't reach database server"

1. Check your `DATABASE_URL` in `.env` — make sure it's the full connection string from Neon
2. Make sure the Neon project isn't paused (free tier auto-pauses after inactivity):
   - Go to https://console.neon.tech → click your project → it will auto-resume
3. Check for extra spaces or quotes around the URL in `.env`

```bash
# Test connection manually
npx prisma db push --preview-feature
```

### ❌ Prisma migrate fails with P3006 / P1014 — “table for model users does not exist”

This happens when migrations are applied out-of-order (a migration tries to `ALTER TABLE users` before `users` is created).

Fix:

```bash
cd skycheck-backend
npx prisma migrate dev
```

If you still see the error, make sure you have the latest code (the Google OAuth migration was renamed so it applies **after** the initial migration).

### ❌ Frontend blank / “localhost page can’t be found”

Usually the Vite dev server is not running. Start it:

```bash
cd skycheck
npm run dev
```

Then open the exact URL printed (usually `http://localhost:5173/`).

### ❌ Vite crashes with missing modules from `lucide-react` or `workbox-build`

If your `node_modules` got corrupted (common on Windows after interrupted installs), do a clean reinstall:

```bash
cd skycheck
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
npm run dev
```

Note: PWA dev mode is disabled in `skycheck/vite.config.ts` to avoid Workbox dev crashes. PWA still works in production builds.

### ❌ "Invalid JWT" errors from backend

Your frontend token may be stale after restarting the backend with a new JWT_SECRET.
Clear localStorage in the browser:
```javascript
// In browser DevTools Console:
localStorage.clear()
location.reload()
```

### ❌ Email verification not sending

1. Confirm `EMAIL_USER` and `EMAIL_PASS` in `.env` are correct
2. Make sure `EMAIL_PASS` is an **App Password** (16 chars), NOT your Gmail login password
3. Check that 2-Step Verification is ON for the Gmail account
4. Check terminal for `[Email] Failed to send verification:` errors
5. Test manually:
   ```bash
   # In Node.js REPL
   const nodemailer = require('nodemailer')
   const t = nodemailer.createTransport({ service:'gmail', auth:{ user:'YOUR@gmail.com', pass:'YOUR_APP_PASS' }})
   t.verify((err, ok) => console.log(err || 'SMTP OK'))
   ```

### ❌ Weather data not loading — "503 Weather data temporarily unavailable"

Open-Meteo is a free, no-key API. Check:
1. Is the backend running? Check `http://localhost:3000/health`
2. Is the backend able to reach the internet? Test:
   ```bash
   curl "https://api.open-meteo.com/v1/forecast?latitude=14.83&longitude=120.28&current=temperature_2m"
   ```
3. Check the coordinates are valid Philippine coordinates

### ❌ Map not showing in Add Route (blank grey box)

This is normal if MapTiler key is missing — the map falls back to OpenStreetMap.
If even OSM tiles don't load:
1. Check browser console for CORS or 404 errors on tile requests
2. Try adding `VITE_MAPTILER_KEY` to `skycheck/.env`

### GPS button does not open a browser prompt

This usually means location permission is already blocked, the browser is using a rough PC/laptop estimate, or the page is not running in a secure context.

Check these:

1. Use HTTPS in production. Browser geolocation is restricted on insecure pages, except localhost.
2. Click the lock/settings icon beside the URL and set **Location** to **Allow**.
3. Refresh the page after changing permission.
4. On mobile PWA, close and reopen the installed app after deployment so the service worker updates.
5. On PC/laptop, the browser may only provide rough Wi-Fi/IP location. If it cannot provide precise coordinates, SkyCheck falls back to Subic automatically.

Expected fallback result:

- Home location shows `Subic, Zambales, Central Luzon, PH`.
- Weather is fetched using Subic fallback coordinates.
- The user sees a warning recommending the mobile version for better GPS accuracy.

### ❌ Address search (Nominatim) returns no results

Nominatim has a **1 request/second** rate limit. If you type too fast:
1. The app uses 350ms debounce — this should prevent most issues
2. If still failing, check the browser Network tab for 429 errors
3. Try searching with more specific terms (add "Olongapo" or "Philippines")

### ❌ Traffic risk always shows UNKNOWN

If key is missing, the app uses the built-in rush-hour heuristic instead of UNKNOWN.
To fix:
1. Verify `TOMTOM_API_KEY` in `skycheck-backend/.env`
2. Check the backend terminal for `[Traffic] TomTom error:` messages
3. Confirm your TomTom key has **Traffic Flow API** enabled in the TomTom developer dashboard

### ❌ CORS error in browser console — "blocked by CORS policy"

The frontend origin isn't in the backend's allowed list.
1. Check `FRONTEND_URL` in `skycheck-backend/.env`
2. Make sure it matches exactly what's in the browser URL bar (including port)
3. Add your specific origin to `allowedOrigins` array in `skycheck-backend/src/index.ts`

### ❌ PWA not installing on iPhone

1. Must use **Safari** browser (not Chrome) on iOS
2. Make sure the URL starts with `https://` — use ngrok for local testing
3. Check that PWA icons exist at `skycheck/public/icons/pwa-192.png`

### ❌ Offline mode not working (app crashes when offline)

1. Build the app first — service workers only work in production build:
   ```bash
   npm run build
   npm run preview
   ```
2. Open `http://localhost:4173` in Chrome
3. Open DevTools → Application → Service Workers → confirm it's registered
4. Go to Network tab → check "Offline" → refresh the page

### ❌ Prisma Studio won't open

```bash
cd skycheck-backend
npx prisma studio
# Should open http://localhost:5555
```

If port 5555 is in use:
```bash
npx prisma studio --port 5556
```

### ❌ TypeScript errors on build

Run type check separately to see all errors:
```bash
# Frontend
cd skycheck
npx tsc --noEmit

# Backend
cd skycheck-backend
npx tsc --noEmit
```

Most type errors are from incomplete `.env` — make sure all required vars are set.

### ❌ Route calculation always fails

ORS (OpenRouteService) returns errors for:
1. Coordinates outside the road network (middle of ocean, etc.)
2. Daily limit exceeded (2,000/day — check your ORS dashboard)
3. Missing API key — check `ORS_API_KEY` in `.env`

The backend falls back to straight-line haversine distance if ORS fails, so the app still works.

### Fare estimates look different from actual driver quotes

SkyCheck estimates several transport modes for budgeting:

- Jeepney uses LTFRB public fare guidance and assumes a jeepney route exists.
- Taxi uses LTFRB taxi matrix style calculation.
- Tricycle is marked conditional/limited because fares and allowed routes are set by local LGUs, and tricycles may be restricted from national highways or out-of-zone trips.
- Maxim/app-based rides can change due to demand, driver availability, or platform pricing.

Treat these as commute planning estimates, not official receipts.

---

## 12. API Architecture Decisions

Here's why each external service was chosen:

| Service | Chosen | Alternative Considered | Why Chosen |
|---------|--------|----------------------|------------|
| Weather | **Open-Meteo** | OpenWeatherMap, AccuWeather | No API key, ECMWF-based (most accurate global model), unlimited free |
| Traffic | **TomTom** | HERE Maps (needs CC now) | 2,500 req/day free, no CC required; rush-hour heuristic fallback; good PH coverage |
| Routing | **OpenRouteService** | Google Directions, Mapbox | 2,000/day free; no credit card; solid OSM road data |
| Elevation | **Open-Topo-Data** | Google Elevation, Mapbox Tiling | Completely free, SRTM 30m resolution (sufficient for flood proxy) |
| Geocoding | **Nominatim** | Google Places, MapTiler | Completely free OSM data; good PH address coverage |
| Map Tiles | **MapTiler** | Google Maps, Mapbox | 100k/month free; prettier than bare OSM; no credit card |
| Database | **Neon.tech** | Supabase, Railway, local PG | Best free tier (3GB, auto-pause); fastest setup |
| Auth | **Firebase Auth + backend JWT** | Supabase Auth, custom-only auth | Reliable email/password and Google login, Firebase reset emails, backend-controlled app sessions |

---

## 13. Offline / PWA Behavior

SkyCheck uses Workbox (via vite-plugin-pwa) for offline support:

| Data Type | Cache Strategy | Expiry |
|-----------|----------------|--------|
| App shell (HTML/CSS/JS) | **Cache First** | Until new build |
| Open-Meteo weather | **Network First** | 30 minutes |
| TomTom traffic | **Network First** | 30 minutes |
| Map tiles (MapTiler) | **Cache First** | 7 days |
| Backend API responses | **Network First** | 30 minutes |
| Elevation data | **Cache First** | 24 hours |

**What works offline:**
- Viewing last-known weather data and risk level
- Viewing saved routes with last-known risk
- Viewing alerts and notification history
- Full UI navigation

**What requires internet:**
- Fetching fresh weather data
- Searching addresses (Nominatim)
- Creating/updating routes
- Login and registration

---

## 14. Deployment (Optional — for production)

### Deploy Backend (Render — free tier)

1. Push your code to GitHub
2. Go to **https://render.com** → New → **Web Service** → connect your GitHub repo
3. Set **Root Directory** = `skycheck-backend`
4. Build command:
   - `npm install && npm run build && npx prisma generate`
5. Start command:
   - `npm run start`
6. Add environment variables from your local `.env` in Render (never commit secrets)
7. After first deploy, run migrations once:
   - `npx prisma migrate deploy`

### Deploy Frontend (Vercel — free tier)

1. Go to **https://vercel.com** → New Project → Import from GitHub
2. Select `skycheck` folder as root
3. Framework: **Vite**
4. Add environment variable: `VITE_API_BASE_URL` = your Render backend URL
5. Vercel auto-builds and deploys

### Update CORS after deployment

In `skycheck-backend` env vars (on Render):
```env
FRONTEND_URL=https://your-skycheck.vercel.app
APP_URL=https://your-backend.onrender.com
```

---


## 15. GPS Location & Accuracy Notes

SkyCheck requests the device's GPS coordinates on the Dashboard screen. Here is how it behaves in each case:

### Permission granted
- Weather and risk data are fetched for your **exact location** (works anywhere in the Philippines — Olongapo, Subic, Bataan, Zambales, Pampanga, etc.)
- A green **Live** badge appears next to the city name
- The `queryKey` includes real coordinates so React Query caches per-location

### Permission denied, unavailable, or too imprecise
- An amber banner notifies the user that precise location could not be found
- The Home screen location label changes to **Subic, Zambales, Central Luzon, PH**
- The app falls back to **14.8799, 120.2343** automatically
- Weather and risk data are fetched for the Subic fallback area
- The banner recommends using the mobile version for better GPS accuracy
- The user can tap **Allow GPS** in the banner to retry

### Testing GPS in Chrome DevTools (no phone needed)
1. Open DevTools → three-dot menu → **More tools** → **Sensors**
2. Under Location, select a preset or type custom coordinates:
   - Olongapo:  `14.8292, 120.2842`
   - Subic:     `14.8799, 120.2343`
   - Angeles:   `15.1450, 120.5930`
   - Bataan:    `14.6417, 120.4817`
   - Pampanga:  `15.0794, 120.6200`
3. Reload the app — it will use the spoofed coordinates

### Risk calculation across a route
When a route has both a start and destination, SkyCheck:
1. Fetches Open-Meteo weather at **both coordinates** in parallel
2. Evaluates weather risk at each endpoint, takes the **worst**
3. Evaluates flood risk at **both elevations** (Open-Topo-Data), takes the **lowest elevation** (highest flood danger)
4. Evaluates traffic at the **start point** (representative of departure conditions)
5. Overall risk = `max(weather, traffic, flood)` across both endpoints

This means a route from elevated Olongapo to flood-prone Pampanga lowlands correctly shows HIGH flood risk even if the start point is safe.

### Flood thresholds (calibrated for Central Luzon)

| Elevation | Rain Probability | Flood Risk |
|-----------|-----------------|------------|
| ≤ 8m ASL  | ≥ 55% OR ≥ 8mm precip | **HIGH** |
| ≤ 8m ASL  | ≥ 35%           | **MEDIUM** |
| ≤ 20m ASL | ≥ 55% + ≥ 8mm  | **HIGH** |
| ≤ 20m ASL | ≥ 35%           | **MEDIUM** |
| > 20m ASL | any             | **LOW** |

These thresholds are based on PHIVOLCS / NDRRMC flood hazard data for Zambales and Pampanga.

---

## Quick Command Reference

```bash
# ── Backend ────────────────────────────────────────────────────────
cd skycheck-backend
npm install                          # Install dependencies
npm run dev                          # Start dev server (hot reload)
npm run build && npm start           # Build and run production
npx prisma migrate dev               # Apply DB migrations
npx prisma studio                    # Open DB GUI (localhost:5555)
npx prisma generate                  # Regenerate Prisma client after schema changes

# ── Frontend ───────────────────────────────────────────────────────
cd skycheck
npm install                          # Install dependencies
npm run dev                          # Start Vite dev server
npm run build                        # Build for production (dist/)
npm run preview                      # Preview production build locally

# ── Icons ──────────────────────────────────────────────────────────
cd skycheck
pip3 install cairosvg
python3 scripts/generate-icons.py   # Generate pwa-192.png & pwa-512.png

# ── Utilities ──────────────────────────────────────────────────────
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Test weather API directly
curl "https://api.open-meteo.com/v1/forecast?latitude=14.83&longitude=120.28&current=temperature_2m,weather_code"

# Test TomTom traffic directly (replace YOUR_TOMTOM_KEY)
curl "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?key=YOUR_TOMTOM_KEY&point=14.83,120.28"

# Test ORS routing directly (replace YOUR_KEY)
curl "https://api.openrouteservice.org/v2/directions/driving-car?start=120.28,14.83&end=120.27,14.82" -H "Authorization: YOUR_KEY"
```

---

*SkyCheck V1.0 · Code-B · BSCS-2C · Gordon College · Built with ❤️ for Olongapo commuters*
