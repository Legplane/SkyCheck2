import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { fetchWeatherData } from '../services/weatherService';
import { evaluateCombinedRisk } from '../services/combinedRiskService';
import { getCommuteTips } from '../services/weatherService';
import { maybeCreateCurrentWeatherAlert } from '../services/weatherAlertService';

const router = Router();
const OLONGAPO_CITY_CENTER = {
  lat: 14.8386,
  lon: 120.2842,
  label: 'Olongapo',
};

// ─────────────────────────────────────────────────────────────────
// GET /weather?lat=&lon=
// Returns localised weather for the exact GPS coords sent by the
// frontend. The frontend always sends real GPS coords (or the
// Subic fallback if GPS is denied) — never hardcoded defaults.
// ─────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);

    if (isNaN(lat) || isNaN(lon)) {
      res.status(400).json({ error: 'Valid lat and lon query parameters are required.' });
      return;
    }
    if (lat < 4 || lat > 21 || lon < 116 || lon > 127) {
      // Loose bounding box for the Philippines
      res.status(400).json({ error: 'Coordinates appear to be outside the Philippines.' });
      return;
    }

    // Weather and risk are city-level for stable provider matching.
    // Display location still comes from the user's GPS point.
    const [{ current, hourly, providerPlaceName }, nominatim] = await Promise.all([
      fetchWeatherData(lat, lon),
      resolvePhLocation(lat, lon),
    ]);

    const risk = await evaluateCombinedRisk(OLONGAPO_CITY_CENTER.lat, OLONGAPO_CITY_CENTER.lon, current);
    const commuteTips = getCommuteTips(risk.weather, risk.traffic, risk.flood, current);

    const location = pickDisplayLocation({
      nominatim,
      accuWeatherLocality: providerPlaceName,
    });

    if (req.userId) {
      try {
        await maybeCreateCurrentWeatherAlert({
          userId: req.userId,
          location,
          risk,
          weather: current,
        });
      } catch (alertErr) {
        console.warn('[Weather] Alert creation skipped:', (alertErr as Error).message);
      }
    }

    res.json({
      location,
      lat: OLONGAPO_CITY_CENTER.lat,
      lon: OLONGAPO_CITY_CENTER.lon,
      current,
      hourly,
      risk,
      commuteTips,
    });
  } catch (err) {
    console.error('[Weather] Error:', err);
    res.status(503).json({ error: 'Weather data temporarily unavailable. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// Reverse geocode to city name using Nominatim
// Priority: city > municipality > county > state
// Falls back to "Your Area" — never throws
// ─────────────────────────────────────────────────────────────────
function stripPhPlaceSuffix(name: string): string {
  return name
    .replace(/^City of /i, '')
    .replace(/^Municipality of /i, '')
    .trim();
}

function firstPlaceName(parts: Array<string | undefined>): string {
  return parts
    .map((part) => stripPhPlaceSuffix(part ?? ''))
    .find(Boolean) ?? '';
}

function compactLocationName(name: string): string {
  return stripPhPlaceSuffix(name)
    .replace(/\bStreet\b/i, '')
    .replace(/\bRoad\b/i, '')
    .replace(/\bAvenue\b/i, 'Ave')
    .replace(/\s+/g, ' ')
    .replace(/,\s*$/, '')
    .trim();
}

function normalizeOlongapoLocalName(name: string): string {
  const compact = compactLocationName(name);
  const lower = compact.toLowerCase();

  // Nominatim sometimes returns subdivision names instead of the barangay.
  // Holy Spirit Subdivision is commonly used for points inside Tabacuhan.
  if (lower.includes('holy spirit')) return 'Tabacuhan';

  return compact;
}

function pickDisplayLocation(input: {
  nominatim: string;
  accuWeatherLocality?: string;
}): string {
  const nRaw = stripPhPlaceSuffix(input.nominatim);
  if (nRaw && nRaw !== 'Your Area') return nRaw;
  const aw = stripPhPlaceSuffix(input.accuWeatherLocality ?? '').trim();
  if (aw) return aw;
  return nRaw || 'Your Area';
}

async function resolvePhLocation(lat: number, lon: number): Promise<string> {
  try {
    const zoom = '17'; // street / barangay level
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=${zoom}&addressdetails=1`;
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'SkyCheck-StudentApp/1.0 (gordoncollege.edu.ph)' },
      signal:  AbortSignal.timeout(4000),
    });

    if (!res.ok) return 'Your Area';

    const data = await res.json() as {
      address?: {
        road?:          string;
        neighbourhood?: string;
        suburb?:        string;
        quarter?:       string;
        city_district?: string;
        barangay?:      string;
        city?:          string;
        municipality?:  string;
        county?:        string;
        state?:         string;
        town?:          string;
        village?:       string;
      };
    };

    const a = data.address;
    if (!a) return OLONGAPO_CITY_CENTER.label;

    const local =
      a.road ||
      a.barangay ||
      a.neighbourhood ||
      a.quarter ||
      a.city_district ||
      a.village ||
      a.suburb;

    const city =
      a.city ||
      a.municipality ||
      a.town ||
      a.county ||
      OLONGAPO_CITY_CENTER.label;

    const localName = normalizeOlongapoLocalName(local ?? '');
    const cityName = compactLocationName(city);

    if (localName && cityName && localName.toLowerCase() !== cityName.toLowerCase()) {
      return `${localName}, ${cityName}`;
    }

    return firstPlaceName([cityName, a.state]) || OLONGAPO_CITY_CENTER.label;
  } catch {
    return OLONGAPO_CITY_CENTER.label;
  }
}

export default router;
