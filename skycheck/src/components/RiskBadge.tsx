import type { RiskLevel } from '../types';
import { RISK_COLORS, RISK_TEXT_COLORS, RISK_BG_LIGHT, RISK_LABELS } from '../constants/risk';
import { clsx } from '../utils';

interface RiskBadgeProps {
  level: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'filled' | 'light';
  prefix?: string;  // e.g. "🌧 Weather:"
  className?: string;
}

export default function RiskBadge({
  level,
  size = 'md',
  variant = 'filled',
  prefix,
  className,
}: RiskBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 rounded-full font-semibold',
    md: 'text-sm px-3 py-1 rounded-full font-semibold',
    lg: 'text-base px-4 py-2 rounded-full font-bold tracking-wide',
  };

  if (variant === 'light') {
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1',
          sizeClasses[size],
          RISK_BG_LIGHT[level],
          RISK_TEXT_COLORS[level],
          className
        )}
        role="status"
        aria-label={`${prefix ?? ''} ${RISK_LABELS[level]}`}
      >
        {prefix && <span>{prefix}</span>}
        {RISK_LABELS[level]}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1',
        sizeClasses[size],
        RISK_COLORS[level],
        className
      )}
      role="status"
      aria-label={`${prefix ?? ''} ${RISK_LABELS[level]}`}
    >
      {prefix && <span>{prefix}</span>}
      {RISK_LABELS[level]}
    </span>
  );
}
