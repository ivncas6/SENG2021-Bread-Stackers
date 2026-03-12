import { APIGatewayProxyEvent } from 'aws-lambda';
import { listOrders } from '../orderList';
import { InvalidInput, UnauthorisedError } from '../throwError';

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) {
      throw new UnauthorisedError('Session header missing');
    }

    const result = listOrders(session);

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
    if (err instanceof InvalidInput) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: err.message }),
      };
    }
  }
};