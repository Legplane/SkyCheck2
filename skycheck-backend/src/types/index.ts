export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  humidity: number;
  precipitationProbability: number;
  precipitation: number;
  /** Sustained wind at 10 m (km/h) */
  windSpeed: number;
  /** Preceding-hour max gust at 10 m when available (km/h) — used with windSpeed for risk */
  windGust?: number;
  weatherCode: number;
  weatherLabel: string;
  weatherIcon: string;
  updatedAt: string;
}

export interface HourlyForecast {
  time: string;
  temperature: number;
  weatherCode: number;
  weatherIcon: string;
  precipitationProbability: number;
}

export interface CombinedRisk {
  overall: RiskLevel;
  weather: RiskLevel;
  traffic: RiskLevel;
  flood: RiskLevel;
  trafficRatio?: number;
  /** TomTom road flow vs PH rush-hour model */
  trafficSource?: 'tomtom' | 'heuristic';
  trafficCurrentKmh?: number;
  trafficFreeFlowKmh?: number;
  trafficVolumeLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  trafficLabel?: string;
  elevation?: number;
  basis: string;
}

export interface WeatherSnapshot {
  location: string;
  lat: number;
  lon: number;
  current: CurrentWeather;
  hourly: HourlyForecast[];
  risk: CombinedRisk;
  commuteTips: string[];
}

export interface RouteCalcResult {
  distanceKm: number;
  durationMin: number;
  waypoints: [number, number][];
}

export interface TrafficResult {
  congestionRatio: number;
  currentSpeed: number;
  freeFlowSpeed: number;
  riskLevel: RiskLevel;
  volumeLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  /** Live TomTom segment vs PH time-of-day model */
  source: 'tomtom' | 'heuristic';
  label?: string;
}

export interface FloodResult {
  elevation: number;
  riskLevel: RiskLevel;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}
