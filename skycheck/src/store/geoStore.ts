import { create } from 'zustand';
import { isWithinCoverage, COVERAGE_AREA_LABEL } from '../constants/coverage';

// ─────────────────────────────────────────────────────────────────
// Global GPS Store — singleton, survives page navigation
// GPS starts once in AppShell and never restarts on route change.
//
// Accuracy pipeline (per incoming fix):
//   1. Drop stale fixes (old timestamp) and IP-grade fixes (> 2 km).
//   2. Drop teleport jumps (implausible speed from last accepted fix).
//   3. Blend recent fixes with inverse-variance weights, ignoring outliers,
//      so the pin stops "jumping" around the user's real position.
//   4. Keep the last good fix in localStorage so a cold start / weak
//      signal shows the last known place instead of an arbitrary default.
//   5. Users can also drop a manual pin when GPS is poor (e.g. laptop).
// ─────────────────────────────────────────────────────────────────

export const FALLBACK_LOCATION = {
  lat: 14.8386,
  lon: 120.2842,
  label: 'Olongapo',
  displayName: 'Olongapo, Zambales, Central Luzon',
};

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';
/** Where the current coordinates came from. */
export type GeoSource = 'gps' | 'last-known' | 'manual' | 'fallback';
export type GeoQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'none';

interface GeoState {
  status:         GeoStatus;
  source:         GeoSource;
  lat:            number;
  lon:            number;
  accuracy:       number;
  /** ISO time of the fix currently shown (null for fallback). */
  fixAt:          string | null;
  reason:         string;
  startGPS:       () => void;
  skipToFallback: () => void;
  /** Fresh GPS fix (maximumAge 0). Updates coords when successful; keeps coords if denied/timeout. */
  refreshLocation: () => Promise<boolean>;
  /** User-chosen pin. Returns false (and changes nothing) when outside the coverage area. */
  setManualLocation: (lat: number, lon: number) => boolean;
}

// ── Tunables ──────────────────────────────────────────────────────
const EXCELLENT_ACCURACY_M   = 25;
const IDEAL_ACCURACY_M       = 50;   // settle immediately at or below this
const GOOD_ACCURACY_M        = 100;
const MAX_TRUSTED_ACCURACY_M = 300;  // above this we don't trust the pin for weather
const MAX_ACCEPTED_ACCURACY_M = 2_000; // above this it's an IP/cell guess — ignore
const MAX_FIX_AGE_MS         = 30_000;
const MAX_PLAUSIBLE_SPEED_MS = 60;   // ~216 km/h
const SMOOTH_WINDOW_MS       = 45_000;
const SMOOTH_MAX_FIXES       = 8;
const GPS_SETTLE_TIMEOUT_MS  = 25_000;
const REFRESH_SETTLE_TIMEOUT_MS = 18_000;
const LAST_KNOWN_MAX_AGE_MS  = 6 * 60 * 60 * 1000;
const LAST_FIX_KEY           = 'skycheck-last-fix';

const PRECISE_LOCATION_FALLBACK_REASON = 'Precise location unavailable. Showing Olongapo. For better accuracy, use mobile GPS or drop a pin on the map.';
const OUTSIDE_COVERAGE_REASON = `You appear to be outside ${COVERAGE_AREA_LABEL}, which is the area SkyCheck covers.`;

export function accuracyQuality(accuracyM: number): GeoQuality {
  if (!accuracyM || accuracyM <= 0) return 'none';
  if (accuracyM <= EXCELLENT_ACCURACY_M) return 'excellent';
  if (accuracyM <= GOOD_ACCURACY_M) return 'good';
  if (accuracyM <= MAX_TRUSTED_ACCURACY_M) return 'fair';
  return 'poor';
}

// ── GPS internals — live outside React tree ──────────────────────
interface Sample { lat: number; lon: number; accuracy: number; t: number }

let _watchId:  number | null = null;
let _timer:    ReturnType<typeof setTimeout> | null = null;
let _resolved  = false;
let _bestFix: GeolocationPosition | null = null;
let _refreshPromise: Promise<boolean> | null = null;
let _samples: Sample[] = [];
let _lastAccepted: Sample | null = null;

