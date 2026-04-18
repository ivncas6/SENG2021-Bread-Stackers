import { APIGatewayProxyEvent } from 'aws-lambda';
import { updateOrder } from '../order';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

// Update Order
export const updateOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const orderId = event.pathParameters!.orderId!;
    const body = JSON.parse(event.body ?? '{}');
    const session = event.headers.session || event.headers.Session;

    if (!session) {
      return jsonResponse(401, { error: 'JWT session token is missing' });
    }

    if (!orderId) {
      return jsonResponse(400, { error: 'Order ID is missing from path' });
    }

    // Call updateOrder function
    const result = await updateOrder(
      session as string,
      orderId,
      body.deliveryAddress,
      body.reqDeliveryPeriod,
      body.status
    );
    // Sucess returns 200
    return jsonResponse(200, result);
  // Unathorised access must return 401
  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};
