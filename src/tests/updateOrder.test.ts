import { updateOrder } from '../order';
import { updateOrderHandler } from '../handlers/updateOrder';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as orderModule from '../order';
import * as dataStore from '../dataStore';
import * as userHelper from '../userHelper';
import { InvalidOrderId, UnauthorisedError } from '../throwError';
import { Order } from '../interfaces';

// Mock the dependencies
jest.mock('../userHelper');
jest.mock('../dataStore');

// mock the storage bucket
jest.mock('../generateUBL', () => ({
  createOrderUBLXML: jest.fn().mockResolvedValue(null),
  getOrderUBLXML: jest.fn().mockResolvedValue('mock-url')
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedDataStore = dataStore as jest.Mocked<typeof dataStore>;

// Define the mock event locally to fix the missing JSON issue
const mockEvent: Partial<APIGatewayProxyEvent> = {
  headers: {},
  pathParameters: {},
  body: ''
};

let testIdx = 0;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});


// Helper to create mock data for updateOrder tests

async function createTemplateOrderAndUser() {
  testIdx++;
  const mockSession = `session-${testIdx}`;
  const mockUserId = testIdx;
  const mockOrgId = testIdx * 10;
  const mockOrderId = `order-${testIdx}`;

  mockedUserHelper.getUserIdFromSession.mockReturnValue(mockUserId);
  mockedDataStore.getOrgByUserId.mockResolvedValue({ 
    data: { orgId: mockOrgId }, error: null 
  } as never);

  // mock user from supa
  mockedDataStore.getUserByIdSupa.mockResolvedValue({
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    telephone: '0412345678'
  } as never);

  const mockOrder: Partial<Order> = { 
    orderId: mockOrderId,
    status: 'OPEN',
    buyerOrgID: mockOrgId,
    deliveries: [{
      startDate: 1700000000,
      endDate: 1700086400,
      addresses: { street: '123 Kingsford' }
    }],
    order_lines: [] as never
  };

  mockedDataStore.getOrderByIdSupa.mockResolvedValue(mockOrder as Order);

  return { 
    session: { session: mockSession }, 
    orderId: mockOrderId,
    mockOrder,
    reqDeliveryPeriod: { startDateTime: 1700000000, endDateTime: 1700086400 }
  };
}

describe('Backend logic test for updateOrder', () => {
  test('successfully update order delivery address', async () => {
    const details = await createTemplateOrderAndUser();
    const newAddress = '456 Kensington Street';

    mockedDataStore.updateOrderSupa.mockResolvedValue({} as never);

    // simulate the database returning the new data after update
    const updatedOrder = { 
      ...details.mockOrder, 
      status: 'processed',
      deliveries: [{ 
        ...details.mockOrder.deliveries![0], 
        addresses: { street: newAddress },
        startDate: details.reqDeliveryPeriod.startDateTime
      }]
    };
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(updatedOrder as Order);

    await updateOrder(
      details.session.session,
      details.orderId,
      newAddress,
      details.reqDeliveryPeriod,
      'processed'
    );

    const result = await dataStore.getOrderByIdSupa(details.orderId) as Order;
    
    expect(result.status).toStrictEqual('processed');
    expect(result.deliveries[0].addresses?.street).toStrictEqual(newAddress);
    // check updateOrderSupa called with correct params 
    expect(mockedDataStore.updateOrderSupa).toHaveBeenCalledWith(
      details.orderId, 
      newAddress, 
      details.reqDeliveryPeriod, 
      'processed'
    );
  });

  test('Invalid Session', async () => {
    const details = await createTemplateOrderAndUser();
    mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
      throw new UnauthorisedError('Invalid Session');
    });

    await expect(
      updateOrder('invalid_session_123', details.orderId, 
        'Address', details.reqDeliveryPeriod, 'processed')
    ).rejects.toThrow(UnauthorisedError);
  });

  test('Order does not exist', async () => {
    const details = await createTemplateOrderAndUser();
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);

    await expect(
      updateOrder(details.session.session, 'non_existent_id', 
        'Address', details.reqDeliveryPeriod, 'processed')
    ).rejects.toThrow(InvalidOrderId);
  });
});

describe('Lambda function for updateOrderHandler', () => {
  test('successfully updates an order', async () => {
    const details = await createTemplateOrderAndUser();

    const event = {
      ...mockEvent,
      pathParameters: { orderId: details.orderId },
      headers: { session: details.session.session },
      body: JSON.stringify({
        deliveryAddress: '789 New Kensington Road',
        reqDeliveryPeriod: details.reqDeliveryPeriod,
        status: 'delivered'
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await updateOrderHandler(event);

    expect(response?.statusCode).toStrictEqual(200);
    expect(JSON.parse(response?.body ?? '{}')).toBeDefined();
  });

  test('session header missing', async () => {
    const event = {
      ...mockEvent,
      pathParameters: { orderId: 'order-123' },
      headers: {}, 
      body: JSON.stringify({ status: 'cancelled' })
    } as unknown as APIGatewayProxyEvent;

    const response = await updateOrderHandler(event);

    expect(response?.statusCode).toStrictEqual(401);
    expect(JSON.parse(response?.body ?? '{}')).toHaveProperty('error');
  });

  test('Order ID missing', async () => {
    const details = await createTemplateOrderAndUser();

    const event = {
      ...mockEvent,
      pathParameters: {}, 
      headers: { session: details.session.session },
      body: JSON.stringify({ status: 'processed' })
    } as unknown as APIGatewayProxyEvent;

    const response = await updateOrderHandler(event);

    expect(response?.statusCode).toStrictEqual(400);
  });

  test('Invalid Request Period (end before start)', async () => {
    const details = await createTemplateOrderAndUser();

    const event = {
      ...mockEvent,
      pathParameters: { orderId: details.orderId },
      headers: { session: details.session.session },
      body: JSON.stringify({
        reqDeliveryPeriod: {
          startDateTime: 2000000000,
          endDateTime: 1000000000 
        }
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await updateOrderHandler(event);

    expect(response?.statusCode).toStrictEqual(400);
    expect(JSON.parse(response?.body ?? '{}')).toHaveProperty('error');
  });

  test('Generic 500 error mapping', async () => {
    const details = await createTemplateOrderAndUser();
    
    // spy matches the handler's error handling expectation
    const spy = jest.spyOn(orderModule, 'updateOrder').mockImplementation(() => {
      throw new Error('Unexpected DB Crash');
    });

    const event = {
      ...mockEvent,
      pathParameters: { orderId: details.orderId },
      headers: { session: details.session.session },
      body: JSON.stringify({ status: 'processed' })
    } as unknown as APIGatewayProxyEvent;

    const response = await updateOrderHandler(event);
    
    // using ?.statusCode and explicitly checking type to satisfy TS
    expect(response?.statusCode).toStrictEqual(500);
    expect(JSON.parse(response?.body ?? '{}')).toHaveProperty('error');

    spy.mockRestore();
  });
});