import { APIGatewayProxyEvent } from 'aws-lambda';
import { cancelOrder } from '../order';
import { InvalidInput, InvalidSupabase, UnauthorisedError } from '../throwError';
import { jsonResponse } from './response';

export const cancelOrderHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    // assumes order has to be there as it's included in the route path - DBC
    const orderId = event.pathParameters!.orderId!;
    const body = JSON.parse(event.body ?? '{}');
    const session = event.headers.session;

    // await to ensure the function finishes before it passes result
    const result = await cancelOrder(orderId, body.reason, session as string);

    return jsonResponse(200, result);
  } catch (e: unknown) {
    if (e instanceof InvalidInput) {
      return jsonResponse(400, { error: e.message });
    }
    if (e instanceof UnauthorisedError) {
      return jsonResponse(401, { error: e.message });
    }
    if (e instanceof InvalidSupabase) {
      return jsonResponse(500, { error: e.message });
    }
    // unknown error
    return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
  }
};
