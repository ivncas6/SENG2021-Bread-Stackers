import { APIGatewayProxyEvent } from 'aws-lambda';
import { clearData, getData } from '../dataStore';
import { userRegister } from '../userRegister';
import { createOrder, updateOrder } from '../order';
import { updateOrderHandler } from '../handlers/updateOrder'; 
import { Session } from '../interfaces';
import { 
  InvalidOrderId, 
  UnauthorisedError, 
  InvalidDeliveryAddr, 
  InvalidRequestPeriod,
  InvalidInput
} from '../throwError';

beforeEach(() => {
  clearData();
});

function createOrderAndUser() {
  const session = userRegister(
    'John',
    'Smith',
    'johnsmith@gmail.com',
    'password123',
  ) as Session;

  const reqDeliveryPeriod = {
    startDateTime: Math.floor(Date.now() / 1000) + 3600,
    endDateTime: Math.floor(Date.now() / 1000) + 86400,
  };

  const items = [{ name: 'onion', description: 'purple', unitPrice: 5, quantity: 1 }];
  const userDetails = { name: 'John Smith', telephone: 123456789, email: 'johnsmith@gmail.com' };

  const order = createOrder(
    'AUD',
    session.session,
    userDetails,
    '123 Kingsford',
    reqDeliveryPeriod,
    items
  ) as any; 

  return { session, orderId: order.orderId, reqDeliveryPeriod, userDetails, items };
}

describe('Backend logic test for updateOrder', () => {
  test('successfully update order delivery address', () => {
    const { session, orderId, reqDeliveryPeriod } = createOrderAndUser();
    
    const newAddress = '456 Kensington Street';
    
    // Call backend logic
    updateOrder(
      session.session,
      orderId,
      newAddress,
      reqDeliveryPeriod,
      'processed'
    );

    // Verify state in dataStore
    const data = getData();
    const updatedOrder = data.orders.find((o: any) => o.orderId === orderId);
    
    
    expect(updatedOrder).toBeDefined();
    expect(updatedOrder?.deliveryAddress).toBe(newAddress);
    expect(updatedOrder?.status).toBe('processed');
  });

  test('Invalid Session', () => {
    const { orderId, reqDeliveryPeriod } = createOrderAndUser();
    expect(() => {
      updateOrder('invalid_session_123', orderId, 'Address', reqDeliveryPeriod, 'processed');
    }).toThrow(UnauthorisedError);
  });

  test('Order does not exist', () => {
    const { session, reqDeliveryPeriod } = createOrderAndUser();
    expect(() => {
      updateOrder(session.session, 'non_existent_id', 'Address', reqDeliveryPeriod, 'processed');
    }).toThrow(InvalidOrderId);
  });
});

describe('Lambda function for updateOrderHandler', () => {
  test('successfully updates an order', async () => {
    const { session, orderId, reqDeliveryPeriod } = createOrderAndUser();

    const event = {
      pathParameters: {
        orderId: orderId
      },
      headers: {
        session: session.session
      },
      body: JSON.stringify({
        deliveryAddress: '789 New Kensington Road',
        reqDeliveryPeriod: reqDeliveryPeriod,
        status: 'delivered'
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await updateOrderHandler(event);

    expect(response?.statusCode).toStrictEqual(200);
    expect(JSON.parse(response?.body ?? '{}')).toBeDefined(); 
  });

  test('session header missing', async () => {
    const { orderId } = createOrderAndUser();

    const event = {
      pathParameters: { orderId: orderId },
      headers: {}, 
      body: JSON.stringify({ status: 'cancelled' })
    } as unknown as APIGatewayProxyEvent;

    const response = await updateOrderHandler(event);

    expect(response?.statusCode).toStrictEqual(401);
    const body = JSON.parse(response?.body ?? '{}');
    expect(body).toStrictEqual({
      errorCode: 401,
      errorMsg: 'header missing'
    });
  });

  test('Order ID missing', async () => {
    const { session } = createOrderAndUser();

    const event = {
      pathParameters: {}, 
      headers: { session: session.session },
      body: JSON.stringify({ status: 'processed' })
    } as unknown as APIGatewayProxyEvent;

    const response = await updateOrderHandler(event);

    expect(response?.statusCode).toStrictEqual(400);
    const body = JSON.parse(response?.body ?? '{}');
    expect(body).toStrictEqual({
      errorCode: 400,
      errorMsg: 'Order ID is missing'
    });
  });

  test('Invalid Delivery Address', async () => {
    const { session, orderId, reqDeliveryPeriod } = createOrderAndUser();

    const event = {
      pathParameters: { orderId: orderId },
      headers: { session: session.session },
      body: JSON.stringify({
        deliveryAddress: '', 
        reqDeliveryPeriod: reqDeliveryPeriod
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await updateOrderHandler(event);

    expect(response?.statusCode).toStrictEqual(400);
    const body = JSON.parse(response?.body ?? '{}');
    expect(body.errorCode).toBe(400);
    expect(typeof body.errorMsg).toBe('string');
  });

  test('Invalid Request Period', async () => {
    const { session, orderId } = createOrderAndUser();

    const event = {
      pathParameters: { orderId: orderId },
      headers: { session: session.session },
      body: JSON.stringify({
        reqDeliveryPeriod: {
          startDateTime: 1700000000,
          endDateTime: 1600000000 
        }
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await updateOrderHandler(event);

    expect(response?.statusCode).toStrictEqual(400);
    const body = JSON.parse(response?.body ?? '{}');
    expect(body.errorCode).toBe(400);
  });
});