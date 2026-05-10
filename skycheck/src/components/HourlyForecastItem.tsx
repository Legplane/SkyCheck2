import { getWeatherInfo } from '../constants/weatherCodes';

interface HourlyForecastItemProps {
  time: string;
  temperature: number;
  weatherCode: number;
  precipitationProbability: number;
}

const BAR_MAX_PX = 40;

export default function HourlyForecastItem({
  time,
  temperature,
  weatherCode,
  precipitationProbability,
}: HourlyForecastItemProps) {
  const { emoji } = getWeatherInfo(weatherCode);
  const fillPx = precipitationProbability <= 0
    ? 0
    : Math.max(4, Math.round((precipitationProbability / 100) * BAR_MAX_PX));

  return (
    <div className="flex flex-col items-stretch rounded-xl border border-gray-100 bg-gradient-to-b from-slate-50/90 to-white px-2 py-2.5 text-center shadow-sm min-h-[8.75rem]">
      {/* Fixed-height rows keep every column visually aligned */}
      <div className="h-4 flex items-center justify-center shrink-0">
        <span className="text-[11px] font-semibold text-gray-500 tabular-nums leading-none">
          {time}
        </span>
      </div>
      <div className="h-10 flex items-center justify-center shrink-0 text-xl leading-none" aria-hidden>
        {emoji}
      </div>
      <div className="h-6 flex items-center justify-center shrink-0">
        <span className="text-sm font-bold text-gray-900 tabular-nums">
          {Math.round(temperature)}°
        </span>
      </div>
      <div className="flex-1 flex flex-col justify-end gap-1.5 shrink-0 pt-0.5">
        <div
          className="relative mx-auto w-[1.25rem] shrink-0 rounded-full bg-blue-100/90 border border-blue-100/80 overflow-hidden"
          style={{ height: BAR_MAX_PX }}
          title={`Rain chance ${precipitationProbability}%`}
        >
          {fillPx > 0 && (
            <div
              className="absolute bottom-0 left-0 right-0 rounded-t-[2px] bg-blue-500 transition-[height] duration-200"
              style={{ height: fillPx }}
            />
          )}
        </div>
        <span className="text-[11px] font-semibold text-blue-700 tabular-nums leading-none">
          {precipitationProbability}%
        </span>
      </div>
    </div>
  );
}
