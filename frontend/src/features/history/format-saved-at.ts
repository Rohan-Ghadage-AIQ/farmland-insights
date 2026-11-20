const FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A saved run's timestamp (epoch ms), formatted for display in the history list. */
export function formatSavedAt(savedAt: number): string {
  return FORMATTER.format(new Date(savedAt));
}
