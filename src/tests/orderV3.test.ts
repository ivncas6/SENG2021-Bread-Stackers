/**
 * orderV3.test.ts
 *
 * Tests for the v3 seller-aware order flow:
 *   - createOrderFromCatalogue (buyer)
 *   - listReceivedOrders / getReceivedOrderInfo (seller)
 *   - acceptOrder / rejectOrder (seller)
 *   - listOrganisations (discovery)
 *
 * Mock structure follows orderV2.test.ts: mock deps at top level, use
 * setupHappyPath() in beforeEach, override specific mocks per test.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  createOrderFromCatalogue, listReceivedOrders, getReceivedOrderInfo,
  acceptOrder, rejectOrder, getReceivedOrderUBL, listOrganisations,
} from '../orderV3';
import { createOrderHandler }          from '../handlersV3/createOrder';
import { listReceivedOrdersHandler }   from '../handlersV3/listReceivedOrders';
import { getReceivedOrderInfoHandler } from '../handlersV3/getReceivedOrderInfo';
import { acceptOrderHandler }          from '../handlersV3/acceptOrder';
import { rejectOrderHandler }          from '../handlersV3/rejectOrder';
import { listOrganisationsHandler }    from '../handlersV3/listOrganisations';
import * as userHelper     from '../userHelper';
import * as orgPermissions from '../orgPermissions';
import * as dataStore      from '../dataStore';
import * as generateUBL    from '../generateUBL';
import { supabase }        from '../supabase';
import { UnauthorisedError, InvalidOrderId,
  InvalidRequestPeriod, InvalidInput } from '../throwError';
import { Order } from '../interfaces';
import { SupabaseMock } from '../interfaces';

// Mocks

jest.mock('../userHelper');
jest.mock('../orgPermissions');
jest.mock('../dataStore');
jest.mock('../generateUBL');
jest.mock('../supabase');

const mockedUserHelper = userHelper     as jest.Mocked<typeof userHelper>;
const mockedPerms = orgPermissions as jest.Mocked<typeof orgPermissions>;
const mockedDataStore = dataStore      as jest.Mocked<typeof dataStore>;
const mockedUBL = generateUBL   as jest.Mocked<typeof generateUBL>;
const mockedSupabase = supabase as unknown as SupabaseMock;

// Test fixtures

const SESSION = 'valid-session';
const USER_ID = 1;
const BUYER_ORG_ID = 10;
const SELLER_ORG_ID = 20;
const ORDER_ID = '550e8400-e29b-41d4-a716-446655440000';
const ADDRESS_ID = 5;
const DELIVERY_PERIOD = { startDateTime: 1_000_000, endDateTime: 2_000_000 };
const CATALOGUE_ITEMS = [{ catalogueItemId: 1, quantity: 2 }];

// A v3 order — sellerOrgID is a real org (not 1), status is PENDING
const MOCK_ORDER: Partial<Order> = {
  orderId: ORDER_ID,
  buyerOrgID: BUYER_ORG_ID,
  sellerOrgID: SELLER_ORG_ID,
  status: 'PENDING',
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
    addresses: { street: '1 Seller St' },
  }],
  organisations: {
    contacts: { firstName: 'A', lastName: 'B', telephone: '0400000000', email: 'a@b.com' },
  },
  order_lines: [{ quantity: 2, items:
    { name: 'Sourdough', description: 'Fresh bread', price: 10 } }] as never,
};

// Catalogue rows returned from Supabase
const MOCK_CATALOGUE_ROWS = [
  { catalogueItemId: 1, name: 'Sourdough', description: 'Fresh bread',
    price: 10, active: true, orgId: SELLER_ORG_ID },
];

function setupHappyPath() {
  mockedUserHelper.getUserIdFromSession.mockResolvedValue(USER_ID);
  mockedPerms.requireOrgMember.mockResolvedValue('MEMBER');
  mockedPerms.requireOrgAdminOrOwner.mockResolvedValue(undefined);
  mockedDataStore.getOrderByIdSupa.mockResolvedValue(MOCK_ORDER as Order);
  mockedUBL.uploadUBLForOrder.mockResolvedValue(null);
  mockedUBL.getSignedUBLUrl.mockResolvedValue('https://signed-url.example.com');
}

/** Mocks the Supabase fluent chain for a query that ends in .select().eq() terminal. */
function mockSupabaseSelect(data: unknown[], error: unknown = null) {
  const eqMock = jest.fn().mockResolvedValue({ data, error });
  const selMock = jest.fn().mockReturnValue({ eq: eqMock });
  mockedSupabase.from.mockReturnValue({ select: selMock } as never);
}

