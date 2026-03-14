import { cancelOrder, createOrder } from '../order';
import { userLogout, userRegister } from '../userRegister';
import { getData, clearData } from '../dataStore';
import { createOrderReturn, Session } from '../interfaces';
import { cancelOrderHandler } from '../handlers/cancelOrder';
import { APIGatewayProxyEvent } from 'aws-lambda';
import mockEvent from './mocks/cancelOrderMock.json';
import * as orderModule from '../order';
import { InvalidInput, UnauthorisedError } from '../throwError';

/*APIGatewayProxyEvent Structure:
  const event = {
    body: null,
    pathParameters: null,
    headers: null,
    multiValueHeaders: null,
    httpMethod: 'DELETE',
    isBase64Encoded: false,
    pathQueryStringParameters: null,
    path: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: null,
    resource: null
  }
*/

beforeEach(() => {
  clearData();
});

// requires create order to be working
function createTemplateOrderAndUser() {
  const session = userRegister('John', 'Smith', 'johnsmith@gmail.com', 'password123') as Session;
  const delPeriod = {
    startDateTime: 123,
    endDateTime: 456,
  };
  const items = [
    {
      name: 'cabbage',
      description: 'A leafy vegetable',
      unitPrice: 12,
      quantity: 50
    },
    {
      name: 'tomato',
      description: 'A red fruit',
      unitPrice: 6,
      quantity: 100
    }
  ];
  const userDetails = {
    name: 'John Smith',
    telephone: 123456789,
    email: 'johnsmith@gmail.com',
  };

  const order = createOrder('AUD', session.session, userDetails, 
    '308 Negra Arroyo Lane', delPeriod, items) as createOrderReturn;

  return { order, session };
}


// test backend logic
test('cancel a single order', () => {

  const details = createTemplateOrderAndUser();

  const res = cancelOrder(details.order.orderId, 'reason here', details.session.session);
  expect(res).toStrictEqual({ reason: 'reason here' });

  const data = getData();
  const userFind = data.orders.find(ord => ord.orderId === details.order.orderId);
  expect(userFind).toBeUndefined();
});

test('Inavlid orderId on backend', () => {
  const details = createTemplateOrderAndUser();
  expect(() => {
    cancelOrder("3246", 'reason here', details.session.session);
  }).toThrow(InvalidInput);
});

test('Invalid session on backend', () => {
  const details = createTemplateOrderAndUser();
  expect(() => {
    cancelOrder(details.order.orderId, 'reason here', "271498");
  }).toThrow(UnauthorisedError);
});

test('Wrong user session', () => {
  const details = createTemplateOrderAndUser();
  const session = userRegister(
    'Jane', 'Smith', 'janesmith@gmail.com', 'password321') as Session;

  expect(() => {
    cancelOrder(details.order.orderId, 'reason here', session.session);
  }).toThrow(UnauthorisedError);
});


// test AWS Handle
test('Test endpoint for order cancellation', async () => {
  // create an order
  
  const details = createTemplateOrderAndUser();
  const finalReason = 'I have no reason';
  const event = { 
    ...mockEvent,
    headers: {
      session: details.session.session
    },
    pathParameters: {
      // ... is a spread operator and takes everything in mock
      ...mockEvent.pathParameters,
      orderId: details.order.orderId,
    },
    body: JSON.stringify({ reason: finalReason })
  } as unknown as APIGatewayProxyEvent;
  // unknown needs to be included first

  // async nature of func -> await response to get a valid value

  const res = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(200);
  expect(JSON.parse(res.body)).toStrictEqual({ reason: finalReason });
});


// test 400 error for invalid input
test('Test endpoint for invalid orderId', async () => {
  // create an order
  const details = createTemplateOrderAndUser();
  const finalReason = 'I have no reason';
  const event = { 
    ...mockEvent,
    headers: {
      session: details.session.session
    },
    pathParameters: {
      // ... is a spread operator and takes everything in mock
      ...mockEvent.pathParameters,
      orderId: 123,
    },
    body: JSON.stringify({ reason: finalReason })
  } as unknown as APIGatewayProxyEvent;
  // unknown needs to be included first

  // async nature of func -> await response to get a valid value

  const res = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(400);
  const body = JSON.parse(res.body);
  expect(body).toHaveProperty('error');
  expect(typeof body.error).toBe('string');
});


// test 401 error for invalid session
test('Test endpoint for invalid session', async () => {
  // create an order
  const details = createTemplateOrderAndUser();

  // userLogout
  userLogout(details.session.session);

  const finalReason = 'I have no reason';
  const event = { 
    mockEvent,
    headers: {
      session: 'not a session'
    },
    pathParameters: {
      // ... is a spread operator and takes everything in mock
      ...mockEvent.pathParameters,
      orderId: details.order.orderId,
    },
    body: JSON.stringify({ reason: finalReason })
  } as unknown as APIGatewayProxyEvent;
  // unknown needs to be included first

  // async nature of func -> await response to get a valid value

  const res = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(401);
  const body = JSON.parse(res.body);
  expect(body).toHaveProperty('error');
  expect(typeof body.error).toBe('string');
});

// test 401 error for order not belonging to user
test('Test endpoint for invalid session', async () => {
  // create an order
  const details = createTemplateOrderAndUser();
  const otherSession = userRegister('Jane', 'Smith', 
    'janesmith@gmail.com', 'password321');

  const finalReason = 'I have no reason';
  const event = { 
    mockEvent,
    headers: {
      session: otherSession
    },
    pathParameters: {
      // ... is a spread operator and takes everything in mock
      ...mockEvent.pathParameters,
      orderId: details.order.orderId,
    },
    body: JSON.stringify({ reason: finalReason })
  } as unknown as APIGatewayProxyEvent;
  // unknown needs to be included first

  // async nature of func -> await response to get a valid value
  const res = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(401);
  const body = JSON.parse(res.body);
  expect(body).toHaveProperty('error');
  expect(typeof body.error).toBe('string');
});

test('Test 500 error for generic error like db fail', async () => {
  // create an order
  const details = createTemplateOrderAndUser();

  // userLogout
  userLogout(details.session.session);

  const finalReason = 'I have no reason';
  const event = { 
    mockEvent,
    headers: {
      session: 'not a session'
    },
    pathParameters: {
      // ... is a spread operator and takes everything in mock
      ...mockEvent.pathParameters,
      orderId: details.order.orderId,
    },
    body: JSON.stringify({ reason: finalReason })
  } as unknown as APIGatewayProxyEvent;
  // unknown needs to be included first

  // invalid error caused by something like db failure
  const spy = jest.spyOn(orderModule, 'cancelOrder').mockImplementation(() => {
    throw new Error('Cannot access database');
  });

  // async nature of func -> await response to get a valid value
  const res = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(500);
  const body = JSON.parse(res.body);
  expect(body).toHaveProperty('error');
  expect(typeof body.error).toBe('string');

  // clean
  spy.mockRestore();
});