# SkyCheck

SkyCheck is a Progressive Web App for student commuters that helps answer one daily question: **is it safe and practical to go to Gordon College today?**

The app combines weather, traffic, flood risk, route data, school announcements, and government advisories into a simple Go / No-Go decision. It is built for students commuting to Gordon College (Olongapo City) from within Olongapo, Subic, and Bataan, where rain, heat, flooding, traffic, and class announcements can quickly affect travel.

## Live Deployment

- Frontend: https://sky-check2-hcxk.vercel.app
- Backend: https://skycheck2.onrender.com

## Main Features

- Firebase authentication with email/password and Google sign-in, email verification, and password reset
- Account lockout after repeated failed logins and rate limiting on sensitive auth endpoints
- Weather dashboard (current conditions, 6-hour forecast, commute tips) for Olongapo, with AccuWeather as the primary provider when configured, and Open-Meteo and MET Norway as fallbacks
- GPS-based location with an automatic Olongapo fallback when precise or in-area location is unavailable
- Traffic risk from TomTom: route-aware travel time (live vs free-flow) for saved routes, area flow sampling for the dashboard, and a time-based rush-hour estimate when TomTom is unavailable
- **Fixed destination: Gordon College.** Users choose only the starting point, either with a "use my current location" button (GPS plus reverse geocoding) or by typing an address
- Route saving (up to 5 per user) with distance, travel time, multi-mode fare estimates, student/PWD/senior discounted fares, and route risk status
- Coverage-area limit: starting points must be inside Olongapo, Subic, and Bataan
- Smart combined risk messages that explain whether weather/heat, traffic, flood, or a mix is causing the warning
- Route map preview using Leaflet with MapTiler or OpenStreetMap tiles
- Flood risk estimation using elevation and rain indicators
- Go / No-Go decision engine based on weather, flood, traffic, heat index, school status, government advisories, and the selected route's risk
- School and government announcements shown in the app
- Alerts with per-user preferences (morning alerts, sound, vibration)
- PWA install support for mobile
- Offline mode with cached weather, cached saved routes, and an offline Go / No-Go estimate
- Responsive UI for phone, tablet, laptop, and desktop

### Not included

