import { APIGatewayProxyEvent } from 'aws-lambda';
import { cancelOrder } from '../orderV2';
import { UnauthorisedError } from '../throwError';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const cancelOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) throw new UnauthorisedError('Session header missing');

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    const orderId = event.pathParameters?.orderId;
    if (isNaN(orgId) || !orderId) return jsonResponse(400, { error: 'Missing orgId or orderId in path' });

    const body = JSON.parse(event.body ?? '{}');
    const result = await cancelOrder(orgId, orderId, body.reason ?? '', session);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};