import { http, HttpResponse } from 'msw';

/**
 * Default happy-path handlers shared by every test. Individual tests override them with
 * `server.use(...)`; feature tracks append their own endpoints here.
 */
export const handlers = [
  http.get('*/health', () => HttpResponse.json({ status: 'ok' })),
  // One clear pass on the period's last day, so flows that do not care about the date can run.
  http.post('*/api/v1/satellite-dates', async ({ request }) => {
    const body: unknown = await request.json();
    const end =
      typeof body === 'object' && body !== null && 'end_date' in body ? body.end_date : null;
    return HttpResponse.json({
      dates:
        typeof end === 'string' ? [{ date: end, optical: true, cloud_cover: 0, radar: true }] : [],
    });
  }),
];
