import { APIGatewayProxyEvent } from 'aws-lambda';
import { InvalidOrderId, UnauthorisedError, 
  InvalidDeliveryAddr, InvalidRequestPeriod, 
  InvalidInput } from '../throwError';
import { updateOrder } from '../order';

// Update Order
export const updateOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const orderId = event.pathParameters!.orderId!;
    const body = JSON.parse(event.body ?? '{}');
    const session = event.headers.session || event.headers.Session;

    // Call updateOrder function
    const result = await updateOrder(
      session as string,
      orderId,
      body.deliveryAddress,
      body.reqDeliveryPeriod,
      body.status
    );
    // Sucess returns 200
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  // Unathorised access must return 401
  } catch (err: unknown) {
    if (err instanceof UnauthorisedError) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: err.message })
      };
    }
    // Validation errors must return 400
    if (
      err instanceof InvalidOrderId || 
      err instanceof InvalidDeliveryAddr || 
      err instanceof InvalidRequestPeriod ||
      err instanceof InvalidInput
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: err.message })
      };
    }

  }
};