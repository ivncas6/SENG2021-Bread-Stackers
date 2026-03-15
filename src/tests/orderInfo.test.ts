import { getOrderInfo } from '../order';
import { clearData } from '../dataStore';
import { createOrder } from '../order';
import { userRegister } from '../userRegister';
import { createOrderReturn, SessionId } from '../interfaces';
import { InvalidOrderId, UnauthorisedError } from '../throwError';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { getOrderInfoHandler } from '../handlers/orderInfo';

beforeEach(() => {
  clearData();
});

function createOrderAndUser() {
  const session = userRegister(
    'John',
    'Smith',
    'johnsmith@gmail.com',
    '0412345678',
    'password123',
  ) as SessionId;
  const reqDeliveryPeriod = {
    startDateTime: Math.floor(Date.now() / 1000),
    endDateTime: Math.floor((Date.now() + 72 * 3600 * 1000) / 1000), // three days from startDate
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

// backend logic test for getOrderInfo
describe('getOrderInfo tests', () => {
  test('successfully returns the order info', () => {
    const { session, order, userDetails, reqDeliveryPeriod, items, currency } =
      createOrderAndUser();
    const res = getOrderInfo(session.session, order.orderId);
    expect(res).toStrictEqual({
      orderId: order.orderId,
      issuedDate: expect.any(String),
      issuedTime: expect.any(String),
      status: expect.any(String),
      currency: currency,
      finalPrice: 522.5,
      address: '123 Street Name, Kingsford',
      deliveryDetails: reqDeliveryPeriod,
      userDetails,
      items: items,
      taxExclusive: 475,
      taxInclusive: 522.5,
    });
  });
  test('invalid orderid error', () => {
    const { session, order } = createOrderAndUser();
    expect(() => getOrderInfo(session.session, order.orderId + '123')).toThrow(
      InvalidOrderId
    );
  });
  test('invalid session error', () => {
    const { session, order } = createOrderAndUser();
    expect(() =>
      getOrderInfo(session.session + 'athwuhd', order.orderId)
    ).toThrow(UnauthorisedError);
  });
  test('order does not belong to user', () => {
    const { order } = createOrderAndUser();
    const user2 = userRegister(
      'Anna',
      'Lee',
      'annaLee@gmail.com',
      '0412345678',
      'password123'
    ) as SessionId;
    expect(() => getOrderInfo(user2.session, order.orderId)).toThrow(
      InvalidOrderId
    );
  });
});

// Lamda function test for getOrderInfo
describe('Lamda function tests for getOrderInfo', () => {
  test('sucessfully returns order info', async () => {
    const { session, order, userDetails, items, currency } =
      createOrderAndUser();
    const result = {
      headers: {
        session: session.session
      },
      pathParameters: {
        orderId: order.orderId
      }
    } as unknown as APIGatewayProxyEvent;

    const response = await getOrderInfoHandler(result);
    expect(response.statusCode).toEqual(200);
    expect(JSON.parse(response.body)).toEqual({
      orderId: order.orderId,
      status: expect.any(String),
      currency: currency,
      address: '123 Street Name, Kingsford',
      deliveryDetails: {
        startDateTime: expect.any(Number),
        endDateTime: expect.any(Number)
      },
      issuedDate: expect.any(String),
      issuedTime: expect.any(String),
      taxExclusive: 475,
      taxInclusive: 522.5,
      finalPrice: 522.5,
      items,
      userDetails,
    });
  });
  test('orderId does not exist', async () => {
    const { session, order } = createOrderAndUser();
    const result = {
      headers: {
        session: session.session
      },
      pathParameters: {
        orderId: order.orderId + 'aws'
      }
    } as unknown as APIGatewayProxyEvent;

    const response = await getOrderInfoHandler(result);
    expect(response.statusCode).toStrictEqual(400);
    expect(JSON.parse(response.body)).toStrictEqual({ error: expect.any(String) });
  });
  test('invalid session provided', async () => {
    const { session, order } = createOrderAndUser();
    const result = {
      headers: {
        session: session.session + '15dse'
      },
      pathParameters: {
        orderId: order.orderId
      }
    } as unknown as APIGatewayProxyEvent;

    const response = await getOrderInfoHandler(result);
    expect(response.statusCode).toStrictEqual(401);
    expect(JSON.parse(response.body)).toStrictEqual({ error: expect.any(String) });
  });
  test('order doesnot belong to the user', async () => {
    const { order } = createOrderAndUser();
    const user2 = userRegister(
      'Anna',
      'Lee',
      'annaLee@gmail.com',
      '0412345678',
      'password123',
    ) as SessionId;
    const result = {
      headers: {
        session: user2.session
      },
      pathParameters: {
        orderId: order.orderId
      }
    } as unknown as APIGatewayProxyEvent;

    const response = await getOrderInfoHandler(result);
    expect(response.statusCode).toStrictEqual(400);
    expect(JSON.parse(response.body)).toStrictEqual({ error: expect.any(String) });
  });
});
