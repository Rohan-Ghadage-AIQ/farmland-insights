import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { errorDetails } from '../errors';
import { FullPageError, reloadPage } from '../errors/FullPageError';

function describeRouteError(error: unknown): unknown {
  if (isRouteErrorResponse(error)) {
    return { status: error.status, statusText: error.statusText, data: error.data as unknown };
  }
  return error instanceof Error ? errorDetails(error) : String(error);
}

/** Router-level errorElement: a crashed route never leaves a blank screen. */
export function RouteErrorPage() {
  const error = useRouteError();
  return <FullPageError details={describeRouteError(error)} onReload={reloadPage} />;
}
