import { APIGatewayProxyEvent } from 'aws-lambda';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';
import { getOrderUBLXML } from '../generateUBL';

export const generateUBLHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    const orderId = event.pathParameters!.orderId!;
    const session = event.headers.session as string;
    
    const result = await getOrderUBLXML(orderId, session);
    return jsonResponse(200, { signedUrl: result });

  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};