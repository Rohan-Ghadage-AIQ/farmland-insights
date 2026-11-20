// Local stand-in for the FastAPI backend, for running the UI without PropelAuth or Earth Engine
// credentials. Every number it returns is synthetic. Never deploy this.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_API_PORT ?? 8000);
const MAX_CELLS = 5000;

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });

function outerRings(farm) {
  const rings = [];
  for (const feature of farm?.features ?? []) {
    const geometry = feature.geometry;
    if (geometry?.type === 'Polygon') rings.push(geometry.coordinates[0]);
    if (geometry?.type === 'MultiPolygon') for (const p of geometry.coordinates) rings.push(p[0]);
  }
  return rings;
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Smooth pseudo-random field in 0..1, so neighbouring cells look related.
const field = (x, y, seed) =>
  0.5 + 0.25 * Math.sin(x * 9000 + seed) + 0.25 * Math.cos(y * 11000 + seed * 1.7);

function analyze(body) {
  const rings = outerRings(body.farm_geojson);
  if (rings.length === 0) return null;
  const points = rings.flat();
  const minX = Math.min(...points.map((p) => p[0]));
  const maxX = Math.max(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1]));
  const maxY = Math.max(...points.map((p) => p[1]));

  let size = Math.max(1, Number(body.grid_size) || 50);
  const latRad = (((minY + maxY) / 2) * Math.PI) / 180;
  const cells = () => {
    const dy = size / 111_320;
    const dx = size / (111_320 * Math.cos(latRad));
    return { dx, dy, count: Math.ceil((maxX - minX) / dx) * Math.ceil((maxY - minY) / dy) };
  };
  while (cells().count > MAX_CELLS) size *= 1.5;
  const { dx, dy } = cells();

  const features = [];
  let gridId = 1;
  for (let y = minY; y < maxY; y += dy) {
    for (let x = minX; x < maxX; x += dx) {
      const centre = [x + dx / 2, y + dy / 2];
      if (!rings.some((ring) => inRing(centre, ring))) continue;
      const ndvi = 0.2 + 0.65 * field(x, y, 1);
      const soil = 0.08 + 0.3 * field(x, y, 4);
      const round = (value) => Math.round(value * 1000) / 1000;
      const advisories = {};
      if (ndvi < 0.45)
        advisories.ndvi = 'Low vigour: scout this cell for pests or nutrient stress.';
      if (soil < 0.18) advisories.soil_moist = 'Irrigate within 2 days.';
      features.push({
        type: 'Feature',
        id: gridId,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [x, y],
              [x + dx, y],
              [x + dx, y + dy],
              [x, y + dy],
              [x, y],
            ],
          ],
        },
        properties: {
          grid_id: gridId,
          raw_metrics: {
            ndvi: round(ndvi),
            evi: round(ndvi * 0.7),
            savi: round(ndvi * 0.8),
            ndre: round(ndvi * 0.5),
            ndmi: round(soil * 1.5),
            ndwi: round(-0.2 - ndvi * 0.5),
            rvi: round(0.3 + 0.5 * field(x, y, 3)),
            rsm: round(field(x, y, 5)),
            et_actual: 0.17,
            t2m: 26.4,
            soil_moist: round(soil),
          },
          cpi_scores: {
            Structural: round(field(x, y, 1)),
            Chlorophyll: round(field(x, y, 2)),
            Water_Drought: round(field(x, y, 4)),
            Environmental: round(field(x, y, 6)),
            Agro_Meteo: round(field(x, y, 8)),
          },
          advisories,
        },
      });
      gridId += 1;
    }
  }
  return features.length > 0 ? { type: 'FeatureCollection', features } : null;
}

/** Synthetic passes: Sentinel-2 every 5 days, Sentinel-1 every 6, newest first. */
function satelliteDates(body) {
  const start = Date.parse(`${body.start_date}T00:00:00Z`);
  const end = Math.min(Date.parse(`${body.end_date}T00:00:00Z`), Date.now());
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const DAY = 86_400_000;
  const dates = [];
  for (let t = end; t >= start; t -= DAY) {
    const n = Math.floor(t / DAY);
    const optical = n % 5 === 0;
    const radar = n % 6 === 0;
    if (!optical && !radar) continue;
    dates.push({
      date: new Date(t).toISOString().slice(0, 10),
      optical,
      cloud_cover: optical ? Math.round(((n * 37) % 100) * 10) / 10 : null,
      radar,
    });
  }
  return { dates };
}

const session = (email) => ({
  user_id: 'u_mock',
  email,
  access_token: 'mock-token',
  token_type: 'bearer',
  expires_in_minutes: 480,
});

createServer(async (req, res) => {
  const route = `${req.method} ${new URL(req.url, 'http://x').pathname}`;
  try {
    if (route === 'GET /health') return send(res, 200, { status: 'ok' });
    if (route === 'POST /api/v1/auth/token' || route === 'POST /api/v1/auth/register') {
      const body = await readJson(req);
      return send(res, 200, session(body.email ?? 'dev@example.com'));
    }
    if (route === 'GET /api/v1/auth/whoami') {
      return send(res, 200, { user_id: 'u_mock', email: 'dev@example.com', active_org_id: null });
    }
    if (route === 'POST /api/v1/satellite-dates') {
      const result = satelliteDates(await readJson(req));
      return result ? send(res, 200, result) : send(res, 400, { detail: 'Invalid period.' });
    }
    if (route === 'POST /api/v1/analyze') {
      const body = await readJson(req);
      const result = analyze(body);
      if (result && body.image_date) {
        result.imagery = {
          image_date: body.image_date,
          optical_date: body.image_date,
          radar_date: body.image_date,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return result
        ? send(res, 200, result)
        : send(res, 400, { detail: 'The field produced no grid cells.' });
    }
    return send(res, 404, { detail: 'Not Found' });
  } catch {
    return send(res, 400, { detail: 'Malformed request body.' });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`MOCK Farmland API (synthetic data) on http://127.0.0.1:${PORT}`);
});
