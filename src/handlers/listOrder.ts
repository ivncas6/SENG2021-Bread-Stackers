import { APIGatewayProxyEvent } from 'aws-lambda';
import { listOrders } from '../order';
import { UnauthorisedError } from '../throwError';

export const listOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) {
      throw new UnauthorisedError('Session header missing');
    }

    const result = await listOrders(session);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };

  } catch (err: unknown) {
    if (err instanceof UnauthorisedError) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: err.message }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err) })
    };
  }
};