- **Health assessment.** The daily symptom self-check was removed because self-reported answers can be easily manipulated or invalidated, so it was not a reliable input.
- **Direct PAGASA / Panahon data.** Weather values come from commercial and open weather APIs, not from PAGASA. PAGASA is used only as a reference for risk thresholds (heat index bands, wind levels). See [Weather data sources](#weather-data-sources).
- **Google Maps traffic.** Google's traffic-aware routing needs a billing account, so TomTom is used instead. See [DOCUMENTATION.md](./DOCUMENTATION.md) for the trade-offs.

## Technology Stack

### Frontend

- React 18, TypeScript, Vite
- Tailwind CSS
- React Router
- TanStack Query with persisted cache
- Zustand
- Firebase Auth
- Leaflet / React Leaflet
- Vite PWA / Workbox

### Backend

- Node.js, Express, TypeScript
- Prisma ORM with PostgreSQL (Neon)
- Firebase Admin SDK and Google Auth Library
- JWT session issuing
- Nodemailer (verification and reset emails)
- Node Cron for scheduled route risk checks and morning alerts

### External Services

| Purpose | Service |
|---|---|
| Authentication | Firebase Authentication, Google Sign-In |
| Database | Neon PostgreSQL |
| Weather | AccuWeather (primary, optional), Open-Meteo, MET Norway |
| Traffic | TomTom Traffic Flow and Routing |
| Route distance / time | OpenRouteService, with OSRM and straight-line fallbacks |
| Elevation (flood risk) | OpenTopoData, Open-Meteo elevation |
| Address search / reverse geocoding | OpenStreetMap Nominatim |
| Map tiles | MapTiler, OpenStreetMap |
| Hosting | Vercel (frontend), Render (backend) |

## Weather data sources

The backend fetches weather for the Olongapo city center and caches it for 15 minutes, so every user in the service area sees the same city-level reading. Provider order:

1. **AccuWeather**, when `ACCUWEATHER_API_KEY` is set (with a daily request budget and quota cooldown)
2. **Open-Meteo**, if AccuWeather is not configured or fails
3. **MET Norway**, if Open-Meteo fails or is rate-limited
4. **Stale cache** (up to 6 hours old), if every provider is down

PAGASA publishes no official public weather API, so PAGASA data is not fetched. Risk thresholds follow PAGASA's heat index scale and wind levels. Official PAGASA and local government advisories can be entered as government announcements, which feed the Go / No-Go decision.

## Project Structure

```text
SkyCheck2-main/
|-- skycheck/                 # Frontend React PWA
|-- skycheck-backend/         # Express + Prisma backend
|-- SETUP_GUIDE.md            # Detailed setup guide
|-- DOCUMENTATION.md          # System documentation
`-- README.md                 # Project overview
```

## Local Development

### Frontend

```bash
cd skycheck
npm install
npm run dev
```

### Backend

```bash
cd skycheck-backend
npm install
npm run db:generate
npm run dev
```

To test GPS on a phone over your local network, run the frontend with `npm run dev:https` (browsers require HTTPS for GPS).

## Required Environment Variables

### Frontend - Vercel / `skycheck/.env`

```env
VITE_API_BASE_URL=https://skycheck2.onrender.com
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_MAPTILER_KEY=
```

### Backend - Render / `skycheck-backend/.env`

```env
DATABASE_URL=
JWT_SECRET=
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://sky-check2-hcxk.vercel.app
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
GOOGLE_CLIENT_ID=
EMAIL_USER=
EMAIL_PASS=
ORS_API_KEY=
TOMTOM_API_KEY=
ACCUWEATHER_API_KEY=
```

Optional backend variables (`SMTP_*`, `EMAIL_FROM`, `EXTRA_ORIGINS`, `ACTIVE_USER_WINDOW_MINUTES`, `ACCUWEATHER_*`, `MET_NO_USER_AGENT`, `DISABLE_CRON`, `REQUIRE_EMAIL_VERIFICATION`) are listed in [DOCUMENTATION.md](./DOCUMENTATION.md).

## Deployment

### Vercel Frontend

- Root directory: `skycheck`
- Build command: `npm run build`
- Output directory: `dist`

### Render Backend

- Root directory: `skycheck-backend`
- Build command: `npm install --include=dev && npm run build`
- Start command: `npm start` (runs `prisma migrate deploy` first)

## Offline Behavior

SkyCheck is a PWA and stores selected query data locally for up to 24 hours.

When offline, users can:

- View the last cached weather dashboard
- View saved routes from the last successful route fetch
- Open the Go / No-Go screen and get an estimate based on cached weather

When offline, users cannot:

- Add, edit, or delete routes
- Fetch new weather, traffic, flood, or advisory data
- Search new addresses

## GPS And Location Behavior

SkyCheck asks for GPS access and only trusts a fix that is precise enough and inside the coverage area (Olongapo, Subic, Bataan). If the fix is trusted, the dashboard shows a `Live +/-Xm` badge and uses your coordinates for the location label and the "use my current location" start point.

If GPS is denied, unavailable, too imprecise, or outside the coverage area, the app falls back to Olongapo and tells the user:

- Fallback location: `Olongapo, Zambales, Central Luzon`
- Fallback coordinates: `14.8386, 120.2842`

Mobile devices are generally more accurate because they have real GPS hardware. PC/laptop browsers often use Wi-Fi or IP-based location, which can be rough or unavailable. In that case the user can type their starting point when adding a route.

## Documentation

For system architecture, feature details, API notes, offline behavior, and presentation-ready explanations, see [DOCUMENTATION.md](./DOCUMENTATION.md).
