import { APIGatewayProxyEvent } from 'aws-lambda';
import { cancelOrder } from '../order';
import { InvalidInput, UnauthorisedError } from '../throwError';

export const cancelOrderHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    // assumes order has to be there as it's included in the route path - DBC
    const orderId = event.pathParameters!.orderId!;
    const body = JSON.parse(event.body ?? '{}');

    // await to ensure the function finishes before it passes result
    const result = await cancelOrder(orderId, body.reason);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err: unknown) {
    if (err instanceof InvalidInput) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: err.message }),
      };
    }
    if (err instanceof UnauthorisedError) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: err.message }),
      };
    }
    // unknown error
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};