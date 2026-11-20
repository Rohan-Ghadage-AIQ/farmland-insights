import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env';

describe('parseEnv', () => {
  it('applies safe defaults when nothing is configured', () => {
    const env = parseEnv({});

    expect(env.enableDevTokenLogin).toBe(false);
    expect(env.tokenTtlMinutes).toBe(480);
    expect(env.mapStyleUrl).toBeUndefined();
    expect(env.mapStyleSatelliteUrl).toBeUndefined();
    expect(env.mapApiKey).toBeUndefined();
  });

  it('parses a fully populated environment', () => {
    const env = parseEnv({
      VITE_ENABLE_DEV_TOKEN_LOGIN: 'true',
      VITE_TOKEN_TTL_MINUTES: '60',
      VITE_MAP_STYLE_URL: 'https://tiles.example.com/style.json',
      VITE_MAP_STYLE_SATELLITE_URL: 'https://tiles.example.com/sat.json',
      VITE_MAP_API_KEY: 'abc123',
    });

    expect(env).toMatchObject({
      enableDevTokenLogin: true,
      tokenTtlMinutes: 60,
      mapStyleUrl: 'https://tiles.example.com/style.json',
      mapStyleSatelliteUrl: 'https://tiles.example.com/sat.json',
      mapApiKey: 'abc123',
    });
  });

  it('treats empty optional values (as written in .env.example) as unset', () => {
    const env = parseEnv({
      VITE_MAP_STYLE_URL: '',
      VITE_MAP_STYLE_SATELLITE_URL: '',
      VITE_MAP_API_KEY: '',
      VITE_TOKEN_TTL_MINUTES: '',
    });

    expect(env.mapStyleUrl).toBeUndefined();
    expect(env.mapStyleSatelliteUrl).toBeUndefined();
    expect(env.mapApiKey).toBeUndefined();
    expect(env.tokenTtlMinutes).toBe(480);
  });

  it('accepts only the literal strings true and false for the dev-login flag', () => {
    expect(parseEnv({ VITE_ENABLE_DEV_TOKEN_LOGIN: 'false' }).enableDevTokenLogin).toBe(false);
    expect(() => parseEnv({ VITE_ENABLE_DEV_TOKEN_LOGIN: 'yes' })).toThrow(EnvError);
  });

  it.each(['abc', '0', '-5', '1.5'])('rejects a token TTL of %j', (ttl) => {
    expect(() => parseEnv({ VITE_TOKEN_TTL_MINUTES: ttl })).toThrow(/VITE_TOKEN_TTL_MINUTES/);
  });

  it('rejects a map style that is not an absolute URL', () => {
    expect(() => parseEnv({ VITE_MAP_STYLE_URL: 'not a url' })).toThrow(/VITE_MAP_STYLE_URL/);
  });

  it('reports every problem at once so a misconfiguration is fixed in one pass', () => {
    const attempt = () =>
      parseEnv({ VITE_TOKEN_TTL_MINUTES: 'x', VITE_MAP_STYLE_SATELLITE_URL: 'nope' });

    expect(attempt).toThrow(EnvError);
    expect(attempt).toThrow(/Invalid environment configuration/);
    expect(attempt).toThrow(/VITE_TOKEN_TTL_MINUTES/);
    expect(attempt).toThrow(/VITE_MAP_STYLE_SATELLITE_URL/);
  });

  it('never echoes a secret value in the error message', () => {
    try {
      parseEnv({ VITE_MAP_API_KEY: 'super-secret-key', VITE_TOKEN_TTL_MINUTES: 'bad' });
      expect.unreachable('parseEnv should have thrown');
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-key');
    }
  });

  it('exposes build mode flags', () => {
    expect(parseEnv({ DEV: true, PROD: false, MODE: 'development' })).toMatchObject({
      isDev: true,
      isProd: false,
    });
    expect(parseEnv({ DEV: false, PROD: true, MODE: 'production' })).toMatchObject({
      isDev: false,
      isProd: true,
    });
  });
});
