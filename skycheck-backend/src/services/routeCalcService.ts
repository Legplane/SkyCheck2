import axios from 'axios';
import type { RouteCalcResult } from '../types';

// ─────────────────────────────────────────────────────────────────
// OpenRouteService (ORS) Route Calculator
// Free: 2,000 req/day — register at https://openrouteservice.org
// Note: ORS uses [lon, lat] order (GeoJSON convention)
// ─────────────────────────────────────────────────────────────────

const ORS_BASE = 'https://api.openrouteservice.org/v2/directions/driving-car';
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

interface ORSResponse {
  routes: Array<{
    summary: {
      distance: number;  // metres
      duration: number;  // seconds
    };
    geometry: string;    // encoded polyline or GeoJSON depending on format param
  }>;
  features?: Array<{
    geometry: {
      coordinates: [number, number][];
    };
    properties: {
      summary: { distance: number; duration: number };
    };
  }>;
}

interface OSRMResponse {
  code: string;
  routes?: Array<{
    distance: number; // metres
    duration: number; // seconds
    geometry?: {
      coordinates: [number, number][];
    };
  }>;
}

function toOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildFallbackEstimate(
  startLat: number, startLon: number,
  destLat: number, destLon: number,
): RouteCalcResult {
  // Approximate road distance from straight-line (x1.35) and ~20 km/h average speed.
  const distKm = haversineKm(startLat, startLon, destLat, destLon) * 1.35;
  const distanceKm = toOneDecimal(distKm);
  const durationMin = Math.max(1, Math.round(distKm * 3));
  return {
    distanceKm,
    durationMin,
    waypoints: [[startLat, startLon], [destLat, destLon]],
  };
}

async function tryOSRMRoute(
  startLat: number, startLon: number,
  destLat: number, destLon: number,
): Promise<RouteCalcResult | null> {
  try {
    const url = `${OSRM_BASE}/${startLon},${startLat};${destLon},${destLat}`;
    const { data } = await axios.get<OSRMResponse>(url, {
      params: {
        overview: 'full',
        geometries: 'geojson',
      },
      timeout: 10000,
    });

    const route = data.routes?.[0];
    if (!route) return null;

    const distanceKm = toOneDecimal(route.distance / 1000);
    const durationMin = Math.max(1, Math.round(route.duration / 60));
    const waypoints: [number, number][] =
      route.geometry?.coordinates?.map(([lon, lat]) => [lat, lon]) ??
      [[startLat, startLon], [destLat, destLon]];

    return { distanceKm, durationMin, waypoints };
  } catch (error) {
    console.warn('[Route] OSRM request failed', error);
    return null;
  }
}

export async function calculateRoute(
  startLat: number, startLon: number,
  destLat:  number, destLon:  number,
): Promise<RouteCalcResult> {
  const ORS_KEY = process.env.ORS_API_KEY;

  if (!ORS_KEY) {
    console.warn('[Route] ORS_API_KEY not set — trying OSRM fallback');
    const osrmRoute = await tryOSRMRoute(startLat, startLon, destLat, destLon);
    if (osrmRoute) return osrmRoute;
    console.warn('[Route] OSRM unavailable — returning straight-line estimate');
    return buildFallbackEstimate(startLat, startLon, destLat, destLon);
  }

  try {
    const { data } = await axios.get<ORSResponse>(ORS_BASE, {
      params: {
        start: `${startLon},${startLat}`,
        end:   `${destLon},${destLat}`,
      },
      headers: {
        'Authorization': ORS_KEY,
        'Accept':        'application/json, application/geo+json',
      },
      timeout: 10000,
    });

    // Preferred: GeoJSON FeatureCollection response.
    const feature = data.features?.[0];
    if (feature) {
      const distanceKm = toOneDecimal(feature.properties.summary.distance / 1000);
      const durationMin = Math.round(feature.properties.summary.duration / 60);

      // Convert [lon, lat] GeoJSON coords to [lat, lon] for Leaflet
      const waypoints: [number, number][] = feature.geometry.coordinates.map(
        ([lon, lat]) => [lat, lon]
      );

      return { distanceKm, durationMin, waypoints };
    }

    // Fallback: standard ORS JSON response with `routes[0].summary`.
    const route = data.routes?.[0];
    if (route?.summary) {
      const distanceKm = toOneDecimal(route.summary.distance / 1000);
      const durationMin = Math.round(route.summary.duration / 60);
      return {
        distanceKm,
        durationMin,
        // Keep map usable even when geometry is encoded and not decoded here.
        waypoints: [[startLat, startLon], [destLat, destLon]],
      };
    }

    console.warn('[Route] ORS returned unexpected payload — using estimate');
    const osrmRoute = await tryOSRMRoute(startLat, startLon, destLat, destLon);
    if (osrmRoute) return osrmRoute;
    return buildFallbackEstimate(startLat, startLon, destLat, destLon);
  } catch (error) {
    console.warn('[Route] ORS request failed — trying OSRM', error);
    const osrmRoute = await tryOSRMRoute(startLat, startLon, destLat, destLon);
    if (osrmRoute) return osrmRoute;
    console.warn('[Route] OSRM unavailable — using estimate');
    return buildFallbackEstimate(startLat, startLon, destLat, destLon);
  }
}

// Haversine formula for straight-line fallback distance
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
