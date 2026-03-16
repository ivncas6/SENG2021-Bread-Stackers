import { listOrders } from '../order';
import { listOrderHandler } from '../handlers/listOrder';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UnauthorisedError } from '../throwError';
import { Order } from '../interfaces';

// mocking deps
import * as userHelper from '../userHelper';
import * as dataStore from '../dataStore';
import { supabase } from '../supabase';
import { SupabaseMock } from '../interfaces';

jest.mock('../userHelper');
jest.mock('../dataStore');
jest.mock('../supabase');

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedDataStore = dataStore as jest.Mocked<typeof dataStore>;
const mockedSupabase = supabase as unknown as SupabaseMock;

const mockSupabaseEq = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  // mock chain -> supabase.from().select().eq()
  mockedSupabase.from.mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: mockSupabaseEq
    })
  });
});

async function createOrderAndUser() {
  const mockSession = 'valid-session-123';
  const mockOrgId = 10;
  const mockOrderId = 'order-abc-123';
  const currency = 'AUD';

  // keep these
  mockedUserHelper.getUserIdFromSession.mockReturnValue(1);
  mockedDataStore.getOrgByUserId.mockResolvedValue(
    { data: { orgId: mockOrgId }, error: null } as never);

  const mockOrder: Partial<Order> = {
    orderId: mockOrderId,
    status: 'OPEN',
    issuedDate: '2025-03-16',
    currency: currency,
    finalPrice: 522.5,
  };

  return { 
    session: { session: mockSession }, 
    order: { orderId: mockOrderId }, 
    currency,
    mockOrder 
  };
}

describe('listOrders tests', () => {
  test('successfully returns empty list when user has no orders', async () => {
    await createOrderAndUser();
    mockSupabaseEq.mockResolvedValueOnce({ data: [], error: null });

    const result = await listOrders('valid-session-123');
    expect(result).toEqual({ orders: [] });
  });

  test('successfully returns a single order belonging to the user', async () => {
    const { session, order, currency, mockOrder } = await createOrderAndUser();
    mockSupabaseEq.mockResolvedValueOnce({ data: [mockOrder], error: null });

    const result = await listOrders(session.session);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toEqual({
      orderId: order.orderId,
      status: expect.any(String),
      issuedDate: expect.any(String),
      currency: currency,
      finalPrice: 522.5,
    });
  });

  test('successfully returns multiple orders belonging to the user', async () => {
    const { session, mockOrder } = await createOrderAndUser();
    mockSupabaseEq.mockResolvedValueOnce({ data: [mockOrder, mockOrder], error: null });

    const result = await listOrders(session.session);
    expect(result.orders).toHaveLength(2);
  });

  test('throws UnauthorisedError on invalid session', async () => {
    mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
      throw new UnauthorisedError('Invalid session');
    });

    await expect(listOrders('invalid-session-string')).rejects.toThrow(UnauthorisedError);
  });
});

describe('Lambda handler tests for listOrders', () => {
  test('successfully returns 200 with empty orders list', async () => {
    await createOrderAndUser();
    mockSupabaseEq.mockResolvedValueOnce({ data: [], error: null });

    const event = { headers: { session: 'valid-sess' } } as unknown as APIGatewayProxyEvent;
    const response: APIGatewayProxyResult = await listOrderHandler(event);

    expect(response.statusCode).toEqual(200);
    expect(JSON.parse(response.body)).toEqual({ orders: [] });
  });

  test('successfully returns 200 with user orders', async () => {
    const { session, order, mockOrder } = await createOrderAndUser();
    mockSupabaseEq.mockResolvedValueOnce({ data: [mockOrder], error: null });

    const event = { headers: { session: session.session } } as unknown as APIGatewayProxyEvent;
    const response: APIGatewayProxyResult = await listOrderHandler(event);

    expect(response.statusCode).toEqual(200);
    expect(JSON.parse(response.body).orders[0].orderId).toEqual(order.orderId);
  });

  test('returns 401 when session is invalid', async () => {
    mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
      throw new UnauthorisedError('Bad Session');
    });

    const event = { headers: { session: 'wrong' } } as unknown as APIGatewayProxyEvent;
    const response: APIGatewayProxyResult = await listOrderHandler(event);
    expect(response.statusCode).toStrictEqual(401);
  });
});