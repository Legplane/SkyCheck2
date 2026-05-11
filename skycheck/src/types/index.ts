// ─────────────────────────────────────────────────────────────────
// SkyCheck — Shared TypeScript Types
// ─────────────────────────────────────────────────────────────────

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

// ── Auth ──────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  isVerified: boolean;
  preferences: UserPreferences;
  createdAt: string;
}

export interface UserPreferences {
  morningAlerts: boolean;
  alertSound: boolean;
  vibration: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

// ── Weather ───────────────────────────────────────────────────────
export interface CurrentWeather {
  temperature: number;         // °C
  feelsLike: number;           // °C apparent temperature
  humidity: number;            // %
  precipitationProbability: number; // 0–100 %
  precipitation: number;       // mm
  windSpeed: number;           // km/h sustained @ 10 m
  windGust?: number;           // km/h max gust @ 10 m (when available)
  weatherCode: number;         // WMO weather code
  weatherLabel: string;
  weatherIcon: string;         // emoji or icon key
  updatedAt: string;           // ISO timestamp
}

export interface HourlyForecast {
  time: string;          // "HH:MM"
  temperature: number;   // °C
  weatherCode: number;
  weatherIcon: string;
  precipitationProbability: number; // 0–100
}

// ── Risk ──────────────────────────────────────────────────────────
export interface SubRisks {
  weather: RiskLevel;
  traffic: RiskLevel;
  flood: RiskLevel;
}

export interface CombinedRisk {
  overall: RiskLevel;
  weather: RiskLevel;
  traffic: RiskLevel;
  flood: RiskLevel;
  trafficRatio?: number;    // 0–1 currentSpeed/freeFlow
  trafficSource?: 'tomtom' | 'heuristic';
  trafficCurrentKmh?: number;
  trafficFreeFlowKmh?: number;
  elevation?: number;       // metres
  basis: string;            // human-readable explanation
}

// ── Dashboard snapshot ────────────────────────────────────────────
export interface WeatherSnapshot {
  location: string;
  lat: number;
  lon: number;
  current: CurrentWeather;
  hourly: HourlyForecast[];
  risk: CombinedRisk;
  commuteTips: string[];
}

// ── Routes ────────────────────────────────────────────────────────
export interface Route {
  id: string;
  label: string | null;
  startAddress: string;
  startLat: number;
  startLon: number;
  destAddress: string;
  destLat: number;
  destLon: number;
  departTime: string;    // "HH:MM"
  distanceKm: number;
  durationMin: number;
  risk: CombinedRisk;
  maximFare: { min: number; max: number };
  fareEstimates?: FareEstimate[];
  createdAt: string;
}

export interface CreateRoutePayload {
  label?: string;
  startAddress: string;
  startLat: number;
  startLon: number;
  destAddress: string;
  destLat: number;
  destLon: number;
  departTime: string;
}

export interface RoutePreview {
  distanceKm: number;
  durationMin: number;
  maximFare: { min: number; max: number };
  fareEstimates?: FareEstimate[];
  waypoints?: [number, number][];  // [[lat,lon], ...]
}

export type FareMode = 'maxim' | 'jeepney' | 'tricycle' | 'taxi';

export interface FareEstimate {
  mode: FareMode;
  label: string;
  icon: string;
  min: number;
  max: number;
  discountMin: number;
  discountMax: number;
  discountNote: string;
  status: 'available' | 'conditional' | 'not_recommended';
  note: string;
}

// ── Alerts ────────────────────────────────────────────────────────
export type AlertType = 'WEATHER' | 'TRAFFIC' | 'FLOOD';

export interface Alert {
  id: string;
  type: AlertType;
  riskLevel: RiskLevel;
  title: string;
  body: string;
  routeId?: string;
  routeLabel?: string;
  isRead: boolean;
  createdAt: string;
}

export interface AlertGroup {
  label: 'TODAY' | 'YESTERDAY' | 'EARLIER THIS WEEK';
  alerts: Alert[];
}

// ── Geocoding ─────────────────────────────────────────────────────
export interface NominatimResult {
  displayName: string;
  lat: number;
  lon: number;
  placeId: number;
}

// ── API Responses ─────────────────────────────────────────────────
export interface ApiError {
  error: string;
  code?: string;
  statusCode?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
}

// ── Health Check ──────────────────────────────────────────────────
export interface HealthCheckPayload {
  hasFever:            boolean;
  feverTemp:           number | null;
  hasCough:            boolean;
  hasSoreThroat:       boolean;
  hasFatigue:          boolean;
  hasDifficulty:       boolean;
  hasHeadache:         boolean;
  hasBodyPain:         boolean;
  hasVomiting:         boolean;
  hasChronicCondition: boolean;
  chronicDetail:       string;
  overallFeeling:      'well' | 'mild' | 'sick' | 'severe';
  additionalNotes:     string;
}

export interface HealthCheck extends HealthCheckPayload {
  id:        string;
  userId:    string;
  checkDate: string;
  createdAt: string;
}

// ── Go / No-Go ────────────────────────────────────────────────────
export type GoNoGoVerdict = 'GO' | 'OWN_RISK' | 'DO_NOT_GO';

export interface GoNoGoFactor {
  category: 'HEALTH' | 'WEATHER' | 'FLOOD' | 'TRAFFIC' | 'SCHOOL' | 'GOVERNMENT' | 'HEAT';
  label:    string;
  status:   'OK' | 'CAUTION' | 'DANGER';
  detail:   string;
}

export interface GoNoGoResult {
  verdict:        GoNoGoVerdict;
  primaryReason:  string;
  factors:        GoNoGoFactor[];
  safetyScore:    number;
  recommendation: string;
  weather:        { temperature: number; feelsLike: number; weatherLabel: string; weatherIcon: string; rainProb: number };
  risk:           CombinedRisk;
  schoolStatus:   string;
  schoolTitle:    string | null;
  govAdvisories:  { source: string; title: string; severity: string }[];
  healthSummary:  { overallFeeling: string; hasFever: boolean; hasChronicCondition: boolean };
  evaluatedAt:    string;
}

// ── Announcements ─────────────────────────────────────────────────
export interface SchoolAnnouncement {
  id:          string;
  schoolName:  string;
  status:      'F2F' | 'ONLINE' | 'SUSPENDED' | 'HYBRID';
  title:       string;
  body:        string | null;
  effectiveAt: string;
  expiresAt:   string | null;
  postedBy:    string | null;
}

export interface GovAnnouncement {
  id:          string;
  source:      string;
  title:       string;
  body:        string;
  severity:    'INFO' | 'ADVISORY' | 'WARNING' | 'CRITICAL';
  effectiveAt: string;
  expiresAt:   string | null;
  isActive:    boolean;
}

export interface AnnouncementsResponse {
  school: SchoolAnnouncement[];
  gov:    GovAnnouncement[];
}
