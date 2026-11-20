import type { ApiError } from '@/api';
import type { FarmAnalysisRequest } from '@/domain';

/**
 * A copyable, support-ready summary of a failed `/analyze` call (spec 2.6: "a copyable request
 * summary" for 500s). The farm geometry is summarised by its feature count rather than included
 * in full: it can be large, and the shape itself is not useful for diagnosing a server error.
 * Never includes the bearer token.
 */
export function buildRequestSummary(request: FarmAnalysisRequest, error: ApiError): string {
  return JSON.stringify(
    {
      endpoint: 'POST /api/v1/analyze',
      timestamp: new Date().toISOString(),
      status: 'status' in error ? error.status : undefined,
      code: error.kind === 'server' ? error.code : undefined,
      message: error.message,
      request: {
        farm: { featureCount: request.farm_geojson.features.length },
        start_date: request.start_date,
        end_date: request.end_date,
        crop_category: request.crop_category,
        grid_size: request.grid_size,
      },
    },
    null,
    2,
  );
}
