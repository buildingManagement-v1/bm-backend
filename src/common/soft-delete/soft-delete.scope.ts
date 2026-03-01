/**
 * Scope for soft-deleted entities. Use when querying to exclude deleted rows.
 * Apply to: Building, Unit, Tenant, Lease, ParkingRegistration, MaintenanceRequest, Manager, ManagerBuildingRole.
 */
export const NOT_DELETED = { deletedAt: null } as const;

export type NotDeleted = typeof NOT_DELETED;

/**
 * Merge NOT_DELETED into an existing Prisma where clause.
 * Use for findMany, findFirst, findUnique (by id) to exclude soft-deleted records.
 */
export function whereActive<T extends Record<string, unknown>>(
  where: T | undefined,
): T & NotDeleted {
  return { ...where, ...NOT_DELETED } as T & NotDeleted;
}

/**
 * Use for relation where (e.g. include.leases.where) when the relation model is soft-deleted.
 * Returns a where clause that excludes deleted rows.
 */
export function whereRelationActive(): { deletedAt: null } {
  return NOT_DELETED;
}
