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

function roundPeso(value: number): number {
  return Math.max(0, Math.ceil(value));
}

function range(raw: number, buffer = 0.12): { min: number; max: number } {
  return {
    min: roundPeso(raw),
    max: roundPeso(raw * (1 + buffer)),
  };
}

function applyDiscount(fare: { min: number; max: number }, discountRate = 0.2): {
  discountMin: number;
  discountMax: number;
  discountNote: string;
} {
  return {
    discountMin: roundPeso(fare.min * (1 - discountRate)),
    discountMax: roundPeso(fare.max * (1 - discountRate)),
    discountNote: '20% student, senior, and PWD discount where applicable.',
  };
}

export function estimateMaximFare(distanceKm: number): { min: number; max: number } {
  const base = 49;
  const perKm = 12;
  const raw = distanceKm <= 1 ? base : base + (distanceKm - 1) * perKm;
  return range(raw, 0.15);
}

function estimateJeepneyFare(distanceKm: number): FareEstimate {
  // LTFRB current public guidance: traditional PUJ minimum is about P13,
  // modern PUJ minimum about P15 for first 4 km. Succeeding-km rates vary
  // by vehicle class, so show a conservative traditional-to-modern range.
  const extraKm = Math.max(0, distanceKm - 4);
  const traditional = 13 + extraKm * 1.8;
  const modern = 15 + extraKm * 2.2;
  const fare = {
    min: roundPeso(traditional),
    max: roundPeso(modern),
  };
  return {
    mode: 'jeepney',
    label: 'Jeepney',
    icon: '🚙',
    ...fare,
    ...applyDiscount(fare),
    status: 'conditional',
    note: 'Only if a direct jeepney/modern jeepney route exists.',
  };
}

function estimateTricycleFare(distanceKm: number): FareEstimate {
  // Tricycle fare matrices are set locally by LGUs, and tricycles are commonly
  // limited to franchised zones or barangay/local roads. This is intentionally
  // a short-trip estimate rather than a national fixed fare.
  const raw = 20 + Math.max(0, distanceKm - 1) * 12;
  const estimate = range(raw, 0.35);
  const longTrip = distanceKm > 5;
  return {
    mode: 'tricycle',
    label: 'Tricycle',
    icon: '🛺',
    min: estimate.min,
    max: estimate.max,
    ...applyDiscount(estimate),
    status: longTrip ? 'not_recommended' : 'conditional',
    note: longTrip
      ? 'Usually limited to local zones; may not be allowed for long or national-highway trips.'
      : 'LGU fare matrix varies; best for short barangay/local trips.',
  };
}

function estimateTaxiFare(distanceKm: number, durationMin: number): FareEstimate {
  // LTFRB taxi matrix: P50 flag-down, P13.50/km, P2/min travel time.
  const raw = 50 + distanceKm * 13.5 + durationMin * 2;
  const estimate = range(raw, 0.15);
  return {
    mode: 'taxi',
    label: 'Taxi',
    icon: '🚕',
    min: estimate.min,
    max: estimate.max,
    ...applyDiscount(estimate),
    status: 'available',
    note: 'Metered estimate; traffic and waiting time can increase final fare.',
  };
}

function estimateMaximOption(distanceKm: number): FareEstimate {
  const estimate = estimateMaximFare(distanceKm);
  return {
    mode: 'maxim',
    label: 'Maxim',
    icon: '🛵',
    min: estimate.min,
    max: estimate.max,
    discountMin: estimate.min,
    discountMax: estimate.max,
    discountNote: 'Platform promos/discounts vary; statutory fare discount may not be automatic.',
    status: 'available',
    note: 'App-based ride estimate; final fare may change with demand and driver availability.',
  };
}

export function estimateFareOptions(distanceKm: number, durationMin: number): FareEstimate[] {
  return [
    estimateJeepneyFare(distanceKm),
    estimateTricycleFare(distanceKm),
    estimateTaxiFare(distanceKm, durationMin),
    estimateMaximOption(distanceKm),
  ];
}
