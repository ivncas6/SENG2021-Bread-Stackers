import { cancelOrder } from '../order';
import { cancelOrderHandler } from '../handlers/cancelOrder';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import mockEvent from './mocks/cancelOrderMock.json';
import * as orderModule from '../order';
import { InvalidInput, UnauthorisedError } from '../throwError';
import * as userHelper from '../userHelper';
import * as dataStore from '../dataStore';
import { Order } from '../interfaces';

// jest mocks
jest.mock('../userHelper');
jest.mock('../dataStore');

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedDataStore = dataStore as jest.Mocked<typeof dataStore>;

let testIdx = 0;

beforeEach(() => {
  jest.clearAllMocks();
});

// fake data
async function createTemplateOrderAndUser() {
  testIdx++;
  const mockSession = `valid-session-${testIdx}`;
  const mockUserId = testIdx;
  const mockOrgId = testIdx * 10;
  const mockOrderId = `order-uuid-${testIdx}`;

  // the default successful mock responses for this user/order
  mockedUserHelper.getUserIdFromSession.mockReturnValue(mockUserId);
  
  // 'as never' skips strict Supabase response linting
  mockedDataStore.getOrgByUserId.mockResolvedValue({ 
    data: { orgId: mockOrgId }, error: null 
  } as never);
  
  // Partial<Order> cuz Order fixes the missing fields lint error
  const mockOrder: Partial<Order> = { buyerOrgID: mockOrgId, orderId: mockOrderId };
  mockedDataStore.getOrderByIdSupa.mockResolvedValue(mockOrder as Order);

  return { 
    session: { session: mockSession }, 
    order: { orderId: mockOrderId },
    userId: mockUserId,
    orgId: mockOrgId
  };
}

// backend

test('cancel a single order', async () => {
  const details = await createTemplateOrderAndUser();

  const res = await cancelOrder(details.order.orderId, 'reason here', details.session.session);
  
  expect(res).toStrictEqual({ reason: 'reason here' });
  // verify the delete function was called correctly instead of checking db
  expect(mockedDataStore.deleteOrderSupa).toHaveBeenCalledWith(details.order.orderId);
});

test('Invalid orderId on backend', async () => {
  const details = await createTemplateOrderAndUser();
  
  // override the happy path to simulate a missing order
  mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);

  await expect(
    cancelOrder('fake-uuid', 'reason here', details.session.session)
  ).rejects.toThrow(InvalidInput);
});

test('Invalid session on backend', async () => {
  const details = await createTemplateOrderAndUser();
  
  // override to simulate an invalid token throwing an error
  mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
    throw new UnauthorisedError('Invalid session');
  });

  await expect(
    cancelOrder(details.order.orderId, 'reason here', 'bad-session-123')
  ).rejects.toThrow(UnauthorisedError);
});

test('Wrong user session (Order belongs to someone else)', async () => {
  const details = await createTemplateOrderAndUser();
  
  // override the order mock to belong to a different Org ID
  const wrongOrder: Partial<Order> = { buyerOrgID: 9999, orderId: details.order.orderId };
  mockedDataStore.getOrderByIdSupa.mockResolvedValue(wrongOrder as Order);

  await expect(
    cancelOrder(details.order.orderId, 'reason here', details.session.session)
  ).rejects.toThrow(UnauthorisedError);
});

// AWS lambda

test('Test endpoint for order cancellation', async () => {
  const details = await createTemplateOrderAndUser();
  const finalReason = 'I have no reason';
  
  const event = { 
    ...mockEvent,
    headers: { session: details.session.session },
    pathParameters: { ...mockEvent.pathParameters, orderId: details.order.orderId },
    body: JSON.stringify({ reason: finalReason })
  } as unknown as APIGatewayProxyEvent;

  const res: APIGatewayProxyResult = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(200);
  expect(JSON.parse(res.body)).toStrictEqual({ reason: finalReason });
});

test('Test endpoint for invalid orderId', async () => {
  const details = await createTemplateOrderAndUser();
  mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);

  const event = { 
    ...mockEvent,
    headers: { session: details.session.session },
    pathParameters: { ...mockEvent.pathParameters, orderId: 'fake-id' },
    body: JSON.stringify({ reason: 'testing' })
  } as unknown as APIGatewayProxyEvent;

  const res: APIGatewayProxyResult = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(400);
  expect(JSON.parse(res.body)).toHaveProperty('error');
});

test('Test endpoint for invalid session', async () => {
  const details = await createTemplateOrderAndUser();
  
  mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
    throw new UnauthorisedError('Invalid session');
  });

  const event = { 
    ...mockEvent,
    headers: { session: 'invalid_session_string' },
    pathParameters: { ...mockEvent.pathParameters, orderId: details.order.orderId },
    body: JSON.stringify({ reason: 'testing' })
  } as unknown as APIGatewayProxyEvent;

  const res: APIGatewayProxyResult = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(401);
  expect(JSON.parse(res.body)).toHaveProperty('error');
});

test('Test endpoint for order not belonging to user', async () => {
  const details = await createTemplateOrderAndUser();
  
  const wrongOrder: Partial<Order> = { buyerOrgID: 9999, orderId: details.order.orderId };
  mockedDataStore.getOrderByIdSupa.mockResolvedValue(wrongOrder as Order);

  const event = { 
    ...mockEvent,
    headers: { session: details.session.session },
    pathParameters: { ...mockEvent.pathParameters, orderId: details.order.orderId },
    body: JSON.stringify({ reason: 'testing' })
  } as unknown as APIGatewayProxyEvent;

  const res: APIGatewayProxyResult = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(401);
});

test('Test 500 error for generic error like db fail', async () => {
  const details = await createTemplateOrderAndUser();

  const event = { 
    ...mockEvent,
    headers: { session: details.session.session },
    pathParameters: { ...mockEvent.pathParameters, orderId: details.order.orderId },
    body: JSON.stringify({ reason: 'testing' })
  } as unknown as APIGatewayProxyEvent;

  const spy = jest.spyOn(orderModule, 'cancelOrder').mockImplementation(() => {
    throw new Error('Cannot access database');
  });

  const res: APIGatewayProxyResult = await cancelOrderHandler(event);

  expect(res.statusCode).toStrictEqual(500);
  expect(JSON.parse(res.body)).toHaveProperty('error');

  spy.mockRestore();
});