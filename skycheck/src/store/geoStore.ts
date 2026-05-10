import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────
// Global GPS Store — singleton, survives page navigation
// GPS starts once in AppShell and never restarts on route change.
// ─────────────────────────────────────────────────────────────────

export const OLONGAPO = { lat: 14.8292, lon: 120.2842 };

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

function _stopGPS() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  if (_timer !== null) {
    clearTimeout(_timer);
    _timer = null;
  }
}

export const useGeoStore = create<GeoState>((set, get) => ({
  status:   'idle',
  lat:      OLONGAPO.lat,
  lon:      OLONGAPO.lon,
  accuracy: 0,
  reason:   '',

  startGPS: () => {
    const currentStatus = get().status;
    // Once permission is granted, the browser remembers it. If a request is
    // stuck, allow the user button to restart the GPS attempt.
    if (currentStatus === 'granted') return;

    if (!('geolocation' in navigator)) {
      set({ status: 'unavailable', reason: 'GPS not supported on this device' });
      return;
    }

    _resolved = false;
    _bestFix = null;
    _stopGPS();
    set({ status: 'requesting', reason: '' });

    // Hard fallback after 20 seconds
    _timer = setTimeout(() => {
      if (!_resolved) {
        _resolved = true;
        _stopGPS();
        if (_bestFix) {
          _applyFix(_bestFix, set);
        } else {
          set({ status: 'denied', reason: 'Location timed out', lat: OLONGAPO.lat, lon: OLONGAPO.lon, accuracy: 0 });
        }
      }
    }, 12000);

    const onSuccess = (pos: GeolocationPosition) => {
      if (_resolved) return;
      if (_isBetterFix(pos, _bestFix)) _bestFix = pos;

      if (pos.coords.accuracy <= 80) {
        _resolved = true;
        _stopGPS();
        _applyFix(pos, set);
      }
    };

    const onError = (err: GeolocationPositionError) => {
      if (_resolved) return;
      _resolved = true;
      _stopGPS();
      const reason =
        err.code === 1 ? 'Location permission denied'
        : err.code === 2 ? 'Location unavailable'
        : 'Location timed out';
      if (_bestFix) {
        _applyFix(_bestFix, set);
      } else {
        set({ status: 'denied', reason, lat: OLONGAPO.lat, lon: OLONGAPO.lon, accuracy: 0 });
      }
    };

    // Phase 1: fast low-accuracy attempt (~1–2 s)
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      () => { /* silent fail — watchPosition continues */ },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    // Phase 2: high-accuracy continuous watch
    _watchId = navigator.geolocation.watchPosition(
      onSuccess, onError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    );
  },

  skipToFallback: () => {
    _resolved = true;
    _bestFix = null;
    _stopGPS();
    set({ status: 'denied', reason: 'Skipped', lat: OLONGAPO.lat, lon: OLONGAPO.lon, accuracy: 0 });
  },

  refreshLocation: () => new Promise<boolean>((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        set({
          status:   'granted',
          lat:      latitude,
          lon:      longitude,
          accuracy: Math.round(accuracy),
          reason:   '',
        });
        resolve(true);
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
