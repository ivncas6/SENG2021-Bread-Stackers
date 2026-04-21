import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  createOrder, cancelOrder, getOrderInfo,
  listOrders, updateOrder, getOrderUBL,
} from '../orderV2';
import { createOrderHandler } from '../handlersV2/createOrder';
import { cancelOrderHandler } from '../handlersV2/cancelOrder';
import { getOrderInfoHandler } from '../handlersV2/orderInfo';
import { listOrderHandler } from '../handlersV2/listOrder';
import { updateOrderHandler } from '../handlersV2/updateOrder';
import { generateUBLHandler } from '../handlersV2/generateUBL';
import * as userHelper from '../userHelper';
import * as orgPermissions from '../orgPermissions';
import * as dataStore from '../dataStore';
import * as generateUBL from '../generateUBL';
import { supabase } from '../supabase';
import { UnauthorisedError, InvalidOrderId, 
  InvalidRequestPeriod, InvalidInput } from '../throwError';
import { Order } from '../interfaces';
import { SupabaseMock } from '../interfaces';

jest.mock('../userHelper');
jest.mock('../orgPermissions');
jest.mock('../dataStore');
jest.mock('../generateUBL');
jest.mock('../supabase');

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedPerms = orgPermissions as jest.Mocked<typeof orgPermissions>;
const mockedDataStore = dataStore as jest.Mocked<typeof dataStore>;
const mockedUBL = generateUBL as jest.Mocked<typeof generateUBL>;
const mockedSupabase = supabase as unknown as SupabaseMock;


// Shared test fixtures

const SESSION = 'valid-session';
const USER_ID = 1;
const ORG_ID = 10;
const ORDER_ID = '550e8400-e29b-41d4-a716-446655440000';
const ADDRESS_ID = 5;
const DELIVERY_PERIOD = { startDateTime: 1_000_000, endDateTime: 2_000_000 };
const ITEMS = [{ name: 'Widget', description: 'A widget', unitPrice: 10, quantity: 2 }];

const MOCK_ORDER: Partial<Order> = {
  orderId: ORDER_ID,
  buyerOrgID: ORG_ID,
  status: 'OPEN',
  issuedDate: '2026-01-01',
  issuedTime: '12:00:00',
  currency: 'AUD',
  taxExclusive: 20,
  taxInclusive: 22,
  finalPrice: 22,
  deliveries: [{
    deliveryAddressID: ADDRESS_ID,
    startDate: '1000000',
    endDate: '2000000',
    addresses: { street: '1 Test St' },
  }],
  organisations: { contacts: 
    { firstName: 'A', lastName: 'B', telephone: '0400000000', email: 'a@b.com' } 
  },
  order_lines: [{ quantity: 2, items: 
    { name: 'Widget', description: 'A widget', price: 10 } }] as never,
};

function setupHappyPath() {
  mockedUserHelper.getUserIdFromSession.mockResolvedValue(USER_ID);
  mockedPerms.requireOrgMember.mockResolvedValue('MEMBER');
  mockedPerms.requireOrgAdminOrOwner.mockResolvedValue(undefined);
  mockedPerms.requireOrgOwner.mockResolvedValue(undefined);
  mockedDataStore.getOrderByIdSupa.mockResolvedValue(MOCK_ORDER as Order);
  mockedDataStore.createOrderSupaPushV2.mockResolvedValue(undefined);
  mockedDataStore.updateOrderSupaV2.mockResolvedValue(undefined);
  mockedDataStore.deleteOrderSupa.mockResolvedValue(undefined);
  mockedUBL.uploadUBLForOrder.mockResolvedValue(null);
  mockedUBL.getSignedUBLUrl.mockResolvedValue('https://signed-url.example.com');
}

beforeEach(() => {
  jest.clearAllMocks();
  setupHappyPath();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});


// createOrder

describe('createOrder (V2 business logic)', () => {
  test('returns orderId on success', async () => {
    const result = await createOrder(ORG_ID, 'AUD', SESSION, ADDRESS_ID, DELIVERY_PERIOD, ITEMS);
    expect(result).toEqual({ orderId: expect.any(String) });
    expect(mockedPerms.requireOrgMember).toHaveBeenCalledWith(USER_ID, ORG_ID);
    expect(mockedDataStore.createOrderSupaPushV2).toHaveBeenCalled();
    expect(mockedUBL.uploadUBLForOrder).toHaveBeenCalled();
  });

  test('throws UnauthorisedError when user is not a member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    await expect(createOrder(ORG_ID, 'AUD', SESSION, ADDRESS_ID, DELIVERY_PERIOD, ITEMS))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidRequestPeriod when end <= start', async () => {
    const badPeriod = { startDateTime: 2_000_000, endDateTime: 1_000_000 };
    await expect(createOrder(ORG_ID, 'AUD', SESSION, ADDRESS_ID, badPeriod, ITEMS))
      .rejects.toThrow(InvalidRequestPeriod);
  });

  test('throws when deliveryAddressId is not a positive integer', async () => {
    await expect(createOrder(ORG_ID, 'AUD', SESSION, -1, DELIVERY_PERIOD, ITEMS))
      .rejects.toThrow('positive integer');
    await expect(createOrder(ORG_ID, 'AUD', SESSION, 0, DELIVERY_PERIOD, ITEMS))
      .rejects.toThrow('positive integer');
  });
});