function _distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _isBetterFix(pos: GeolocationPosition, current: GeolocationPosition | null): boolean {
  if (!current) return true;
  return pos.coords.accuracy < current.coords.accuracy;
}

/** Returns false for fixes that must be ignored entirely. */
function _acceptFix(pos: GeolocationPosition): boolean {
  const { accuracy, latitude, longitude } = pos.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > MAX_ACCEPTED_ACCURACY_M) return false;

  // Cached / replayed positions from the browser.
  if (pos.timestamp && Math.abs(Date.now() - pos.timestamp) > MAX_FIX_AGE_MS) return false;

  // Teleport filter: a poor fix that implies absurd speed is a glitch.
  if (_lastAccepted) {
    const dt = Math.max(1, (Date.now() - _lastAccepted.t) / 1000);
    const dist = _distanceM(_lastAccepted.lat, _lastAccepted.lon, latitude, longitude);
    const slack = accuracy + _lastAccepted.accuracy;
    if (dist - slack > MAX_PLAUSIBLE_SPEED_MS * dt && accuracy > 30) return false;
  }
  return true;
}

/** Inverse-variance blend of recent, mutually consistent fixes. */
function _blend(pos: GeolocationPosition): { lat: number; lon: number; accuracy: number } {
  const now = Date.now();
  const fresh: Sample = {
    lat: pos.coords.latitude, lon: pos.coords.longitude,
    accuracy: Math.max(pos.coords.accuracy, 3), t: now,
  };
  _samples = [..._samples, fresh]
    .filter((s) => now - s.t <= SMOOTH_WINDOW_MS)
    .slice(-SMOOTH_MAX_FIXES);

  // Outlier rejection: keep samples within reach of the newest fix.
  const consistent = _samples.filter(
    (s) => _distanceM(s.lat, s.lon, fresh.lat, fresh.lon) <= (s.accuracy + fresh.accuracy) * 1.5 + 30,
  );
  const use = consistent.length ? consistent : [fresh];

  let wSum = 0, latSum = 0, lonSum = 0;
  for (const s of use) {
    const w = 1 / (s.accuracy * s.accuracy);
    wSum += w; latSum += s.lat * w; lonSum += s.lon * w;
  }
  const bestAcc = Math.min(...use.map((s) => s.accuracy));
  const combined = Math.max(1 / Math.sqrt(wSum), bestAcc * 0.7);

  _lastAccepted = { lat: fresh.lat, lon: fresh.lon, accuracy: fresh.accuracy, t: now };
  return { lat: latSum / wSum, lon: lonSum / wSum, accuracy: combined };
}

function _saveLastFix(lat: number, lon: number, accuracy: number) {
  try {
    localStorage.setItem(LAST_FIX_KEY, JSON.stringify({ lat, lon, accuracy, ts: Date.now() }));
  } catch { /* storage unavailable */ }
}

function _loadLastFix(): { lat: number; lon: number; accuracy: number; ts: number } | null {
  try {
    const raw = localStorage.getItem(LAST_FIX_KEY);
    if (!raw) return null;
    const f = JSON.parse(raw) as { lat: number; lon: number; accuracy: number; ts: number };
    if (Date.now() - f.ts > LAST_KNOWN_MAX_AGE_MS) return null;
    if (!isWithinCoverage(f.lat, f.lon)) return null;
    return f;
  } catch {
    return null;
  }
}

// Returns true when the fix was applied as a live location, false when it was
// outside the service area and the Olongapo fallback was used instead.
function _applyFix(pos: GeolocationPosition, set: (state: Partial<GeoState>) => void): boolean {
  const blended = _blend(pos);
  if (!isWithinCoverage(blended.lat, blended.lon)) {
    set({
      status:   'denied',
      source:   'fallback',
      reason:   OUTSIDE_COVERAGE_REASON,
      lat:      FALLBACK_LOCATION.lat,
      lon:      FALLBACK_LOCATION.lon,
      accuracy: Math.round(pos.coords.accuracy),
      fixAt:    null,
    });
    return false;
  }
  const accuracy = Math.round(blended.accuracy);
  set({
    status:   'granted',
    source:   'gps',
    lat:      blended.lat,
    lon:      blended.lon,
    accuracy,
    fixAt:    new Date().toISOString(),
    reason:   '',
  });
  _saveLastFix(blended.lat, blended.lon, accuracy);
  return true;
}