/** Mocks the `.in()` call used by createOrderFromCatalogue for catalogue validation. */
function mockCatalogueIn(rows: unknown[]) {
  const inMock = jest.fn().mockResolvedValue({ data: rows, error: null });
  const selMock = jest.fn().mockReturnValue({ in: inMock });
  mockedSupabase.from.mockReturnValueOnce({ select: selMock } as never);
}

/** Mocks the order insert chain used inside insertOrderV3. */
function mockOrderInsertSuccess() {
  // orders insert (no return value needed, just no error)
  const insertMock = jest.fn().mockResolvedValue({ error: null });
  // deliveries insert
  const delInsert = jest.fn().mockResolvedValue({ data: {}, error: null });
  // items insert → single
  const itemSingle = jest.fn().mockResolvedValue({ data: { itemId: 99 }, error: null });
  const itemInsert = jest.fn().mockReturnValue({ select: () => ({ single: itemSingle }) });
  // order_lines insert
  const olInsert = jest.fn().mockResolvedValue({ data: {}, error: null });

  mockedSupabase.from
    // 1st call: catalogue_items select (done by mockCatalogueIn above)
    // 2nd call: orders insert
    .mockReturnValueOnce({ insert: insertMock } as never)
    // 3rd call: deliveries insert
    .mockReturnValueOnce({ insert: delInsert } as never)
    // 4th call: items insert
    .mockReturnValueOnce({ insert: itemInsert } as never)
    // 5th call: order_lines insert
    .mockReturnValueOnce({ insert: olInsert } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  setupHappyPath();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

function makeEvent(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    headers:       { session: SESSION },
    pathParameters: { orgId: String(SELLER_ORG_ID), orderId: ORDER_ID },
    queryStringParameters: null,
    body:          null,
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// createOrderFromCatalogue

describe('createOrderFromCatalogue (business logic)', () => {
  test('creates a PENDING order with the correct sellerOrgID', async () => {
    mockCatalogueIn(MOCK_CATALOGUE_ROWS);
    mockOrderInsertSuccess();

    const result = await createOrderFromCatalogue(
      BUYER_ORG_ID, SESSION, SELLER_ORG_ID, ADDRESS_ID, DELIVERY_PERIOD, CATALOGUE_ITEMS
    );
    expect(result).toEqual({ orderId: expect.any(String) });
    expect(mockedPerms.requireOrgMember).toHaveBeenCalledWith(USER_ID, BUYER_ORG_ID);
    expect(mockedUBL.uploadUBLForOrder).toHaveBeenCalled();
  });

  test('throws InvalidInput when catalogue item array is empty', async () => {
    await expect(
      createOrderFromCatalogue(BUYER_ORG_ID, SESSION, 
        SELLER_ORG_ID, ADDRESS_ID, DELIVERY_PERIOD, [])
    ).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidInput when catalogue item array is not an array', async () => {
    await expect(
      createOrderFromCatalogue(
        BUYER_ORG_ID, SESSION, SELLER_ORG_ID, ADDRESS_ID, DELIVERY_PERIOD, undefined as never
      )
    ).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidInput when a catalogueItemId is not a positive integer', async () => {
    await expect(
      createOrderFromCatalogue(
        BUYER_ORG_ID, SESSION, SELLER_ORG_ID, ADDRESS_ID, DELIVERY_PERIOD,
        [{ catalogueItemId: -1, quantity: 1 }]
      )
    ).rejects.toThrow('valid catalogueItemId');
  });

  test('throws InvalidInput when a quantity is zero', async () => {
    await expect(
      createOrderFromCatalogue(
        BUYER_ORG_ID, SESSION, SELLER_ORG_ID, ADDRESS_ID, DELIVERY_PERIOD,
        [{ catalogueItemId: 1, quantity: 0 }]
      )
    ).rejects.toThrow('positive integer quantity');
  });

  test('throws InvalidInput when a quantity is fractional', async () => {
    await expect(
      createOrderFromCatalogue(
        BUYER_ORG_ID, SESSION, SELLER_ORG_ID, ADDRESS_ID, DELIVERY_PERIOD,
        [{ catalogueItemId: 1, quantity: 1.5 }]
      )
    ).rejects.toThrow('positive integer quantity');
  });

  test('throws InvalidInput when deliveryAddressId is not positive', async () => {
    await expect(
      createOrderFromCatalogue(
        BUYER_ORG_ID, SESSION, SELLER_ORG_ID, 0, DELIVERY_PERIOD, CATALOGUE_ITEMS
      )
    ).rejects.toThrow('positive integer');
  });

  test('throws InvalidRequestPeriod when end <= start', async () => {
    await expect(
      createOrderFromCatalogue(
        BUYER_ORG_ID, SESSION, SELLER_ORG_ID, ADDRESS_ID,
        { startDateTime: 2_000_000, endDateTime: 1_000_000 }, CATALOGUE_ITEMS
      )
    ).rejects.toThrow(InvalidRequestPeriod);
  });

  test('throws InvalidInput when a catalogue item is not found', async () => {
    // Return empty rows — item not in catalogue
    mockCatalogueIn([]);
    await expect(
      createOrderFromCatalogue(
        BUYER_ORG_ID, SESSION, SELLER_ORG_ID, ADDRESS_ID, DELIVERY_PERIOD, CATALOGUE_ITEMS
      )
    ).rejects.toThrow('not found');
  });

  test('throws InvalidInput when a catalogue item is inactive', async () => {
    mockCatalogueIn([{ ...MOCK_CATALOGUE_ROWS[0], active: false }]);
    await expect(
      createOrderFromCatalogue(
        BUYER_ORG_ID, SESSION, SELLER_ORG_ID, ADDRESS_ID, DELIVERY_PERIOD, CATALOGUE_ITEMS
      )
    ).rejects.toThrow('no longer available');
  });

  test('throws InvalidInput when a catalogue item belongs to a different seller', async () => {
    mockCatalogueIn([{ ...MOCK_CATALOGUE_ROWS[0], orgId: 999 }]);
    await expect(
      createOrderFromCatalogue(
        BUYER_ORG_ID, SESSION, SELLER_ORG_ID, ADDRESS_ID, DELIVERY_PERIOD, CATALOGUE_ITEMS
      )
    ).rejects.toThrow('does not belong to the specified seller');
  });

  test('throws UnauthorisedError when caller is not a buyer org member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    await expect(
      createOrderFromCatalogue(
        BUYER_ORG_ID, SESSION, SELLER_ORG_ID, ADDRESS_ID, DELIVERY_PERIOD, CATALOGUE_ITEMS
      )
    ).rejects.toThrow(UnauthorisedError);
  });
});

// listReceivedOrders 

describe('listReceivedOrders (business logic)', () => {
  test('returns orders where sellerOrgID matches', async () => {
    mockSupabaseSelect([MOCK_ORDER]);
    const result = await listReceivedOrders(SELLER_ORG_ID, SESSION);
    expect(result.orders).toHaveLength(1);
    expect(mockedPerms.requireOrgMember).toHaveBeenCalledWith(USER_ID, SELLER_ORG_ID);
  });

  test('returns empty array when no orders received', async () => {
    mockSupabaseSelect([]);
    const result = await listReceivedOrders(SELLER_ORG_ID, SESSION);
    expect(result).toEqual({ orders: [] });
  });

  test('throws UnauthorisedError when not a member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    await expect(listReceivedOrders(SELLER_ORG_ID, SESSION)).rejects.toThrow(UnauthorisedError);
  });
});

