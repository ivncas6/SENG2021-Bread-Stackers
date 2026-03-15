import { cancelOrder, createOrder } from '../order';
import { userLogout, userRegister } from '../userRegister';
import { clearData, getUserByIdSupa } from '../dataStore';
import { createOrderReturn, SessionId } from '../interfaces';
import { cancelOrderHandler } from '../handlers/cancelOrder';
import { APIGatewayProxyEvent } from 'aws-lambda';
import mockEvent from './mocks/cancelOrderMock.json';
import * as orderModule from '../order';
import { InvalidInput, UnauthorisedError } from '../throwError';
import { getUserIdFromSession } from '../userHelper';

// Counter to ensure unique emails across tests in the real DB
let testIdx = 0;

beforeEach(async () => {
  await clearData();
});

async function createTemplateOrderAndUser() {
  testIdx++;
  const uniqueEmail = `testuser${testIdx}@example.com`;
  
  // Await the registration
  const session = await userRegister(
    'John', 'Smith', uniqueEmail, '0412345678', 'password123'
  ) as SessionId;

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
    firstName: 'John', 
    lastName: 'Smith',
    telephone: '0412345678',
    email: uniqueEmail,
  };

  // Await the order creation
  const order = await createOrder('AUD', session.session, userDetails, 
    '308 Negra Arroyo Lane', delPeriod, items) as createOrderReturn;

  return { order, session };
}

// --- Backend Logic Tests ---

test('cancel a single order', async () => {
  const details = await createTemplateOrderAndUser();
  const userId = getUserIdFromSession(details.session.session);

  const res = await cancelOrder(details.order.orderId, 'reason here', details.session.session);
  expect(res).toStrictEqual({ reason: 'reason here' });

  const user = await getUserByIdSupa(Number(userId));
  expect(user).toBeDefined();
});

test('Inavlid orderId on backend', async () => {
  const details = await createTemplateOrderAndUser();
  await expect(
    cancelOrder(crypto.randomUUID(), 'reason here', details.session.session)
  ).rejects.toThrow(InvalidInput);
});

test('Invalid session on backend', async () => {
  const details = await createTemplateOrderAndUser();
  await expect(
    cancelOrder(details.order.orderId, 'reason here', '271498')
  ).rejects.toThrow(UnauthorisedError);
});

test('Wrong user session', async () => {
  const details = await createTemplateOrderAndUser();
  // Create a second user to try and cancel the first user's order
  const otherSession = await userRegister(
    'Jane', 'Smith', `jane${testIdx}@smith.com`, 
    '0412345678', 'password321') as SessionId;

  await expect(
    cancelOrder(details.order.orderId, 'reason here', otherSession.session)
  ).rejects.toThrow(UnauthorisedError);
});

// --- AWS Lambda Handler Tests ---

test('Test endpoint for order cancellation', async () => {
  const details = await createTemplateOrderAndUser();
  const finalReason = 'I have no reason';
  const event = { 
    ...mockEvent,
    headers: {
      session: details.session.session
    },
    pathParameters: {
      ...mockEvent.pathParameters,
      orderId: details.order.orderId,
    },
    body: JSON.stringify({ reason: finalReason })
  } as unknown as APIGatewayProxyEvent;

  const res = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(200);
  expect(JSON.parse(res.body)).toStrictEqual({ reason: finalReason });
});

test('Test endpoint for invalid orderId', async () => {
  const details = await createTemplateOrderAndUser();
  const event = { 
    ...mockEvent,
    headers: {
      session: details.session.session
    },
    pathParameters: {
      ...mockEvent.pathParameters,
      orderId: crypto.randomUUID(), 
    },
    body: JSON.stringify({ reason: 'testing' })
  } as unknown as APIGatewayProxyEvent;

  const res = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(400);
  const body = JSON.parse(res.body);
  expect(body).toHaveProperty('error');
});

test('Test endpoint for invalid session', async () => {
  const details = await createTemplateOrderAndUser();
  
  // Logout to invalidate session
  await userLogout(details.session.session);

  const event = { 
    ...mockEvent,
    headers: {
      session: 'invalid_session_string'
    },
    pathParameters: {
      ...mockEvent.pathParameters,
      orderId: details.order.orderId,
    },
    body: JSON.stringify({ reason: 'I have no reason' })
  } as unknown as APIGatewayProxyEvent;

  const res = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(401);
  const body = JSON.parse(res.body);
  expect(body).toHaveProperty('error');
});

test('Test endpoint for order not belonging to user', async () => {
  const details = await createTemplateOrderAndUser();
  const otherUser = await userRegister('Jane', 'Smith', 
    `jane${testIdx}@gmail.com`, '0412345678', 'password321') as SessionId;

  const event = { 
    ...mockEvent,
    headers: {
      session: otherUser.session
    },
    pathParameters: {
      ...mockEvent.pathParameters,
      orderId: details.order.orderId,
    },
    body: JSON.stringify({ reason: 'I have no reason' })
  } as unknown as APIGatewayProxyEvent;

  const res = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(401);
});

test('Test 500 error for generic error like db fail', async () => {
  const details = await createTemplateOrderAndUser();

  const event = { 
    ...mockEvent,
    headers: {
      session: details.session.session
    },
    pathParameters: {
      ...mockEvent.pathParameters,
      orderId: details.order.orderId,
    },
    body: JSON.stringify({ reason: 'I have no reason' })
  } as unknown as APIGatewayProxyEvent;

  // Spy on the module to force an error
  const spy = jest.spyOn(orderModule, 'cancelOrder').mockImplementation(() => {
    throw new Error('Cannot access database');
  });

  const res = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(500);
  const body = JSON.parse(res.body);
  expect(body).toHaveProperty('error');

  spy.mockRestore();
});