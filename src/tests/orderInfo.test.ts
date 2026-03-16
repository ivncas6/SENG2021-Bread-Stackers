import { getOrderInfo } from '../order';
import { getOrderInfoHandler } from '../handlers/orderInfo';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as orderModule from '../order';
import { InvalidOrderId, UnauthorisedError } from '../throwError';
import * as userHelper from '../userHelper';
import * as dataStore from '../dataStore';
import { Order } from '../interfaces';

const mockEvent: Partial<APIGatewayProxyEvent> = {
  headers: {},
  pathParameters: {},
  body: ''
};

// jest mocks
jest.mock('../userHelper');
jest.mock('../dataStore');

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedDataStore = dataStore as jest.Mocked<typeof dataStore>;

let testIdx = 0;

beforeEach(() => {
  jest.clearAllMocks();
});

// helper for mock data
async function createTemplateOrderAndUser() {
  testIdx++;
  const mockSession = `valid-session-${testIdx}`;
  const mockUserId = testIdx;
  const mockOrgId = testIdx * 10;
  const mockOrderId = `order-uuid-${testIdx}`;

  mockedUserHelper.getUserIdFromSession.mockReturnValue(mockUserId);

  mockedDataStore.getOrgByUserId.mockResolvedValue({ 
    data: { orgId: mockOrgId }, error: null 
  } as never);

  const mockOrder: Partial<Order> = { 
    orderId: mockOrderId,
    status: 'OPEN',
    issuedDate: '2026-03-16',
    issuedTime: '10:00:00 AM',
    currency: 'AUD',
    taxExclusive: 475,
    taxInclusive: 522.5,
    finalPrice: 522.5,
    buyerOrgID: mockOrgId,
    deliveries: [{
      startDate: 1672531200,
      endDate: 1672617600,
      addresses: { street: '123 Street Name, Kingsford' }
    }],
    organisations: {
      contacts: {
        firstName: 'John',
        lastName: 'Smith',
        telephone: '0412345678',
        email: 'johnsmith@gmail.com'
      }
    },
    order_lines: [
      {
        quantity: 15,
        items: { name: 'onion', description: 'a purple vegetable', price: 5 }
      },
      {
        quantity: 100,
        items: { name: 'tomato', description: 'A red fruit', price: 4 }
      }
    ] as never 
  };

  mockedDataStore.getOrderByIdSupa.mockResolvedValue(mockOrder as Order);

  return { 
    session: { session: mockSession }, 
    order: mockOrder,
    userId: mockUserId,
    orgId: mockOrgId
  };
}

describe('getOrderInfo tests', () => {
  test('successfully returns the order info', async () => {
    const details = await createTemplateOrderAndUser();

    const res = await getOrderInfo(details.session.session, details.order.orderId!);
    
    expect(res).toStrictEqual({
      orderId: details.order.orderId,
      issuedDate: '2026-03-16',
      issuedTime: '10:00:00 AM',
      status: 'OPEN',
      currency: 'AUD',
      finalPrice: 522.5,
      address: '123 Street Name, Kingsford',
      deliveryDetails: {
        startDateTime: 1672531200,
        endDateTime: 1672617600
      },
      userDetails: {
        firstName: 'John',
        lastName: 'Smith',
        telephone: '0412345678',
        email: 'johnsmith@gmail.com'
      },
      items: [
        { name: 'onion', description: 'a purple vegetable', unitPrice: 5, quantity: 15 },
        { name: 'tomato', description: 'A red fruit', unitPrice: 4, quantity: 100 }
      ],
      taxExclusive: 475,
      taxInclusive: 522.5,
    });
  });

  test('invalid orderid error', async () => {
    const details = await createTemplateOrderAndUser();
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);

    await expect(getOrderInfo(details.session.session, details.order.orderId! + '123'))
      .rejects.toThrow(InvalidOrderId);
  });

  test('invalid session error', async () => {
    mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
      throw new UnauthorisedError('Invalid session');
    });

    await expect(getOrderInfo('bad-session', 'any-id'))
      .rejects.toThrow(UnauthorisedError);
  });

  test('order does not belong to user', async () => {
    const details = await createTemplateOrderAndUser();
    
    // order belongs to different org
    const wrongOrder: Partial<Order> = { ...details.order, buyerOrgID: 9999 };
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(wrongOrder as Order);

    await expect(getOrderInfo(details.session.session, details.order.orderId!))
      .rejects.toThrow(InvalidOrderId);
  });

  test('User has no associated organization', async () => {
    const details = await createTemplateOrderAndUser();
    mockedDataStore.getOrgByUserId.mockResolvedValue({ data: null, error: null } as never);

    await expect(getOrderInfo(details.session.session, details.order.orderId!))
      .rejects.toThrow(UnauthorisedError);
  });
});

describe('Lambda function tests for getOrderInfo', () => {
  test('successfully returns order info via handler', async () => {
    const details = await createTemplateOrderAndUser();
    
    const event = { 
      ...mockEvent,
      headers: { session: details.session.session },
      pathParameters: { orderId: details.order.orderId }
    } as unknown as APIGatewayProxyEvent;

    const response: APIGatewayProxyResult = await getOrderInfoHandler(event);
    
    expect(response.statusCode).toEqual(200);
    const body = JSON.parse(response.body);
    expect(body.orderId).toBe(details.order.orderId);
    expect(body.items).toHaveLength(2);
  });

  test('orderId does not exist (Lambda)', async () => {
    const details = await createTemplateOrderAndUser();
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);

    const event = { 
      ...mockEvent,
      headers: { session: details.session.session },
      pathParameters: { orderId: 'fake-id' }
    } as unknown as APIGatewayProxyEvent;

    const response: APIGatewayProxyResult = await getOrderInfoHandler(event);
    expect(response.statusCode).toStrictEqual(400);
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

  test('invalid session provided (Lambda)', async () => {
    mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
      throw new UnauthorisedError('Invalid session');
    });

    const event = { 
      ...mockEvent,
      headers: { session: 'invalid' },
      pathParameters: { orderId: 'any' }
    } as unknown as APIGatewayProxyEvent;

    const response: APIGatewayProxyResult = await getOrderInfoHandler(event);
    expect(response.statusCode).toStrictEqual(401);
  });

  test('order does not belong to the user (Lambda)', async () => {
    const details = await createTemplateOrderAndUser();
    const wrongOrder: Partial<Order> = { ...details.order, buyerOrgID: 9999 };
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(wrongOrder as Order);

    const event = { 
      ...mockEvent,
      headers: { session: details.session.session },
      pathParameters: { orderId: details.order.orderId }
    } as unknown as APIGatewayProxyEvent;

    const response: APIGatewayProxyResult = await getOrderInfoHandler(event);
    expect(response.statusCode).toStrictEqual(400);
  });

  test('Test 500 error for generic database failure', async () => {
    const details = await createTemplateOrderAndUser();
    const event = { 
      ...mockEvent,
      headers: { session: details.session.session },
      pathParameters: { orderId: details.order.orderId }
    } as unknown as APIGatewayProxyEvent;

    const spy = jest.spyOn(orderModule, 'getOrderInfo').mockImplementation(() => {
      throw new Error('Database connection lost');
    });

    const response: APIGatewayProxyResult = await getOrderInfoHandler(event);
    expect(response.statusCode).toStrictEqual(500);
    expect(JSON.parse(response.body)).toHaveProperty('error');

    spy.mockRestore();
  });
});