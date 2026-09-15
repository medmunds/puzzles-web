/**
 * Localizes an ISO plain date string (YYYY-MM-DD) to the user's locale.
 */
export function localizeDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short" },
): string {
  // We want the equivalent of a PlainDate:
  //   const plainDate = Temporal.PlainDate.from(date);
  // Until Temporal is baseline, use a Date object in the local timezone.
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const plainDate = new Date(year, month - 1, day);
  return plainDate.toLocaleString(undefined, options);
}
