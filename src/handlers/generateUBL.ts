import { APIGatewayProxyEvent } from 'aws-lambda';
import { jsonResponse } from './response';
import { getOrderUBLXML } from '../generateUBL';
import { InvalidOrderId, InvalidSupabase, UnauthorisedError } from '../throwError';

export const generateUBLHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    const orderId = event.pathParameters!.orderId!;
    const session = event.headers.session as string;
    
    const result = await getOrderUBLXML(orderId, session);

    return { signedUrl: result };

  } catch (e: unknown) {
    if (e instanceof InvalidOrderId) {
      return jsonResponse(400, { error: e.message });
    }
    if (e instanceof UnauthorisedError) {
      return jsonResponse(401, { error: e.message });
    }
    if (e instanceof InvalidSupabase) {
      return jsonResponse(500, { error: e.message });
    }
    return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
  }
};