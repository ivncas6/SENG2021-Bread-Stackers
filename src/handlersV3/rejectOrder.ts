import { APIGatewayProxyEvent } from 'aws-lambda';
import { rejectOrder } from '../orderV3';
import { UnauthorisedError } from '../throwError';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

/**
 * Seller rejects a PENDING order.  Status transitions to REJECTED.
 * A rejection reason is required in the request body.
 * Only ADMIN or OWNER of the seller org may reject.
 */
export const rejectOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) throw new UnauthorisedError('Session header missing');

    const orgId   = parseInt(event.pathParameters?.orgId ?? '');
    const orderId = event.pathParameters?.orderId;
    if (isNaN(orgId) || !orderId) {
      return jsonResponse(400, { error: 'Missing orgId or orderId in path' });
    }

    const body   = JSON.parse(event.body ?? '{}');
    const reason = body.reason as string | undefined;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return jsonResponse(400, { error: 'A rejection reason is required in the request body' });
    }

    const result = await rejectOrder(orgId, orderId, reason, session);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};