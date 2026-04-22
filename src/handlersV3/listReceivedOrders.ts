import { APIGatewayProxyEvent } from 'aws-lambda';
import { listReceivedOrders } from '../orderV3';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

/**
 * Lists all orders placed with this organisation as the SELLER.
 * Optional query-string parameter:
 *   ?status=PENDING|ACCEPTED|REJECTED - filter by order status
 */
export const listReceivedOrdersHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    if (isNaN(orgId)) return jsonResponse(400, { error: 'Invalid orgId in path' });

    // optional ?status= query parameter
    const status = event.queryStringParameters?.status;

    const result = await listReceivedOrders(orgId, session, status);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};