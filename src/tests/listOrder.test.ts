import { listOrders } from '../order';
import { clearData } from '../dataStore';
import { createOrder } from '../order';
import { userRegister } from '../userRegister';
import { createOrderReturn, SessionId } from '../interfaces';
import { UnauthorisedError } from '../throwError';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { listOrderHandler } from '../handlers/listOrder';

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
    startDateTime: Math.floor(Date.now() / 1000),
    endDateTime: Math.floor((Date.now() + 72 * 3600 * 1000) / 1000),
  };

  const items = [
    {
      name: 'onion',
      description: 'a purple vegetable',
      unitPrice: 5,
      quantity: 15,
    },
    {
      name: 'tomato',
      description: 'A red fruit',
      unitPrice: 4,
      quantity: 100,
    },
  ];

  const userDetails = {
    firstName: 'John',
    lastName: 'Smith',
    telephone: '0412345678',
    email: 'johnsmith@gmail.com',
  };

  const currency = 'AUD';

  const order = createOrder(
    currency,
    session.session,
    userDetails,
    '123 Street Name, Kingsford',
    reqDeliveryPeriod,
    items,
  ) as createOrderReturn;

  return { session, order, userDetails, reqDeliveryPeriod, items, currency };
}

// backend logic tests for listOrders 
describe('listOrders tests', () => {
  test('successfully returns empty list when user has no orders', () => {
    const session = userRegister(
      'John',
      'Smith',
      'johnsmith@gmail.com',
      'password123',
      '0412345678'
    ) as SessionId;

    const result = listOrders(session.session);
    expect(result).toEqual({ orders: [] });
  });

  test('successfully returns a single order belonging to the user', () => {
    const { session, order, currency } =
      createOrderAndUser();

    const result = listOrders(session.session);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toEqual({
      orderId: order.orderId,
      status: expect.any(String),
      issuedDate: expect.any(String),
      currency: currency,
      finalPrice: 522.5,
    });
  });

  test('successfully returns multiple orders belonging to the user', () => {
    const { session, userDetails, reqDeliveryPeriod, items, currency } =
      createOrderAndUser();

    // create a second order for the same user
    createOrder(
      currency,
      session.session,
      userDetails,
      '456 Second St, Sydney',
      reqDeliveryPeriod,
      items,
    );

    const result = listOrders(session.session);
    expect(result.orders).toHaveLength(2);
  });

  test('does not return orders belonging to other users', () => {
    // user 1 creates an order
    createOrderAndUser();

    // user 2 logs in and lists their orders
    const user2 = userRegister(
      'Anna',
      'Lee',
      'annalee@gmail.com',
      'password123',
      '0412345678'
    ) as SessionId;

    const result = listOrders(user2.session);
    expect(result.orders).toHaveLength(0);
  });

  test('throws UnauthorisedError on invalid session', () => {
    expect(() => listOrders('invalid-session-string')).toThrow(UnauthorisedError);
  });
});

// lambda handler tests for listOrders 
describe('Lambda handler tests for listOrders', () => {
  test('successfully returns 200 with empty orders list', async () => {
    const session = userRegister(
      'John',
      'Smith',
      'johnsmith@gmail.com',
      'password123',
      '0412345678',
    ) as SessionId;

    const event = {
      headers: { session: session.session },
    } as unknown as APIGatewayProxyEvent;

    const response = await listOrderHandler(event);
    expect(response?.statusCode).toEqual(200);
    expect(JSON.parse(response?.body ?? '')).toEqual({ orders: [] });
  });

  test('successfully returns 200 with user orders', async () => {
    const { session, order, currency } =
      createOrderAndUser();

    const event = {
      headers: { session: session.session },
    } as unknown as APIGatewayProxyEvent;

    const response = await listOrderHandler(event);
    expect(response?.statusCode).toEqual(200);
    expect(JSON.parse(response?.body ?? '')).toEqual({
      orders: [{
        orderId: order.orderId,
        status: expect.any(String),
        issuedDate: expect.any(String),
        currency: currency,
        finalPrice: 522.5
      }]
    });
  });

  test('returns 401 when session header is missing', async () => {
    const event = {
      headers: {},
    } as unknown as APIGatewayProxyEvent;

    const response = await listOrderHandler(event);
    expect(response?.statusCode).toStrictEqual(401);
    expect(JSON.parse(response?.body ?? '')).toStrictEqual({ error: expect.any(String) });
  });

  test('returns 401 when session is invalid', async () => {
    const event = {
      headers: { session: 'completely-invalid-session' },
    } as unknown as APIGatewayProxyEvent;

    const response = await listOrderHandler(event);
    expect(response?.statusCode).toStrictEqual(401);
    expect(JSON.parse(response?.body ?? '')).toStrictEqual({ error: expect.any(String) });
  });

  test('does not return another user\'s orders', async () => {
    // user 1 creates an order
    createOrderAndUser();

    // user 2 lists their orders
    const user2 = userRegister(
      'Anna',
      'Lee',
      'annalee@gmail.com',
      'password123',
      '0412345678'
    ) as SessionId;

    const event = {
      headers: { session: user2.session },
    } as unknown as APIGatewayProxyEvent;

    const response = await listOrderHandler(event);
    expect(response?.statusCode).toEqual(200);
    expect(JSON.parse(response?.body ?? '').orders).toHaveLength(0);
  });
});