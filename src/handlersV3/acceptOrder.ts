import { APIGatewayProxyEvent } from 'aws-lambda';
import { acceptOrder } from '../orderV3';
import { UnauthorisedError } from '../throwError';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

/**
 * Seller accepts a PENDING order.  Status transitions to ACCEPTED.
 * Only ADMIN or OWNER of the seller org may accept.
 * No request body is required.
 */
export const acceptOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) throw new UnauthorisedError('Session header missing');

    const orgId   = parseInt(event.pathParameters?.orgId ?? '');
    const orderId = event.pathParameters?.orderId;
    if (isNaN(orgId) || !orderId) {
      return jsonResponse(400, { error: 'Missing orgId or orderId in path' });
    }

    const result = await acceptOrder(orgId, orderId, session);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};