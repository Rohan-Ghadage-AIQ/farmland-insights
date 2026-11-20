import { describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';

describe('createLogger', () => {
  it('forwards messages to the console when enabled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const log = createLogger({ enabled: true });
    log.warn('careful', { id: 1 });
    log.error('boom');

    expect(warn).toHaveBeenCalledWith('careful', { id: 1 });
    expect(error).toHaveBeenCalledWith('boom');
  });

  it('is a complete no-op when disabled (production)', () => {
    const spies = (['debug', 'info', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );

    const log = createLogger({ enabled: false });
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
