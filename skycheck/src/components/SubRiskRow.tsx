import type { SubRisks } from '../types';
import RiskBadge from './RiskBadge';

interface SubRiskRowProps {
  risks: SubRisks;
  size?: 'sm' | 'md';
}

export default function SubRiskRow({ risks, size = 'sm' }: SubRiskRowProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      <RiskBadge level={risks.weather} size={size} variant="light" prefix="🌤" />
      <RiskBadge level={risks.traffic} size={size} variant="light" prefix="🚗" />
      <RiskBadge level={risks.flood}   size={size} variant="light" prefix="🌊" />
    </div>
  );
}
