import { APIGatewayProxyEvent } from 'aws-lambda';
import { InvalidOrderId, UnauthorisedError, 
  InvalidDeliveryAddr, InvalidRequestPeriod, 
  InvalidInput, 
  InvalidSupabase} from '../throwError';
import { updateOrder } from '../order';
import { jsonResponse } from '../handlerHelpers/response';

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
  } catch (err: unknown) {
    if (err instanceof UnauthorisedError) {
      return jsonResponse(401, { error: err.message });
    }
    // Validation errors must return 400
    if (
      err instanceof InvalidOrderId || 
      err instanceof InvalidDeliveryAddr || 
      err instanceof InvalidRequestPeriod ||
      err instanceof InvalidInput
    ) {
      return jsonResponse(400, { error: err.message });
    }
    if (err instanceof InvalidSupabase) {
      return jsonResponse(500, { error: err.message });
    }
    return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });

  }
};
