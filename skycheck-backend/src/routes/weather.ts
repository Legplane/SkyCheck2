import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { fetchWeatherData } from '../services/weatherService';
import { evaluateCombinedRisk } from '../services/combinedRiskService';
import { getCommuteTips } from '../services/weatherService';

const router = Router();

// ─────────────────────────────────────────────────────────────────
// GET /weather?lat=&lon=
// Returns localised weather for the exact GPS coords sent by the
// frontend. The frontend always sends real GPS coords (or the
// Olongapo fallback if GPS is denied) — never hardcoded defaults.
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

    // Weather bundle + reverse-geocode run in parallel (same GPS coords)
    const [{ current, hourly, providerPlaceName }, nominatim] = await Promise.all([
      fetchWeatherData(lat, lon),
      resolvePhLocation(lat, lon),
    ]);

    const risk = await evaluateCombinedRisk(lat, lon, current);
    const commuteTips = getCommuteTips(risk.weather, risk.traffic, risk.flood, current);

    const location = pickDisplayLocation({
      nominatim,
      accuWeatherLocality: providerPlaceName,
    });

    res.json({ location, lat, lon, current, hourly, risk, commuteTips });
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
    const zoom = '16'; // barangay / suburb level when available
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=${zoom}&addressdetails=1`;
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'SkyCheck-StudentApp/1.0 (gordoncollege.edu.ph)' },
      signal:  AbortSignal.timeout(4000),
    });

    if (!res.ok) return 'Your Area';

    const data = await res.json() as {
      address?: {
        city?:           string;
        municipality?: string;
        city_district?: string;
        neighbourhood?: string;
        neighborhood?: string;
        quarter?:       string;
        residential?:   string;
        county?:       string;
        state?:        string;
        town?:         string;
        village?:      string;
        suburb?:       string;
      };
    };

    const a = data.address;
    if (!a) return 'Your Area';

    // Pick the most specific readable PH locality first. This lets places
    // like Old Cabalan show instead of only the wider Olongapo label.
    const name =
      a.suburb         ||
      a.village        ||
      a.neighbourhood  ||
      a.neighborhood   ||
      a.quarter        ||
      a.residential    ||
      a.city_district  ||
      a.town           ||
      a.municipality   ||
      a.city           ||
      a.county         ||
      a.state          ||
      'Your Area';

    return stripPhPlaceSuffix(name);
  } catch {
    return 'Your Area';
  }
}

export default router;
