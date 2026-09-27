/**
 * Rent-cycle generation shared by lease creation, lease edits and termination.
 *
 * A lease is billed in cycles that start on the payment collection day. A
 * cycle that starts exactly on the collection day and runs until the day
 * before the next one is a full month and costs the full monthly rent; any
 * other (leading, trailing or cut-short) cycle is prorated at rent / 30 per
 * day. Collection days past a month's last day (e.g. 30 in February) fall on
 * that month's last day.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RentCycle {
  /** periodStart as YYYY-MM-DD; unique per lease */
  month: string;
  periodStart: Date;
  periodEnd: Date;
  daysInCycle: number;
  rentAmount: number;
}

/** Midnight UTC of the calendar date the value represents. */
export function toUtcDate(d: Date | string): Date {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return new Date(`${d}T00:00:00.000Z`);
  }
  const date = new Date(d);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Business timezone: rent days, due dates and crons follow local time. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Africa/Addis_Ababa';

/** Today's calendar date in the business timezone, as midnight UTC. */
export function todayDate(now: Date = new Date()): Date {
  // en-CA formats as YYYY-MM-DD
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return toUtcDate(local);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

export function daysBetweenInclusive(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function proratedRent(monthlyRent: number, days: number): number {
  return roundMoney((Number(monthlyRent) / 30) * days);
}

/** Collection day within a given month, clamped to the month's length. */
function collectionDate(year: number, month: number, paymentDay: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(paymentDay, lastDay)));
}

/** First collection date strictly after `after`. */
export function nextCollectionDate(after: Date, paymentDay: number): Date {
  const y = after.getUTCFullYear();
  const m = after.getUTCMonth();
  const thisMonth = collectionDate(y, m, paymentDay);
  return thisMonth > after ? thisMonth : collectionDate(y, m + 1, paymentDay);
}

function isCollectionDate(d: Date, paymentDay: number): boolean {
  return (
    collectionDate(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      paymentDay,
    ).getTime() === d.getTime()
  );
}

export function generateCycles(
  startDate: Date | string,
  endDate: Date | string,
  paymentDay: number,
  monthlyRent: number,
): RentCycle[] {
  const end = toUtcDate(endDate);
  let cursor = toUtcDate(startDate);
  const cycles: RentCycle[] = [];

  while (cursor <= end) {
    const next = nextCollectionDate(cursor, paymentDay);
    const fullCycleEnd = addDays(next, -1);
    const cycleEnd = fullCycleEnd <= end ? fullCycleEnd : new Date(end);
    const daysInCycle = daysBetweenInclusive(cursor, cycleEnd);

    const isFullCycle =
      isCollectionDate(cursor, paymentDay) &&
      cycleEnd.getTime() === fullCycleEnd.getTime();

    cycles.push({
      month: isoDate(cursor),
      periodStart: new Date(cursor),
      periodEnd: new Date(cycleEnd),
      daysInCycle,
      rentAmount: isFullCycle
        ? roundMoney(Number(monthlyRent))
        : proratedRent(monthlyRent, daysInCycle),
    });

    cursor = addDays(cycleEnd, 1);
  }

  return cycles;
}
