import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, MapPin, School, Clock, Tag, Bookmark } from 'lucide-react';
import { createRoute, updateRoute, previewRoute } from '../../api';
import type { Route, NominatimResult, RoutePreview } from '../../types';
import { searchAddress, shortenAddress } from '../../services/nominatimService';
import { useDebounce } from '../../hooks/useDebounce';
import { formatDistance, formatDuration, formatFare, getApiErrorMessage } from '../../utils';
import MapView from '../../components/MapView';

interface AddRouteSheetProps {
  editRoute?: Route | null;
  onClose: () => void;
  onSaved: () => void;
}

interface LocationField {
  query: string;
  selected: NominatimResult | null;
  suggestions: NominatimResult[];
  isSearching: boolean;
}

export default function AddRouteSheet({ editRoute, onClose, onSaved }: AddRouteSheetProps) {
  const isEdit = !!editRoute;

  const [start, setStart] = useState<LocationField>({
    query: editRoute?.startAddress ?? '',
    selected: editRoute ? { displayName: editRoute.startAddress, lat: editRoute.startLat, lon: editRoute.startLon, placeId: 0 } : null,
    suggestions: [],
    isSearching: false,
  });

  const [dest, setDest] = useState<LocationField>({
    query: editRoute?.destAddress ?? '',
    selected: editRoute ? { displayName: editRoute.destAddress, lat: editRoute.destLat, lon: editRoute.destLon, placeId: 0 } : null,
    suggestions: [],
    isSearching: false,
  });

  const [departTime, setDepartTime] = useState(editRoute?.departTime ?? '07:00');
  const [label, setLabel] = useState(editRoute?.label ?? '');
  const [apiError, setApiError] = useState('');
  const [preview, setPreview] = useState<RoutePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const debStartQuery = useDebounce(start.query, 350);
  const debDestQuery  = useDebounce(dest.query,  350);

  const startRef = useRef<HTMLInputElement>(null);

  // ── Search start ──────────────────────────────────────────────────
  useEffect(() => {
    if (!debStartQuery || debStartQuery.length < 3 || start.selected) return;
    setStart(s => ({ ...s, isSearching: true }));
    searchAddress(debStartQuery)
      .then(results => setStart(s => ({ ...s, suggestions: results, isSearching: false })))
      .catch(() => setStart(s => ({ ...s, isSearching: false })));
  }, [debStartQuery]);

  // ── Search dest ───────────────────────────────────────────────────
  useEffect(() => {
    if (!debDestQuery || debDestQuery.length < 3 || dest.selected) return;
    setDest(d => ({ ...d, isSearching: true }));
    searchAddress(debDestQuery)
      .then(results => setDest(d => ({ ...d, suggestions: results, isSearching: false })))
      .catch(() => setDest(d => ({ ...d, isSearching: false })));
  }, [debDestQuery]);

  // ── Preview route when both selected ─────────────────────────────
  useEffect(() => {
    if (!start.selected || !dest.selected) { setPreview(null); return; }
    setIsLoadingPreview(true);
    previewRoute({ startLat: start.selected.lat, startLon: start.selected.lon, destLat: dest.selected.lat, destLon: dest.selected.lon })
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setIsLoadingPreview(false));
  }, [start.selected, dest.selected]);

  // ── Save route ────────────────────────────────────────────────────
  const { mutate: doSave, isPending } = useMutation({
    mutationFn: () => {
      if (!start.selected || !dest.selected) throw new Error('Please select start and destination.');
      const payload = {
        label: label.trim() || undefined,
        startAddress: shortenAddress(start.selected.displayName),
        startLat: start.selected.lat,
        startLon: start.selected.lon,
        destAddress: shortenAddress(dest.selected.displayName),
        destLat: dest.selected.lat,
        destLon: dest.selected.lon,
        departTime,
      };
      return isEdit ? updateRoute(editRoute!.id, payload) : createRoute(payload);
    },
    onSuccess: onSaved,
    onError: (err) => setApiError(getApiErrorMessage(err)),
  });

  function selectStart(r: NominatimResult) {
    setStart({ query: shortenAddress(r.displayName), selected: r, suggestions: [], isSearching: false });
  }

  function selectDest(r: NominatimResult) {
    setDest({ query: shortenAddress(r.displayName), selected: r, suggestions: [], isSearching: false });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto animate-slideUp">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {isEdit ? 'Edit Route' : 'Add New Route'}
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* API Error */}
          {apiError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">⚠ {apiError}</div>
          )}

          {/* Map Preview */}
          <MapView
            start={start.selected ? { lat: start.selected.lat, lon: start.selected.lon } : undefined}
            destination={dest.selected ? { lat: dest.selected.lat, lon: dest.selected.lon } : undefined}
            waypoints={preview?.waypoints}
            className="h-44 rounded-2xl"
          />

          {/* Starting Point */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Starting Point</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                ref={startRef}
                type="text"
                placeholder="e.g. Sto. Niño, Olongapo"
                value={start.query}
                onChange={e => setStart(s => ({ ...s, query: e.target.value, selected: null }))}
                className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              {start.isSearching && (
                <div className="absolute right-3 top-3.5">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
                </div>
              )}
            </div>
            {/* Suggestions */}
            {start.suggestions.length > 0 && !start.selected && (
              <ul className="mt-1 bg-white border border-gray-200 rounded-xl shadow-card-lg overflow-hidden">
                {start.suggestions.map(r => (
                  <li key={r.placeId}>
                    <button
                      onClick={() => selectStart(r)}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="font-medium text-gray-900">{r.displayName.split(',')[0]}</span>
                      <span className="text-xs text-gray-500 block truncate">{shortenAddress(r.displayName)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Destination */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Destination</label>
            <div className="relative">
              <School size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="e.g. Gordon College"
                value={dest.query}
                onChange={e => setDest(d => ({ ...d, query: e.target.value, selected: null }))}
                className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
              {dest.isSearching && (
                <div className="absolute right-3 top-3.5">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
                </div>
              )}
            </div>
            {dest.suggestions.length > 0 && !dest.selected && (
              <ul className="mt-1 bg-white border border-gray-200 rounded-xl shadow-card-lg overflow-hidden">
                {dest.suggestions.map(r => (
                  <li key={r.placeId}>
                    <button
                      onClick={() => selectDest(r)}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="font-medium text-gray-900">{r.displayName.split(',')[0]}</span>
                      <span className="text-xs text-gray-500 block truncate">{shortenAddress(r.displayName)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Route Preview */}
          {isLoadingPreview && (
            <div className="text-center text-xs text-gray-400 py-2">Calculating route…</div>
          )}
          {preview && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex gap-4 text-sm">
              <div className="text-center">
                <p className="font-bold text-gray-900">{formatDistance(preview.distanceKm)}</p>
                <p className="text-xs text-gray-500">Distance</p>
              </div>
              <div className="w-px bg-blue-200" />
              <div className="text-center">
                <p className="font-bold text-gray-900">{formatDuration(preview.durationMin)}</p>
                <p className="text-xs text-gray-500">Travel time</p>
              </div>
              <div className="w-px bg-blue-200" />
              <div className="text-center">
                <p className="font-bold text-primary-600">🛵 {formatFare(preview.maximFare)}</p>
                <p className="text-xs text-gray-500">Maxim est.</p>
              </div>
            </div>
          )}

          {/* Departure Time */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Typical Departure Time</label>
            <div className="relative">
              <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="time"
                value={departTime}
                onChange={e => setDepartTime(e.target.value)}
                className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
            </div>
          </div>

          {/* Route Label */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">
              Route Label <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" />
              <input
                type="text"
                placeholder="e.g. Morning School Route"
                value={label}
                onChange={e => setLabel(e.target.value)}
                maxLength={40}
                className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600"
              />
            </div>
          </div>

          {/* Save CTA */}
          <button
            onClick={() => doSave()}
            disabled={isPending || !start.selected || !dest.selected}
            className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {isPending
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Bookmark size={16} />}
            {isEdit ? 'Update Route' : 'Save Route'}
          </button>

          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