// cancelOrder

describe('cancelOrder (V2 business logic)', () => {
  test('returns reason on success', async () => {
    const result = await cancelOrder(ORG_ID, ORDER_ID, 'Changed mind', SESSION);
    expect(result).toEqual({ reason: 'Changed mind' });
    expect(mockedDataStore.deleteOrderSupa).toHaveBeenCalledWith(ORDER_ID);
  });

  test('throws UnauthorisedError when not a member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    await expect(cancelOrder(ORG_ID, ORDER_ID, 'reason', SESSION))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws UnauthorisedError when order belongs to different org', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue({ ...MOCK_ORDER, buyerOrgID: 999 } as Order);
    await expect(cancelOrder(ORG_ID, ORDER_ID, 'reason', SESSION))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidOrderId when order not found', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);
    await expect(cancelOrder(ORG_ID, ORDER_ID, 'reason', SESSION))
      .rejects.toThrow(InvalidOrderId);
  });
});


// getOrderInfo

describe('getOrderInfo (V2 business logic)', () => {
  test('returns full order details on success', async () => {
    const result = await getOrderInfo(ORG_ID, SESSION, ORDER_ID);
    expect(result.orderId).toBe(ORDER_ID);
    expect(result.status).toBe('OPEN');
    expect(result.items).toHaveLength(1);
    expect(result.address).toBe('1 Test St');
    expect(result.deliveryAddressId).toBe(ADDRESS_ID);
    expect(result.userDetails.firstName).toBe('A');
  });

  test('throws UnauthorisedError when not a member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    await expect(getOrderInfo(ORG_ID, SESSION, ORDER_ID))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws when order belongs to different org', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(
      { ...MOCK_ORDER, buyerOrgID: 999 } as Order
    );
    await expect(getOrderInfo(ORG_ID, SESSION, ORDER_ID))
      .rejects.toThrow(UnauthorisedError);
  });
});


// listOrders

describe('listOrders (V2 business logic)', () => {
  function mockSupabaseList(orders: unknown[]) {
    const eqMock = jest.fn().mockResolvedValue({ data: orders, error: null });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
    mockedSupabase.from.mockReturnValue({ select: selectMock } as never);
  }

  test('returns orders for the org', async () => {
    mockSupabaseList([MOCK_ORDER]);
    const result = await listOrders(ORG_ID, SESSION);
    expect(result.orders).toHaveLength(1);
  });

  test('returns empty list when org has no orders', async () => {
    mockSupabaseList([]);
    const result = await listOrders(ORG_ID, SESSION);
    expect(result.orders).toHaveLength(0);
  });

  test('throws UnauthorisedError when not a member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    await expect(listOrders(ORG_ID, SESSION)).rejects.toThrow(UnauthorisedError);
  });
});


// updateOrder

describe('updateOrder (V2 business logic)', () => {
  test('returns empty object on success', async () => {
    const result = await updateOrder(ORG_ID, SESSION, ORDER_ID, ADDRESS_ID,
      DELIVERY_PERIOD, 'UPDATED');
    expect(result).toEqual({});
    expect(mockedDataStore.updateOrderSupaV2).toHaveBeenCalledWith(
      ORDER_ID, ADDRESS_ID, DELIVERY_PERIOD, 'UPDATED'
    );
    expect(mockedUBL.uploadUBLForOrder).toHaveBeenCalled();
  });

  test('throws when deliveryAddressId is invalid', async () => {
    await expect(updateOrder(ORG_ID, SESSION, ORDER_ID, 0, DELIVERY_PERIOD, 'UPDATED'))
      .rejects.toThrow('positive integer');
  });

  test('throws InvalidRequestPeriod when end <= start', async () => {
    const badPeriod = { startDateTime: 5, endDateTime: 5 };
    await expect(updateOrder(ORG_ID, SESSION, ORDER_ID, ADDRESS_ID, badPeriod, 'UPDATED'))
      .rejects.toThrow(InvalidRequestPeriod);
  });

  test('throws when not a member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    await expect(updateOrder(ORG_ID, SESSION, ORDER_ID, ADDRESS_ID, DELIVERY_PERIOD, 'UPDATED'))
      .rejects.toThrow(UnauthorisedError);
  });
});


