import { APIGatewayProxyEvent } from 'aws-lambda';
import { getOrderInfo } from '../order';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const getOrderInfoHandler = async (event: APIGatewayProxyEvent) => {
  try {
    // get the session from the header
    const session = event.headers.session;
    if (!session) {
      return jsonResponse(400, { error: 'provided session is not valid'});
    }
    // check if the provided path contains an orderId
    if (!event.pathParameters) {
      return jsonResponse(400, { error: 'orderId is null.' });
    }
    // get the orderId from the route path
    const orderId = event.pathParameters.orderId;
    if (!orderId) {
      return jsonResponse(400, { error: 'orderId provided is not valid' });
    }

    // call the backend function
    const res = await getOrderInfo(session, orderId);

    return jsonResponse(200, res);
  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};
