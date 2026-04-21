import { APIGatewayProxyEvent } from 'aws-lambda';
import { listAddresses } from '../address';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

/**
 * GET /v2/organisation/{orgId}/address
 * Returns all addresses associated with the organisation: its own registered
 * address plus every delivery address used across past orders.
 * The frontend uses this to populate address dropdowns.
 */
export const listAddressHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    if (isNaN(orgId)) return jsonResponse(400, { error: 'Invalid orgId in path' });

    const result = await listAddresses(session, orgId);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};