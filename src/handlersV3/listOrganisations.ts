import { APIGatewayProxyEvent } from 'aws-lambda';
import { listOrganisations } from '../orderV3';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

/**
 * GET /v3/organisations
 *
 * Returns all organisations so buyers can discover sellers and retrieve their
 * orgId before browsing catalogues.  Any authenticated user may call this.
 */
export const listOrganisationsHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const result = await listOrganisations(session);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};