// getOrderUBL

describe('getOrderUBL (V2 business logic)', () => {
  test('returns signed URL on success', async () => {
    const result = await getOrderUBL(ORG_ID, SESSION, ORDER_ID);
    expect(result).toBe('https://signed-url.example.com');
    expect(mockedUBL.getSignedUBLUrl).toHaveBeenCalledWith(ORDER_ID);
  });

  test('throws when not a member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    await expect(getOrderUBL(ORG_ID, SESSION, ORDER_ID)).rejects.toThrow(UnauthorisedError);
  });
});


// Lambda handlers

function makeEvent(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    headers: { session: SESSION },
    pathParameters: { orgId: String(ORG_ID), orderId: ORDER_ID },
    body: null,
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

describe('Lambda: createOrderHandler (V2)', () => {
  test('200 on success', async () => {
    const event = makeEvent({
      pathParameters: { orgId: String(ORG_ID) },
      body: JSON.stringify({
        currency: 'AUD',
        deliveryAddressId: ADDRESS_ID,
        reqDeliveryPeriod: DELIVERY_PERIOD,
        items: ITEMS,
      }),
    });
    const res = await createOrderHandler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('orderId');
  });

  test('401 when session missing', async () => {
    const res = await createOrderHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 when orgId invalid', async () => {
    const res = await createOrderHandler(makeEvent({ pathParameters: { orgId: 'bad' } }));
    expect(res.statusCode).toBe(400);
  });

  test('400 when deliveryAddressId is missing or not a number', async () => {
    const event = makeEvent({
      pathParameters: { orgId: String(ORG_ID) },
      body: JSON.stringify({
        currency: 'AUD',
        deliveryAddressId: 'not-a-number',
        reqDeliveryPeriod: DELIVERY_PERIOD,
        items: ITEMS,
      }),
    });
    const res = await createOrderHandler(event);
    expect(res.statusCode).toBe(400);
  });

  test('401 when not a member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    const event = makeEvent({
      pathParameters: { orgId: String(ORG_ID) },
      body: JSON.stringify({
        currency: 'AUD', deliveryAddressId: ADDRESS_ID,
        reqDeliveryPeriod: DELIVERY_PERIOD, items: ITEMS,
      }),
    });
    const res = await createOrderHandler(event);
    expect(res.statusCode).toBe(401);
  });
});

describe('Lambda: cancelOrderHandler (V2)', () => {
  test('200 on success', async () => {
    const event = makeEvent({ body: JSON.stringify({ reason: 'Changed mind' }) });
    const res = await cancelOrderHandler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ reason: 'Changed mind' });
  });

  test('401 when session missing', async () => {
    const res = await cancelOrderHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 when order not found', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);
    const res = await cancelOrderHandler(makeEvent({ body: JSON.stringify({ reason: 'x' }) }));
    expect(res.statusCode).toBe(400);
  });
});

describe('Lambda: getOrderInfoHandler (V2)', () => {
  test('200 on success with deliveryAddressId in response', async () => {
    const res = await getOrderInfoHandler(makeEvent({}));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('orderId', ORDER_ID);
    expect(body).toHaveProperty('deliveryAddressId', ADDRESS_ID);
  });

  test('401 when session missing', async () => {
    const res = await getOrderInfoHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 when order not found', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);
    const res = await getOrderInfoHandler(makeEvent({}));
    expect(res.statusCode).toBe(400);
  });
});

describe('Lambda: listOrderHandler (V2)', () => {
  function mockList(orders: unknown[]) {
    const eqMock = jest.fn().mockResolvedValue({ data: orders, error: null });
    mockedSupabase.from.mockReturnValue({ select: jest.fn()
      .mockReturnValue({ eq: eqMock }) } as never);
  }

  test('200 with order list', async () => {
    mockList([MOCK_ORDER]);
    const res = await listOrderHandler(makeEvent({ pathParameters: { orgId: String(ORG_ID) } }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).orders).toHaveLength(1);
  });

  test('401 when session missing', async () => {
    const res = await listOrderHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });
});

describe('Lambda: updateOrderHandler (V2)', () => {
  test('200 on success', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        deliveryAddressId: ADDRESS_ID,
        reqDeliveryPeriod: DELIVERY_PERIOD,
        status: 'UPDATED',
      }),
    });
    const res = await updateOrderHandler(event);
    expect(res.statusCode).toBe(200);
  });

  test('401 when session missing', async () => {
    const res = await updateOrderHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 when deliveryAddressId is missing', async () => {
    const event = makeEvent({
      body: JSON.stringify({ reqDeliveryPeriod: DELIVERY_PERIOD, status: 'X' }),
    });
    const res = await updateOrderHandler(event);
    expect(res.statusCode).toBe(400);
  });

  test('400 on invalid delivery period', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        deliveryAddressId: ADDRESS_ID,
        reqDeliveryPeriod: { startDateTime: 5, endDateTime: 5 },
        status: 'X',
      }),
    });
    const res = await updateOrderHandler(event);
    expect(res.statusCode).toBe(400);
  });
});

