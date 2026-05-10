import { clsx } from '../utils';

interface WeatherStatProps {
  icon: string;     // emoji
  value: string;
  label: string;
  className?: string;
}

export default function WeatherStat({ icon, value, label, className }: WeatherStatProps) {
  return (
    <div className={clsx('flex flex-col items-center gap-0.5', className)}>
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-bold text-gray-800">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}
