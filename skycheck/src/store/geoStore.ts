import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────
// Global GPS Store — singleton, survives page navigation
// GPS starts once in AppShell and never restarts on route change.
// ─────────────────────────────────────────────────────────────────

export const FALLBACK_LOCATION = { lat: 14.8799, lon: 120.2343, label: 'Subic' };

export type GeoStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

interface GeoState {
  status:         GeoStatus;
  lat:            number;
  lon:            number;
  accuracy:       number;
  reason:         string;
  startGPS:       () => void;
  skipToFallback: () => void;
  /** Fresh GPS fix (maximumAge 0). Updates coords when successful; keeps coords if denied/timeout. */
  refreshLocation: () => Promise<boolean>;
}

// GPS internals — live outside React tree
let _watchId:  number | null = null;
let _timer:    ReturnType<typeof setTimeout> | null = null;
let _resolved  = false;
let _bestFix: GeolocationPosition | null = null;
const IDEAL_ACCURACY_M = 80;
const MAX_TRUSTED_ACCURACY_M = 500;
const GPS_SETTLE_TIMEOUT_MS = 25_000;
const PRECISE_LOCATION_FALLBACK_REASON = 'Precise location unavailable.';

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

function _applyFix(pos: GeolocationPosition, set: (state: Partial<GeoState>) => void) {
  const { latitude, longitude, accuracy } = pos.coords;
  set({
    status:   'granted',
    lat:      latitude,
    lon:      longitude,
    accuracy: Math.round(accuracy),
    reason:   '',
  });
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
  if (_timer !== null) {
    _clearTimer();
    _timer = null;
  }
}

function _applyFallback(set: (state: Partial<GeoState>) => void, reason = PRECISE_LOCATION_FALLBACK_REASON, accuracy = 0) {
  set({
    status: 'denied',
    reason,
    lat: FALLBACK_LOCATION.lat,
    lon: FALLBACK_LOCATION.lon,
    accuracy,
  });
}

export const useGeoStore = create<GeoState>((set, get) => ({
  status:   'idle',
  lat:      FALLBACK_LOCATION.lat,
  lon:      FALLBACK_LOCATION.lon,
  accuracy: 0,
  reason:   '',

  startGPS: () => {
    const currentStatus = get().status;
    // Once permission is granted, the browser remembers it. Keep the watcher
    // alive, but allow a stuck request to restart.
    if (currentStatus === 'granted' && _watchId !== null) return;

    if (!('geolocation' in navigator)) {
      set({
        status: 'unavailable',
        reason: 'GPS is not supported on this device.',
        lat: FALLBACK_LOCATION.lat,
        lon: FALLBACK_LOCATION.lon,
        accuracy: 0,
      });
      return;
    }

    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName })
        .then((permission) => {
          if (permission.state === 'denied') {
            _resolved = true;
            _bestFix = null;
            _stopGPS();
            _applyFallback(set, 'Location permission is blocked in your browser. Enable GPS in site settings.');
          }
        })
        .catch(() => undefined);
    }

    _resolved = false;
    _bestFix = null;
    _stopGPS();
    set({ status: 'requesting', reason: '' });

    // Use only a trusted fix. A wide browser/IP estimate can put the user in
    // the wrong barangay, so do not fetch weather from that.
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
      if (_isBetterFix(pos, _bestFix)) _bestFix = pos;
      const { lat: currentLat, lon: currentLon, accuracy: currentAccuracy, status } = get();
      const distance = _distanceM(currentLat, currentLon, pos.coords.latitude, pos.coords.longitude);
      const trusted = pos.coords.accuracy <= MAX_TRUSTED_ACCURACY_M;

      if (!_resolved && pos.coords.accuracy <= IDEAL_ACCURACY_M) {
        _resolved = true;
        _clearTimer();
        _applyFix(pos, set);
        return;
      }

      if (_resolved && trusted && (
        status !== 'granted' ||
        pos.coords.accuracy + 25 < currentAccuracy ||
        distance > Math.max(80, pos.coords.accuracy)
      )) {
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
        if (err.code === 1) _stopGPS();
        _applyFallback(set, reason, _bestFix ? Math.round(_bestFix.coords.accuracy) : 0);
      }
    };

    // Phase 1: fast low-accuracy attempt (~1–2 s)
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      () => { /* silent fail — watchPosition continues */ },
      { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_SETTLE_TIMEOUT_MS }
    );

    // Phase 2: high-accuracy continuous watch
    _watchId = navigator.geolocation.watchPosition(
      onSuccess, onError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_SETTLE_TIMEOUT_MS }
    );
  },

  skipToFallback: () => {
    _resolved = true;
    _bestFix = null;
    _stopGPS();
    set({ status: 'denied', reason: 'Skipped', lat: FALLBACK_LOCATION.lat, lon: FALLBACK_LOCATION.lon, accuracy: 0 });
  },

  refreshLocation: () => new Promise<boolean>((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (pos.coords.accuracy <= MAX_TRUSTED_ACCURACY_M) {
          _applyFix(pos, set);
          if (_watchId === null) get().startGPS();
          resolve(true);
        } else {
          set({ reason: 'Waiting for a more precise GPS location', accuracy: Math.round(pos.coords.accuracy) });
          if (_watchId === null) get().startGPS();
          resolve(false);
        }
      },
      () => {
        resolve(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge:         0,
        timeout:            15_000,
      },
    );
  }),
}));

export const selectCoords  = (s: GeoState) => ({ lat: s.lat, lon: s.lon });
export const selectIsLive  = (s: GeoState) => s.status === 'granted';
export const selectIsReady = (s: GeoState) => s.status !== 'idle' && s.status !== 'requesting';
