/** Joins class names, skipping falsy parts. Tailwind classes are static strings, so no merging is needed. */
export function cn(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}
