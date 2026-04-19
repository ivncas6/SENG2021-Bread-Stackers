import { APIGatewayProxyEvent } from 'aws-lambda';
import { listOrders } from '../order';
import { UnauthorisedError } from '../throwError';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const listOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) {
      throw new UnauthorisedError('Session header missing');
    }

    const result = await listOrders(session);

    return jsonResponse(200, result);

  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};
