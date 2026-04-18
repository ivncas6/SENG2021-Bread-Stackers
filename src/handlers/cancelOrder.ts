import { APIGatewayProxyEvent } from 'aws-lambda';
import { cancelOrder } from '../order';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

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
    return handleErrorResponse(e);
  }
};