function _clearTimer() {
  if (_timer !== null) {
    clearTimeout(_timer);
    _timer = null;
  }
}

function _stopGPS() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  _clearTimer();
}

function _resetSession() {
  _resolved = false;
  _bestFix = null;
  _samples = [];
  _lastAccepted = null;
}

/** Weak/no GPS: prefer a recent last-known pin over the generic Olongapo default. */
function _applyFallback(
  set: (state: Partial<GeoState>) => void,
  reason = PRECISE_LOCATION_FALLBACK_REASON,
  accuracy = 0,
  allowLastKnown = true,
) {
  const last = allowLastKnown ? _loadLastFix() : null;
  if (last) {
    set({
      status: 'granted',
      source: 'last-known',
      reason: 'Using your last known location. Tap refresh when you have a better GPS signal.',
      lat: last.lat,
      lon: last.lon,
      accuracy: Math.round(last.accuracy),
      fixAt: new Date(last.ts).toISOString(),
    });
    return;
  }
  set({
    status: 'denied',
    source: 'fallback',
    reason,
    lat: FALLBACK_LOCATION.lat,
    lon: FALLBACK_LOCATION.lon,
    accuracy,
    fixAt: null,
  });
}

export const useGeoStore = create<GeoState>((set, get) => ({
  status:   'idle',
  source:   'fallback',
  lat:      FALLBACK_LOCATION.lat,
  lon:      FALLBACK_LOCATION.lon,
  accuracy: 0,
  fixAt:    null,
  reason:   '',

  startGPS: () => {
    const { status: currentStatus, source } = get();
    // Once permission is granted, the browser remembers it. Keep the watcher
    // alive, but allow a stuck request to restart.
    if (currentStatus === 'granted' && source === 'gps' && _watchId !== null) return;

    if (!('geolocation' in navigator)) {
      set({
        status: 'unavailable',
        source: 'fallback',
        reason: 'GPS is not supported on this device.',
        lat: FALLBACK_LOCATION.lat,
        lon: FALLBACK_LOCATION.lon,
        accuracy: 0,
        fixAt: null,
      });
      return;
    }

    _resetSession();
    _stopGPS();
    set({ status: 'requesting', reason: '' });

    _timer = setTimeout(() => {
      if (!_resolved) {
        _resolved = true;
        _clearTimer();
        if (_bestFix && _bestFix.coords.accuracy <= MAX_TRUSTED_ACCURACY_M) {
          _applyFix(_bestFix, set);
        } else {
          _applyFallback(set, PRECISE_LOCATION_FALLBACK_REASON, _bestFix ? Math.round(_bestFix.coords.accuracy) : 0);
        }
      }
    }, GPS_SETTLE_TIMEOUT_MS);

    const onSuccess = (pos: GeolocationPosition) => {
      if (!_acceptFix(pos)) return;
      if (_isBetterFix(pos, _bestFix)) _bestFix = pos;
      const trusted = pos.coords.accuracy <= MAX_TRUSTED_ACCURACY_M;

      if (!_resolved && pos.coords.accuracy <= IDEAL_ACCURACY_M) {
        _resolved = true;
        _clearTimer();
        _applyFix(pos, set);
        return;
      }

      // After settling, keep refining: every trusted fix is blended in, so the
      // pin tightens while standing still and follows when actually moving.
      if (_resolved && trusted && get().source !== 'manual') {
        _applyFix(pos, set);
      }
    };

    const onError = (err: GeolocationPositionError) => {
      if (_resolved) return;
      _resolved = true;
      _clearTimer();
      const reason =
        err.code === 1 ? 'Location permission is blocked in your browser. Enable it in site settings.'
        : err.code === 2 ? 'Location unavailable'
        : 'Location timed out';
      if (_bestFix && _bestFix.coords.accuracy <= MAX_TRUSTED_ACCURACY_M) {
        _applyFix(_bestFix, set);
      } else {
        // Permission blocked → never silently reuse an old pin.
        if (err.code === 1) _stopGPS();
        _applyFallback(set, reason, _bestFix ? Math.round(_bestFix.coords.accuracy) : 0, err.code !== 1);
      }
    };

    // Phase 1: one-shot high-accuracy attempt
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      onError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_SETTLE_TIMEOUT_MS },
    );

    // Phase 2: high-accuracy continuous watch
    _watchId = navigator.geolocation.watchPosition(
      onSuccess, onError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_SETTLE_TIMEOUT_MS },
    );
  },

  skipToFallback: () => {
    _resolved = true;
    _bestFix = null;
    _stopGPS();
    set({
      status: 'denied', source: 'fallback', reason: 'Skipped',
      lat: FALLBACK_LOCATION.lat, lon: FALLBACK_LOCATION.lon, accuracy: 0, fixAt: null,
    });
  },

  setManualLocation: (lat, lon) => {
    if (!isWithinCoverage(lat, lon)) return false;
    _resolved = true;
    _stopGPS();
    set({
      status: 'granted', source: 'manual', reason: '',
      lat, lon, accuracy: 0, fixAt: new Date().toISOString(),
    });
    _saveLastFix(lat, lon, 0);
    return true;
  },

  refreshLocation: () => {
    if (_refreshPromise) return _refreshPromise;

    if (!('geolocation' in navigator)) {
      return Promise.resolve(false);
    }

    _refreshPromise = new Promise<boolean>((resolve) => {
      _resetSession();
      _stopGPS();
      set({ status: 'requesting', reason: '' });

      let settled = false;
      let refreshTimer: ReturnType<typeof setTimeout> | null = null;

      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        if (refreshTimer) clearTimeout(refreshTimer);
        _stopGPS();
        _refreshPromise = null;
        resolve(success);
      };

      // Collect fixes for a short window and keep the best, rather than
      // accepting the first one that happens to be under the threshold.
      refreshTimer = setTimeout(() => {
        if (_bestFix && _bestFix.coords.accuracy <= MAX_TRUSTED_ACCURACY_M) {
          finish(_applyFix(_bestFix, set));
        } else {
          _applyFallback(set, PRECISE_LOCATION_FALLBACK_REASON, _bestFix ? Math.round(_bestFix.coords.accuracy) : 0);
          finish(false);
        }
      }, REFRESH_SETTLE_TIMEOUT_MS);

      const onFix = (pos: GeolocationPosition) => {
        if (!_acceptFix(pos)) return;
        if (_isBetterFix(pos, _bestFix)) _bestFix = pos;
        if (pos.coords.accuracy <= GOOD_ACCURACY_M) {
          finish(_applyFix(pos, set));
        } else if (pos.coords.accuracy > MAX_TRUSTED_ACCURACY_M) {
          set({ reason: PRECISE_LOCATION_FALLBACK_REASON, accuracy: Math.round(pos.coords.accuracy) });
        }
      };

      navigator.geolocation.getCurrentPosition(
        onFix,
        () => {
          if (settled) return;
          _applyFallback(set);
          finish(false);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: REFRESH_SETTLE_TIMEOUT_MS },
      );

      _watchId = navigator.geolocation.watchPosition(
        onFix,
        () => {
          if (!settled) {
            _applyFallback(set);
            finish(false);
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: REFRESH_SETTLE_TIMEOUT_MS },
      );
    });

    return _refreshPromise;
  },
}));

export const selectCoords  = (s: GeoState) => ({ lat: s.lat, lon: s.lon });
export const selectIsLive  = (s: GeoState) => s.status === 'granted';
export const selectIsReady = (s: GeoState) => s.status !== 'idle' && s.status !== 'requesting';
