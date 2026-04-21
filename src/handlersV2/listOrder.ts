import { APIGatewayProxyEvent } from 'aws-lambda';
import { listOrders } from '../orderV2';
import { UnauthorisedError } from '../throwError';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const listOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) throw new UnauthorisedError('Session header missing');

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    if (isNaN(orgId)) return jsonResponse(400, { error: 'Invalid orgId in path' });

    const result = await listOrders(orgId, session);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};