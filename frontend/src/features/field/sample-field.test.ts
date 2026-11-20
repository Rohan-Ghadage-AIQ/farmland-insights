// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateFarmGeometry } from '@/domain';
import { SAMPLE_FIELD } from './sample-field';

// frontend/src/features/field -> repository root is four levels up.
const PAYLOADS_PY = fileURLToPath(new URL('../../../../app/utils/payloads.py', import.meta.url));

function readPython(): string {
  return readFileSync(PAYLOADS_PY, 'utf8').replace(/\r\n/g, '\n');
}

/** Pulls `farm_geojson` out of `SAMPLE_FARM_ANALYSIS_REQUEST`, as plain JSON-ish data. */
function parseSampleFarmGeojson(source: string): unknown {
  const match =
    /SAMPLE_FARM_ANALYSIS_REQUEST\s*=\s*\{([\s\S]*?)\n\}\n\nSAMPLE_FARM_ANALYSIS_RESPONSE/.exec(
      source,
    );
  if (!match?.[1]) throw new Error('Could not find SAMPLE_FARM_ANALYSIS_REQUEST in payloads.py');
  const body = `{${match[1]}\n}`;
  // Python -> JSON: trailing commas are legal in Python tuples/dicts but not in JSON.
  const asJson = body.replace(/,(\s*[}\]])/g, '$1');
  const pythonLiteral = /"farm_geojson":\s*(\{[\s\S]*?\n {4}\}),\n\s*"start_date"/.exec(asJson);
  if (!pythonLiteral?.[1]) throw new Error('Could not find farm_geojson in payloads.py');
  return JSON.parse(pythonLiteral[1]) as unknown;
}

describe('SAMPLE_FIELD', () => {
  it('is a valid farm outline', () => {
    const result = validateFarmGeometry(SAMPLE_FIELD);
    expect(result.ok).toBe(true);
  });

  it('matches app/utils/payloads.py SAMPLE_FARM_ANALYSIS_REQUEST.farm_geojson (drift check)', () => {
    const fromPython = parseSampleFarmGeojson(readPython());
    expect(SAMPLE_FIELD).toEqual(fromPython);
  });

  it('the parser notices a changed coordinate (guards against a vacuous pass)', () => {
    const changed = parseSampleFarmGeojson(readPython().replace('77.10, 28.60', '77.20, 28.60'));
    expect(changed).not.toEqual(SAMPLE_FIELD);
  });
});
