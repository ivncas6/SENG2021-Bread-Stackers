import { APIGatewayProxyEvent } from 'aws-lambda';
import { listOrders } from '../order';
import { UnauthorisedError } from '../throwError';
import { jsonResponse } from './response';

export const listOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) {
      throw new UnauthorisedError('Session header missing');
    }

    const result = await listOrders(session);

    return jsonResponse(200, result);

  } catch (err: unknown) {
    if (err instanceof UnauthorisedError) {
      return jsonResponse(401, { error: err.message });
    }
    return jsonResponse(500, { error: String(err) });
  }
};
