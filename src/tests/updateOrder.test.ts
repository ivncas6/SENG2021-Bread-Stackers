import { APIGatewayProxyEvent } from 'aws-lambda';
import { clearData, getData } from '../dataStore';
import { userRegister } from '../userRegister';
import { createOrder, updateOrder } from '../order';
import { updateOrderHandler } from '../handlers/updateOrder'; 
import { createOrderReturn, SessionId } from '../interfaces';
import { 
  InvalidOrderId, 
  UnauthorisedError,
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
    '0412345678',
  ) as SessionId;

  const reqDeliveryPeriod = {
    startDateTime: Math.floor(Date.now() / 1000) + 3600,
    endDateTime: Math.floor(Date.now() / 1000) + 86400,
  };

  const items = [{ name: 'onion', description: 'purple', unitPrice: 5, quantity: 1 }];
  const userDetails = { firstName: 'John', lastName: 'Smith', telephone: '0412345678', email: 'johnsmith@gmail.com' };

  const order = createOrder(
    'AUD',
    session.session,
    userDetails,
    '123 Kingsford',
    reqDeliveryPeriod,
    items
  ) as createOrderReturn; 

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
    const updatedOrder = data.orders.find((o) => o.orderId === orderId);
    
    const delivery = data.deliveries.find(d => d.orderID === orderId);
    const address = data.addresses.find(a => a.addressID === delivery?.deliveryAddressID);
    
    expect(updatedOrder).toBeDefined();
    expect(address?.street).toStrictEqual(newAddress);
    expect(updatedOrder?.status).toStrictEqual('processed');
    expect(delivery?.startDate).toStrictEqual(reqDeliveryPeriod.startDateTime.toString());
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
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
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
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
  });

  test('Invalid Delivery Address', async () => {
    const { session, orderId, reqDeliveryPeriod } = createOrderAndUser();
    const longName = '1234567890'.repeat(21);

    const event = {
      pathParameters: { orderId: orderId },
      headers: { session: session.session },
      body: JSON.stringify({
        deliveryAddress: longName, 
        reqDeliveryPeriod: reqDeliveryPeriod
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await updateOrderHandler(event);

    expect(response?.statusCode).toStrictEqual(400);
    const body = JSON.parse(response?.body ?? '{}');
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toStrictEqual('string');
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
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toStrictEqual('string');
  });
});