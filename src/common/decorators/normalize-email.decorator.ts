import { Transform } from 'class-transformer';

/**
 * Emails are stored and matched trimmed and lower-cased, so "Sara@x.com" and
 * "sara@x.com" are the same account (uniqueness and login lookups are
 * case-sensitive in the database).
 */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
