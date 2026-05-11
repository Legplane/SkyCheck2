# SkyCheck

SkyCheck is a Progressive Web App for student commuters that helps answer one daily question: **is it safe and practical to go to school today?**

The app combines weather, traffic, flood risk, route data, school advisories, government advisories, and a daily health check into a simple Go / No-Go decision. It is designed for students around Gordon College and nearby Philippine commute routes, where rain, heat, flooding, traffic, and class announcements can quickly affect travel safety.

## Live Deployment

- Frontend: https://sky-check2-hcxk.vercel.app
- Backend: https://skycheck2.onrender.com

## Main Features

- Firebase authentication with email/password and Google sign-in
- Email verification and password reset
- Real-time weather dashboard using Open-Meteo with optional AccuWeather fallback
- GPS-based location tracking with automatic Subic fallback when precise location is unavailable
- Live or estimated traffic risk using TomTom Traffic API with rush-hour fallback
- Route-aware TomTom traffic sampling across start, middle, and destination points, with low/moderate/high traffic volume display
- Route saving with distance, travel time, multi-mode fare estimates, student/PWD/senior discounts, and risk status
- Smart combined risk messages that explain whether weather/heat, traffic, flood risk, or a mix of them is causing the warning
- Street-level route map preview using Leaflet, MapTiler/OpenStreetMap tiles, and closer route zoom
- Flood risk estimation using elevation and rain indicators
- Go / No-Go decision engine based on health, weather, traffic, flood, heat, advisories, and selected route risk when available
- Daily health check
- School and government announcement support
- PWA install support for mobile
- Offline mode with cached weather, cached saved routes, and offline Go / No-Go estimate
- Responsive UI for phone, tablet, laptop, and desktop, including mobile-safe route cards that avoid cropped route/fare text

## Technology Stack

### Frontend

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query with persisted cache
- Zustand
- Firebase Auth
- Leaflet / React Leaflet
- Vite PWA / Workbox

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL / Neon
- Firebase Admin SDK
- JWT session issuing
- Node Cron for scheduled route risk checks

### External Services

- Firebase Authentication
- Neon PostgreSQL
- Open-Meteo Weather API
- AccuWeather API
- TomTom Traffic API
- OpenStreetMap Nominatim
- OpenTopoData
- MapTiler
- Vercel
- Render

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
EMAIL_USER=
EMAIL_PASS=
ORS_API_KEY=
TOMTOM_API_KEY=
ACCUWEATHER_API_KEY=
```

## Deployment

### Vercel Frontend

- Root directory: `skycheck`
- Build command: `npm run build`
- Output directory: `dist`

### Render Backend

- Root directory: `skycheck-backend`
- Build command: `npm install --include=dev && npm run build`
- Start command: `npm start`

## Offline Behavior

SkyCheck is a PWA and stores selected query data locally.

When offline, users can:

- View the last cached weather dashboard
- View saved routes from the last successful route fetch
- Start a health check locally
- Generate a Go / No-Go estimate using cached weather and the local health check

When offline, users cannot:

- Add, edit, or delete routes
- Fetch new weather, traffic, flood, or advisory data
- Search new addresses

## GPS And Location Behavior

SkyCheck first asks the user to grant GPS access. If precise tracking succeeds, the dashboard fetches weather and risk information for the user's live coordinates and shows a `Live +/-Xm` badge.

If precise tracking fails, is blocked, or is unavailable on a PC/laptop, the app automatically uses the Subic fallback coordinates:

- Fallback location: `Subic, Zambales, Central Luzon, PH`
- Fallback coordinates: `14.8799, 120.2343`
- The dashboard location label changes to the fallback area.
- Weather, traffic, flood, and risk data are fetched for the fallback area.
- The user is notified that precise location could not be found and that mobile GPS is recommended for better accuracy.

Mobile devices are generally more accurate because they usually have real GPS hardware. PC/laptop browsers often depend on Wi-Fi or IP-based location, which can be rough or unavailable.

## Documentation

For system architecture, feature details, API notes, offline behavior, and presentation-ready explanations, see [DOCUMENTATION.md](./DOCUMENTATION.md).