describe('Lambda: generateUBLHandler (V2)', () => {
  test('200 returns signed URL', async () => {
    const res = await generateUBLHandler(makeEvent({}));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('signedUrl');
  });

  test('401 when session missing', async () => {
    const res = await generateUBLHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('401 when not a member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    const res = await generateUBLHandler(makeEvent({}));
    expect(res.statusCode).toBe(401);
  });

  test('throws InvalidInput when items array is empty', async () => {
    await expect(createOrder(ORG_ID, 'AUD', SESSION, ADDRESS_ID, DELIVERY_PERIOD, []))
      .rejects.toThrow(InvalidInput);
    await expect(createOrder(ORG_ID, 'AUD', SESSION, ADDRESS_ID, DELIVERY_PERIOD, []))
      .rejects.toThrow('At least one item is required');
  });
 
  test('InvalidInput - items not an array (undefined from missing body field)', async () => {
    // Simulates body.items being undefined - the handler passes it straight through.
    await expect(
      createOrder(ORG_ID, 'AUD', SESSION, ADDRESS_ID, DELIVERY_PERIOD, undefined as never)
    ).rejects.toThrow(InvalidInput);
  });
 
  test('throws InvalidInput when an item has an empty name', async () => {
    const badItems = [{ name: '', description: 'desc', unitPrice: 5, quantity: 1 }];
    await expect(createOrder(ORG_ID, 'AUD', SESSION, ADDRESS_ID, DELIVERY_PERIOD, badItems))
      .rejects.toThrow('non-empty name');
  });
 
  test('throws InvalidInput when an item has a negative unitPrice', async () => {
    const badItems = [{ name: 'Widget', description: 'desc', unitPrice: -1, quantity: 1 }];
    await expect(createOrder(ORG_ID, 'AUD', SESSION, ADDRESS_ID, DELIVERY_PERIOD, badItems))
      .rejects.toThrow('non-negative unitPrice');
  });
 
  test('throws InvalidInput when an item has a zero quantity', async () => {
    const badItems = [{ name: 'Widget', description: 'desc', unitPrice: 5, quantity: 0 }];
    await expect(createOrder(ORG_ID, 'AUD', SESSION, ADDRESS_ID, DELIVERY_PERIOD, badItems))
      .rejects.toThrow('positive integer quantity');
  });
 
  test('throws InvalidInput when an item has a fractional quantity', async () => {
    const badItems = [{ name: 'Widget', description: 'desc', unitPrice: 5, quantity: 1.5 }];
    await expect(createOrder(ORG_ID, 'AUD', SESSION, ADDRESS_ID, DELIVERY_PERIOD, badItems))
      .rejects.toThrow('positive integer quantity');
  });
 
  test('accepts items with zero unitPrice (free items are valid)', async () => {
    const freeItems = [{ name: 'Freebie', description: 'gratis', unitPrice: 0, quantity: 1 }];
    const result = await createOrder(
      ORG_ID, 'AUD', SESSION, ADDRESS_ID, DELIVERY_PERIOD, freeItems
    );
    expect(result).toHaveProperty('orderId');
  });
 
  test('400 when items array is empty', async () => {
    const event = makeEvent({
      pathParameters: { orgId: String(ORG_ID) },
      body: JSON.stringify({
        currency: 'AUD',
        deliveryAddressId: ADDRESS_ID,
        reqDeliveryPeriod: DELIVERY_PERIOD,
        items: [],
      }),
    });
    const res = await createOrderHandler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toHaveProperty('error');
  });
 
  test('400 when items field is missing from body entirely', async () => {
    const event = makeEvent({
      pathParameters: { orgId: String(ORG_ID) },
      body: JSON.stringify({
        currency: 'AUD',
        deliveryAddressId: ADDRESS_ID,
        reqDeliveryPeriod: DELIVERY_PERIOD,
        // items intentionally omitted
      }),
    });
    const res = await createOrderHandler(event);
    expect(res.statusCode).toBe(400);
  });
 
  test('400 when an item has invalid fields', async () => {
    const event = makeEvent({
      pathParameters: { orgId: String(ORG_ID) },
      body: JSON.stringify({
        currency: 'AUD',
        deliveryAddressId: ADDRESS_ID,
        reqDeliveryPeriod: DELIVERY_PERIOD,
        items: [{ name: '', unitPrice: -5, quantity: 0 }],
      }),
    });
    const res = await createOrderHandler(event);
    expect(res.statusCode).toBe(400);
  });
});