// getReceivedOrderInfo 

describe('getReceivedOrderInfo (business logic)', () => {
  test('returns full order details for the seller', async () => {
    const result = await getReceivedOrderInfo(SELLER_ORG_ID, SESSION, ORDER_ID);
    expect(result.orderId).toStrictEqual(ORDER_ID);
    expect(result.status).toStrictEqual('PENDING');
    expect(result.buyerOrgId).toStrictEqual(BUYER_ORG_ID);
    expect(result.deliveryAddressId).toStrictEqual(ADDRESS_ID);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toStrictEqual('Sourdough');
  });

  test('throws InvalidOrderId when order not found', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);
    await expect(getReceivedOrderInfo(SELLER_ORG_ID, SESSION, ORDER_ID))
      .rejects.toThrow(InvalidOrderId);
  });

  test('throws UnauthorisedError when order belongs to different seller', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(
      { ...MOCK_ORDER, sellerOrgID: 999 } as Order
    );
    await expect(getReceivedOrderInfo(SELLER_ORG_ID, SESSION, ORDER_ID))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws UnauthorisedError when not a member of seller org', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    await expect(getReceivedOrderInfo(SELLER_ORG_ID, SESSION, ORDER_ID))
      .rejects.toThrow(UnauthorisedError);
  });
});

