export interface PlanFeatures {
  maxBuildings: number;
  maxUnits: number;
  maxManagers: number;
  premiumFeatures: string[];
}

function limit(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * Reads a plan's features JSON defensively: a missing or malformed limit
 * counts as 0 (nothing allowed), never as unlimited.
 */
export function parsePlanFeatures(raw: unknown): PlanFeatures {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    maxBuildings: limit(f.maxBuildings),
    maxUnits: limit(f.maxUnits),
    maxManagers: limit(f.maxManagers),
    premiumFeatures: Array.isArray(f.premiumFeatures)
      ? f.premiumFeatures.filter((x): x is string => typeof x === 'string')
      : [],
  };
}
