import type { HealthCheck } from '../types';

/** Fingerprint of today's answers — include in Go/No-Go query key so updates refetch. */
export function healthCheckSignature(h: HealthCheck): string {
  return [
    h.overallFeeling,
    Number(h.hasFever),
    h.feverTemp ?? '',
    Number(h.hasCough),
    Number(h.hasSoreThroat),
    Number(h.hasFatigue),
    Number(h.hasDifficulty),
    Number(h.hasHeadache),
    Number(h.hasBodyPain),
    Number(h.hasVomiting),
    Number(h.hasChronicCondition),
  ].join('|');
}
