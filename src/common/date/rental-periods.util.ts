/**
 * Generates payment periods for a lease based on rental months (start + N months),
 * not calendar months. Supports prorated last period when lease end doesn't fall
 * on a full rental-month boundary.
 */

export interface RentalPeriodItem {
  month: string;
  rentAmount: number;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(
    date.getFullYear(),
    date.getMonth() + months,
    date.getDate(),
  );
  return result;
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function toMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Returns payment periods for a lease from start to end.
 * - One period per full rental month (start + 1 month, + 2 months, ...).
 * - month = YYYY-MM of the period end date.
 * - If lease end falls before the next period end, the last period is prorated
 *   (full month amount + tail days prorated), and we merge into one row to satisfy
 *   unique (leaseId, month).
 */
export function getRentalPeriodsBetween(
  start: Date,
  end: Date,
  monthlyRentAmount: number,
): RentalPeriodItem[] {
  const periods: RentalPeriodItem[] = [];
  let periodEnd = addMonths(start, 1);

  // Full rental months
  while (periodEnd <= end) {
    const monthKey = toMonthKey(periodEnd);
    periods.push({ month: monthKey, rentAmount: monthlyRentAmount });
    periodEnd = addMonths(periodEnd, 1);
  }

  // Tail: lease end is after last period start but before next period end
  const lastPeriodStart = addMonths(periodEnd, -1);
  if (end > lastPeriodStart && periods.length > 0) {
    const tailDays = daysBetween(lastPeriodStart, end);
    const daysInThatMonth = daysInMonth(lastPeriodStart);
    const prorated = (tailDays / daysInThatMonth) * monthlyRentAmount;
    const last = periods[periods.length - 1];
    last.rentAmount = Math.round((last.rentAmount + prorated) * 100) / 100;
  } else if (periods.length === 0) {
    // Lease shorter than 1 month: single prorated period
    const days = daysBetween(start, end);
    const daysInEndMonth = daysInMonth(end);
    const prorated = (days / daysInEndMonth) * monthlyRentAmount;
    periods.push({
      month: toMonthKey(end),
      rentAmount: Math.round(prorated * 100) / 100,
    });
  }

  return periods;
}