// acceptOrder 

describe('acceptOrder (business logic)', () => {
  function mockUpdateSuccess() {
    const eqMock = jest.fn().mockResolvedValue({ error: null });
    const updMock = jest.fn().mockReturnValue({ eq: eqMock });
    mockedSupabase.from.mockReturnValue({ update: updMock } as never);
  }

  test('returns empty object and updates status to ACCEPTED', async () => {
    mockUpdateSuccess();
    const result = await acceptOrder(SELLER_ORG_ID, ORDER_ID, SESSION);
    expect(result).toEqual({});
    expect(mockedPerms.requireOrgAdminOrOwner).toHaveBeenCalledWith(USER_ID, SELLER_ORG_ID);
  });

  test('throws InvalidInput when order is not PENDING', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(
      { ...MOCK_ORDER, status: 'ACCEPTED' } as Order
    );
    await expect(acceptOrder(SELLER_ORG_ID, ORDER_ID, SESSION))
      // eslint-disable-next-line
      .rejects.toThrow(`Cannot accept an order with status 'ACCEPTED'`);
  });

  test('throws InvalidOrderId when order not found', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);
    await expect(acceptOrder(SELLER_ORG_ID, ORDER_ID, SESSION))
      .rejects.toThrow(InvalidOrderId);
  });

  test('throws UnauthorisedError when order belongs to different seller', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(
      { ...MOCK_ORDER, sellerOrgID: 999 } as Order
    );
    await expect(acceptOrder(SELLER_ORG_ID, ORDER_ID, SESSION))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws UnauthorisedError when caller is plain MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin required'));
    await expect(acceptOrder(SELLER_ORG_ID, ORDER_ID, SESSION))
      .rejects.toThrow(UnauthorisedError);
  });
});

// rejectOrder 

