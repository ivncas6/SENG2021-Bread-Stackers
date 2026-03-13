import { APIGatewayProxyEvent } from 'aws-lambda';
import { getOrderInfo } from '../order';
import { InvalidOrderId, UnauthorisedError } from '../throwError';

export const getOrderInfoHandler = async (event: APIGatewayProxyEvent) => {
  try {
    // get the session from the header
    const session = event.headers.session;
    if (!session) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'provided session is not valid'})
      };
    }
    // check if the provided path contains an orderId
    if (!event.pathParameters) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orderId is null.' })
      };
    }
    // get the orderId from the route path
    const orderId = event.pathParameters.orderId;
    if (!orderId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orderId provided is not valid' })
      };
    }

    // call the backend function
    const res = getOrderInfo(session, orderId);

    return {
      statusCode: 200,
      body: JSON.stringify(res),
    };
  } catch (e) {
    if (e instanceof InvalidOrderId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: e.message })
      };
    }
    if (e instanceof UnauthorisedError) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: e.message })
      };
    }
    // internal server error, server doesnot know how to handle the error
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'INTERNAL SERVER ERROR' }),
    };
  }
};
