import { describe, expect, it } from 'vitest';

describe('MSW test server', () => {
  it('fails any request that has no handler, so tests never hit a real network', async () => {
    const attempt = fetch('http://127.0.0.1:59999/not-mocked');

    await expect(attempt).rejects.toThrow();
    // Unlike a plain connection refusal, the MSW error names the missing handler.
    await attempt.catch((error: unknown) => {
      expect(String(error) + String((error as Error).cause)).toMatch(/MSW|handler/i);
    });
  });
});
