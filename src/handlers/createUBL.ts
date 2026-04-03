import { APIGatewayProxyEvent } from 'aws-lambda';
import { jsonResponse } from './response';
import { createOrderUBLXML } from '../generateUBL';
import { InvalidOrderId, UnauthorisedError } from '../throwError';

export const createUBLHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    const orderId = event.pathParameters!.orderId!;
    const session = event.headers.session as string;
    
    const result = await createOrderUBLXML(orderId, session);

    return { signedUrl: result };

  } catch (e: unknown) {
    if (e instanceof InvalidOrderId) {
      return jsonResponse(400, { error: e.message });
    }
    if (e instanceof UnauthorisedError) {
      return jsonResponse(401, { error: e.message });
    }
    return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
  }
};