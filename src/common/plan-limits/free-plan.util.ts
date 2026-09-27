/** Length of the one-time Free trial every new owner gets. */
export const FREE_TRIAL_MONTHS = 4;

export function isFreePlan(plan: { name: string; price: unknown }): boolean {
  return plan.name.trim().toLowerCase() === 'free' || Number(plan.price) === 0;
}