describe('rejectOrder (business logic)', () => {
  function mockUpdateSuccess() {
    const eqMock = jest.fn().mockResolvedValue({ error: null });
    const updMock = jest.fn().mockReturnValue({ eq: eqMock });
    mockedSupabase.from.mockReturnValue({ update: updMock } as never);
  }

  test('returns reason and updates status to REJECTED', async () => {
    mockUpdateSuccess();
    const result = await rejectOrder(SELLER_ORG_ID, ORDER_ID, 'Out of stock', SESSION);
    expect(result).toEqual({ reason: 'Out of stock' });
  });

  test('trims whitespace from the reason', async () => {
    mockUpdateSuccess();
    const result = await rejectOrder(SELLER_ORG_ID, ORDER_ID, '  Out of stock  ', SESSION);
    expect(result.reason).toStrictEqual('Out of stock');
  });

  test('throws InvalidInput when reason is empty', async () => {
    await expect(rejectOrder(SELLER_ORG_ID, ORDER_ID, '', SESSION))
      .rejects.toThrow('rejection reason is required');
  });

  test('throws InvalidInput when reason is only whitespace', async () => {
    await expect(rejectOrder(SELLER_ORG_ID, ORDER_ID, '   ', SESSION))
      .rejects.toThrow('rejection reason is required');
  });

  test('throws InvalidInput when order is not PENDING', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(
      { ...MOCK_ORDER, status: 'ACCEPTED' } as Order
    );
    await expect(rejectOrder(SELLER_ORG_ID, ORDER_ID, 'reason', SESSION))
      // eslint-disable-next-line
      .rejects.toThrow(`Cannot reject an order with status 'ACCEPTED'`);
  });

  test('throws UnauthorisedError when caller is plain MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin required'));
    await expect(rejectOrder(SELLER_ORG_ID, ORDER_ID, 'reason', SESSION))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws UnauthorisedError when order belongs to different seller', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(
      { ...MOCK_ORDER, sellerOrgID: 999 } as Order
    );
    await expect(rejectOrder(SELLER_ORG_ID, ORDER_ID, 'reason', SESSION))
      .rejects.toThrow(UnauthorisedError);
  });
});

// listOrganisations 

describe('listOrganisations (business logic)', () => {
  test('returns all organisations', async () => {
    const orgs = [{ orgId: 1, orgName: 'Org A' }, { orgId: 2, orgName: 'Org B' }];
    const selMock = jest.fn().mockResolvedValue({ data: orgs, error: null });
    mockedSupabase.from.mockReturnValue({ select: selMock } as never);

    const result = await listOrganisations(SESSION);
    expect(result.organisations).toHaveLength(2);
    expect(result.organisations[0].orgName).toStrictEqual('Org A');
  });

  test('returns empty array when no organisations exist', async () => {
    const selMock = jest.fn().mockResolvedValue({ data: [], error: null });
    mockedSupabase.from.mockReturnValue({ select: selMock } as never);
    const result = await listOrganisations(SESSION);
    expect(result).toEqual({ organisations: [] });
  });

  test('throws UnauthorisedError on bad session', async () => {
    mockedUserHelper.getUserIdFromSession.mockRejectedValue(
      new UnauthorisedError('Invalid session')
    );
    await expect(listOrganisations('bad')).rejects.toThrow(UnauthorisedError);
  });
});

// Lambda: createOrderHandler (V3) 

describe('Lambda: createOrderHandler (V3)', () => {
  test('200 on success', async () => {
    mockCatalogueIn(MOCK_CATALOGUE_ROWS);
    mockOrderInsertSuccess();

    const event = makeEvent({
      pathParameters: { orgId: String(BUYER_ORG_ID) },
      body: JSON.stringify({
        sellerOrgId: SELLER_ORG_ID,
        deliveryAddressId: ADDRESS_ID,
        reqDeliveryPeriod: DELIVERY_PERIOD,
        items:      CATALOGUE_ITEMS,
      }),
    });
    const res = await createOrderHandler(event);
    expect(res.statusCode).toStrictEqual(200);
    expect(JSON.parse(res.body)).toHaveProperty('orderId');
  });

  test('401 when session missing', async () => {
    const res = await createOrderHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toStrictEqual(401);
  });

  test('400 when sellerOrgId is missing or invalid', async () => {
    const event = makeEvent({
      pathParameters: { orgId: String(BUYER_ORG_ID) },
      body: JSON.stringify({
        deliveryAddressId: ADDRESS_ID,
        reqDeliveryPeriod: DELIVERY_PERIOD,
        items:      CATALOGUE_ITEMS,
      }),
    });
    const res = await createOrderHandler(event);
    expect(res.statusCode).toStrictEqual(400);
  });

  test('400 when items array is empty', async () => {
    mockCatalogueIn(MOCK_CATALOGUE_ROWS);
    const event = makeEvent({
      pathParameters: { orgId: String(BUYER_ORG_ID) },
      body: JSON.stringify({
        sellerOrgId: SELLER_ORG_ID, deliveryAddressId: ADDRESS_ID,
        reqDeliveryPeriod: DELIVERY_PERIOD, items: [],
      }),
    });
    const res = await createOrderHandler(event);
    expect(res.statusCode).toStrictEqual(400);
  });

  test('401 when caller is not a buyer org member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    const event = makeEvent({
      pathParameters: { orgId: String(BUYER_ORG_ID) },
      body: JSON.stringify({
        sellerOrgId: SELLER_ORG_ID, deliveryAddressId: ADDRESS_ID,
        reqDeliveryPeriod: DELIVERY_PERIOD, items: CATALOGUE_ITEMS,
      }),
    });
    const res = await createOrderHandler(event);
    expect(res.statusCode).toStrictEqual(401);
  });
});

