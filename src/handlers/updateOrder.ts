import { APIGatewayProxyEvent } from 'aws-lambda';
import { InvalidOrderId, UnauthorisedError, 
  InvalidDeliveryAddr, InvalidRequestPeriod, 
  InvalidInput } from '../throwError';
import { updateOrder } from '../updateOrder';

// Update Order
export const updateOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const body = JSON.parse(event.body ?? '{}');

    // Fetch the order ID
    const orderId = event.pathParameters?.orderId;
    if (!orderId) {
      throw new InvalidOrderId('Order ID is missing from path');
    }

    // Fetch session 
    const session = event.headers?.userId || event.headers?.session; 
    if (!session) {
      throw new UnauthorisedError('User authorization header missing');
    }

    // Extract data from body
    const { deliveryAddress, reqDeliveryPeriod, status } = body;

    // Call updateOrder function
    const result = updateOrder(
      session,
      orderId,
      deliveryAddress,
      reqDeliveryPeriod,
      status
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
        body: JSON.stringify({ errorCode: 401, errorMsg: err.message })
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
        body: JSON.stringify({ errorCode: 400, errorMsg: err.message })
      };
    }

  }
};