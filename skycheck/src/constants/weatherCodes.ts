// WMO Weather Interpretation Codes → label + emoji
// https://open-meteo.com/en/docs#weathervariables

export interface WeatherCodeInfo {
  label: string;
  emoji: string;
  icon: string;   // key for CSS/icon usage
}

const WMO_CODES: Record<number, WeatherCodeInfo> = {
  0:  { label: 'Clear Sky',           emoji: '☀️',  icon: 'sun' },
  1:  { label: 'Mainly Clear',        emoji: '🌤️', icon: 'sun-cloud' },
  2:  { label: 'Partly Cloudy',       emoji: '⛅',  icon: 'sun-cloud' },
  3:  { label: 'Overcast',            emoji: '☁️',  icon: 'cloud' },
  45: { label: 'Foggy',               emoji: '🌫️', icon: 'fog' },
  48: { label: 'Icy Fog',             emoji: '🌫️', icon: 'fog' },
  51: { label: 'Light Drizzle',       emoji: '🌦️', icon: 'drizzle' },
  53: { label: 'Drizzle',             emoji: '🌦️', icon: 'drizzle' },
  55: { label: 'Heavy Drizzle',       emoji: '🌧️', icon: 'rain' },
  61: { label: 'Slight Rain',         emoji: '🌧️', icon: 'rain' },
  63: { label: 'Moderate Rain',       emoji: '🌧️', icon: 'rain' },
  65: { label: 'Heavy Rain',          emoji: '🌧️', icon: 'rain-heavy' },
  71: { label: 'Slight Snow',         emoji: '🌨️', icon: 'snow' },
  73: { label: 'Moderate Snow',       emoji: '🌨️', icon: 'snow' },
  75: { label: 'Heavy Snow',          emoji: '❄️',  icon: 'snow-heavy' },
  77: { label: 'Snow Grains',         emoji: '🌨️', icon: 'snow' },
  80: { label: 'Slight Rain Showers', emoji: '🌦️', icon: 'showers' },
  81: { label: 'Rain Showers',        emoji: '🌧️', icon: 'showers' },
  82: { label: 'Violent Showers',     emoji: '⛈️',  icon: 'thunderstorm' },
  85: { label: 'Snow Showers',        emoji: '🌨️', icon: 'snow' },
  86: { label: 'Heavy Snow Showers',  emoji: '❄️',  icon: 'snow-heavy' },
  95: { label: 'Thunderstorm',        emoji: '⛈️',  icon: 'thunderstorm' },
  96: { label: 'Thunderstorm w/ Hail',emoji: '⛈️',  icon: 'thunderstorm' },
  99: { label: 'Thunderstorm w/ Hail',emoji: '⛈️',  icon: 'thunderstorm' },
};

export function getWeatherInfo(code: number): WeatherCodeInfo {
  return WMO_CODES[code] ?? { label: 'Unknown', emoji: '🌡️', icon: 'unknown' };
}

export function isRainyCode(code: number): boolean {
  return [51,53,55,61,63,65,80,81,82,95,96,99].includes(code);
}

export function isStormCode(code: number): boolean {
  return [82,95,96,99].includes(code);
}