// Lambda: listReceivedOrdersHandler 

describe('Lambda: listReceivedOrdersHandler', () => {
  test('200 returns received orders', async () => {
    mockSupabaseSelect([MOCK_ORDER]);
    const res = await listReceivedOrdersHandler(
      makeEvent({ pathParameters: { orgId: String(SELLER_ORG_ID) } })
    );
    expect(res.statusCode).toStrictEqual(200);
    expect(JSON.parse(res.body).orders).toHaveLength(1);
  });

  test('200 with status filter in query string', async () => {
    // The filter is passed to listReceivedOrders — just verify no crash
    const eqMock = jest.fn()
      .mockReturnValueOnce({ eq: jest.fn().mockResolvedValue({ data: [], error: null }) });
    const selMock = jest.fn().mockReturnValue({ eq: eqMock });
    mockedSupabase.from.mockReturnValue({ select: selMock } as never);

    const res = await listReceivedOrdersHandler(
      makeEvent({
        pathParameters: { orgId: String(SELLER_ORG_ID) },
        queryStringParameters: { status: 'PENDING' },
      })
    );
    expect(res.statusCode).toStrictEqual(200);
  });

  test('401 when session missing', async () => {
    const res = await listReceivedOrdersHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toStrictEqual(401);
  });

  test('400 when orgId is invalid', async () => {
    const res = await listReceivedOrdersHandler(
      makeEvent({ pathParameters: { orgId: 'bad' } })
    );
    expect(res.statusCode).toStrictEqual(400);
  });
});

// Lambda: getReceivedOrderInfoHandler 

describe('Lambda: getReceivedOrderInfoHandler', () => {
  test('200 with full order details including buyerOrgId', async () => {
    const res = await getReceivedOrderInfoHandler(makeEvent({}));
    expect(res.statusCode).toStrictEqual(200);
    const body = JSON.parse(res.body);
    expect(body.orderId).toStrictEqual(ORDER_ID);
    expect(body.buyerOrgId).toStrictEqual(BUYER_ORG_ID);
    expect(body.status).toStrictEqual('PENDING');
  });

  test('401 when session missing', async () => {
    const res = await getReceivedOrderInfoHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toStrictEqual(401);
  });

  test('400 when order not found', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);
    const res = await getReceivedOrderInfoHandler(makeEvent({}));
    expect(res.statusCode).toStrictEqual(400);
  });

  test('401 when order belongs to different seller', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(
      { ...MOCK_ORDER, sellerOrgID: 999 } as Order
    );
    const res = await getReceivedOrderInfoHandler(makeEvent({}));
    expect(res.statusCode).toStrictEqual(401);
  });
});

// Lambda: acceptOrderHandler 

