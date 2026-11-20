import { describe, expect, it } from 'vitest';
import { formatSavedAt } from './format-saved-at';

describe('formatSavedAt', () => {
  it('formats an epoch-ms timestamp as a readable date and time', () => {
    const savedAt = Date.UTC(2026, 9, 15, 14, 30);
    const formatted = formatSavedAt(savedAt);
    expect(formatted).toMatch(/2026/);
    // A readable time, not a raw epoch number or ISO string with a "T".
    expect(formatted).not.toContain('T');
    expect(formatted.length).toBeGreaterThan(8);
  });
});
