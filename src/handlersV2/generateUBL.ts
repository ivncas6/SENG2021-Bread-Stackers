import { APIGatewayProxyEvent } from 'aws-lambda';
import { getOrderUBL } from '../orderV2';
import { UnauthorisedError } from '../throwError';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const generateUBLHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) throw new UnauthorisedError('Session header missing');

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    const orderId = event.pathParameters?.orderId;
    if (isNaN(orgId) || !orderId) return jsonResponse(400, { error: 'Missing orgId or orderId in path' });

    const signedUrl = await getOrderUBL(orgId, session, orderId);
    return jsonResponse(200, { signedUrl });
  } catch (e) {
    return handleErrorResponse(e);
  }
};