describe('Lambda: acceptOrderHandler', () => {
  function mockAcceptSuccess() {
    const eqMock = jest.fn().mockResolvedValue({ error: null });
    const updMock = jest.fn().mockReturnValue({ eq: eqMock });
    mockedSupabase.from.mockReturnValue({ update: updMock } as never);
  }

  test('200 on success', async () => {
    mockAcceptSuccess();
    const res = await acceptOrderHandler(makeEvent({}));
    expect(res.statusCode).toStrictEqual(200);
    expect(JSON.parse(res.body)).toEqual({});
  });

  test('401 when session missing', async () => {
    const res = await acceptOrderHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toStrictEqual(401);
  });

  test('400 when order is already ACCEPTED', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(
      { ...MOCK_ORDER, status: 'ACCEPTED' } as Order
    );
    const res = await acceptOrderHandler(makeEvent({}));
    expect(res.statusCode).toStrictEqual(400);
    expect(JSON.parse(res.body)).toHaveProperty('error');
  });

  test('401 when caller is plain MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin required'));
    const res = await acceptOrderHandler(makeEvent({}));
    expect(res.statusCode).toStrictEqual(401);
  });

  test('400 when order not found', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);
    const res = await acceptOrderHandler(makeEvent({}));
    expect(res.statusCode).toStrictEqual(400);
  });
});

// Lambda: rejectOrderHandler 

describe('Lambda: rejectOrderHandler', () => {
  function mockRejectSuccess() {
    const eqMock = jest.fn().mockResolvedValue({ error: null });
    const updMock = jest.fn().mockReturnValue({ eq: eqMock });
    mockedSupabase.from.mockReturnValue({ update: updMock } as never);
  }

  test('200 on success with reason', async () => {
    mockRejectSuccess();
    const event = makeEvent({ body: JSON.stringify({ reason: 'Out of stock' }) });
    const res = await rejectOrderHandler(event);
    expect(res.statusCode).toStrictEqual(200);
    expect(JSON.parse(res.body)).toEqual({ reason: 'Out of stock' });
  });

  test('401 when session missing', async () => {
    const res = await rejectOrderHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toStrictEqual(401);
  });

  test('400 when reason is missing from body', async () => {
    const res = await rejectOrderHandler(makeEvent({ body: JSON.stringify({}) }));
    expect(res.statusCode).toStrictEqual(400);
    expect(JSON.parse(res.body)).toHaveProperty('error');
  });

  test('400 when reason is empty string', async () => {
    const res = await rejectOrderHandler(makeEvent({ body: JSON.stringify({ reason: '' }) }));
    expect(res.statusCode).toStrictEqual(400);
  });

  test('400 when order is already REJECTED', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(
      { ...MOCK_ORDER, status: 'REJECTED' } as Order
    );
    const event = makeEvent({ body: JSON.stringify({ reason: 'Already done' }) });
    const res = await rejectOrderHandler(event);
    expect(res.statusCode).toStrictEqual(400);
  });

  test('401 when caller is plain MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin required'));
    const event = makeEvent({ body: JSON.stringify({ reason: 'reason' }) });
    const res = await rejectOrderHandler(event);
    expect(res.statusCode).toStrictEqual(401);
  });
});

// Lambda: listOrganisationsHandler 

describe('Lambda: listOrganisationsHandler', () => {
  test('200 returns organisation list', async () => {
    const orgs = [{ orgId: 1, orgName: 'BreadCo' }];
    const selMock = jest.fn().mockResolvedValue({ data: orgs, error: null });
    mockedSupabase.from.mockReturnValue({ select: selMock } as never);

    const res = await listOrganisationsHandler(makeEvent({}));
    expect(res.statusCode).toStrictEqual(200);
    expect(JSON.parse(res.body).organisations).toHaveLength(1);
  });

  test('401 when session missing', async () => {
    const res = await listOrganisationsHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toStrictEqual(401);
  });
});

// getReceivedOrderUBL 

describe('getReceivedOrderUBL (business logic)', () => {
  test('returns signed URL on success', async () => {
    const result = await getReceivedOrderUBL(SELLER_ORG_ID, SESSION, ORDER_ID);
    expect(result).toStrictEqual('https://signed-url.example.com');
    expect(mockedUBL.getSignedUBLUrl).toHaveBeenCalledWith(ORDER_ID);
  });

  test('throws UnauthorisedError when order belongs to different seller', async () => {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(
      { ...MOCK_ORDER, sellerOrgID: 999 } as Order
    );
    await expect(getReceivedOrderUBL(SELLER_ORG_ID, SESSION, ORDER_ID))
      .rejects.toThrow(UnauthorisedError);
  });
});