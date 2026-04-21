import {
  createAddress, getAddress, updateAddress, deleteAddress, listAddresses,
} from '../address';
import { createAddressHandler } from '../handlersV2/createAddress';
import { getAddressHandler } from '../handlersV2/getAddress';
import { updateAddressHandler } from '../handlersV2/updateAddress';
import { deleteAddressHandler } from '../handlersV2/deleteAddress';
import { listAddressHandler } from '../handlersV2/listAddress';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as userHelper from '../userHelper';
import * as orgPermissions from '../orgPermissions';
import { supabase } from '../supabase';
import { InvalidInput, InvalidSupabase, UnauthorisedError } from '../throwError';

// mocks

jest.mock('../userHelper');
jest.mock('../orgPermissions');
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    in: jest.fn(),
    neq: jest.fn(),
    limit: jest.fn(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
  },
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedPerms = orgPermissions as jest.Mocked<typeof orgPermissions>;
const db = supabase as never as {
  from: jest.Mock; select: jest.Mock; insert: jest.Mock; update: jest.Mock;
  delete: jest.Mock; eq: jest.Mock; is: jest.Mock; in: jest.Mock;
  neq: jest.Mock; limit: jest.Mock; maybeSingle: jest.Mock; single: jest.Mock;
};

const SESSION = 'valid-session';
const USER_ID = 1;
const ORG_ID = 10;
const ADDRESS_ID = 42;

function setupChain() {
  db.from.mockReturnThis();
  db.select.mockReturnThis();
  db.insert.mockReturnThis();
  db.update.mockReturnThis();
  db.delete.mockReturnThis();
  db.eq.mockReturnThis();
  db.is.mockReturnThis();
  db.neq.mockReturnThis();
  // limit, in, maybeSingle, single — left for tests to set explicitly
}

function makeEvent(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    headers: { session: SESSION },
    pathParameters: { addressId: String(ADDRESS_ID), orgId: String(ORG_ID) },
    body: null,
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

beforeEach(() => {
  jest.resetAllMocks();
  setupChain();
  mockedUserHelper.getUserIdFromSession.mockResolvedValue(USER_ID);
  mockedPerms.requireOrgMember.mockResolvedValue('MEMBER');
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// createAddress 

describe('createAddress (business logic)', () => {
  test('inserts new address when no duplicate exists', async () => {
    // dedup check: nothing found
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // insert
    db.single.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });

    const result = await createAddress(SESSION, '123 Test St', 'Sydney', '2000', 'AUS');
    expect(result).toEqual({ addressId: ADDRESS_ID });
    expect(db.insert).toHaveBeenCalledWith([
      expect.objectContaining({ street: '123 Test St', city: 'Sydney', country: 'AUS' }),
    ]);
  });

  test('returns existing addressId when identical address already exists (dedup)', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: 7 }, error: null });

    const result = await createAddress(SESSION, '123 Test St', 'Sydney', '2000', 'AUS');
    expect(result).toEqual({ addressId: 7 });
    // No insert should occur
    expect(db.insert).not.toHaveBeenCalled();
  });

  test('uses IS NULL for missing city and postcode in dedup query', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    db.single.mockResolvedValueOnce({ data: { addressID: 1 }, error: null });

    await createAddress(SESSION, '123 St');
    // Both nullable fields should use .is('field', null) not .eq('field', null)
    expect(db.is).toHaveBeenCalledWith('city', null);
    expect(db.is).toHaveBeenCalledWith('postcode', null);
  });

  test('uses .eq() for provided city and postcode in dedup query', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    db.single.mockResolvedValueOnce({ data: { addressID: 1 }, error: null });

    await createAddress(SESSION, '123 St', 'Sydney', '2000');
    expect(db.eq).toHaveBeenCalledWith('city', 'Sydney');
    expect(db.eq).toHaveBeenCalledWith('postcode', '2000');
  });

  test('throws InvalidInput when street is empty', async () => {
    await expect(createAddress(SESSION, '')).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidInput when street is only whitespace', async () => {
    await expect(createAddress(SESSION, '   ')).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidInput when street exceeds 200 characters', async () => {
    await expect(createAddress(SESSION, 'A'.repeat(201))).rejects.toThrow('too long');
  });

  test('throws UnauthorisedError on bad session', async () => {
    mockedUserHelper.getUserIdFromSession.mockRejectedValue(
      new UnauthorisedError('Invalid session')
    );
    await expect(createAddress('bad', '123 St')).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidSupabase on DB insert error', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    db.single.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });
    await expect(createAddress(SESSION, '123 St')).rejects.toThrow(InvalidSupabase);
  });

  test('defaults country to AUS when not provided', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    db.single.mockResolvedValueOnce({ data: { addressID: 1 }, error: null });
    await createAddress(SESSION, '123 St');
    expect(db.insert).toHaveBeenCalledWith([expect.objectContaining({ country: 'AUS' })]);
  });
});

//  listAddresses 
//
// listAddresses runs 4 queries in sequence:
//   1. organisations.select('addressId').eq() → maybeSingle  (org's own address)
//   2. orders.select('orderId').eq()          → eq terminal  (org's order IDs)
//   3. deliveries.select(...).in()            → in terminal  (delivery address IDs)
//   4. addresses.select(...).in()             → in terminal  (full address rows)

describe('listAddresses (business logic)', () => {
  const mockAddresses = [
    { addressID: 1, street: '1 First St', city: 'Sydney', postcode: '2000', country: 'AUS' },
    { addressID: 2, street: '2 Second Ave', city: 'Melbourne', postcode: '3000', country: 'AUS' },
  ];

  test('returns org address plus all delivery addresses', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressId: 1 }, error: null });
    db.eq.mockReturnValueOnce(db);
    db.eq.mockResolvedValueOnce({ data: [{ orderId: 'uuid-1' }], error: null });
    db.in
      .mockResolvedValueOnce({ data: [{ deliveryAddressID: 2 }], error: null })
      .mockResolvedValueOnce({ data: mockAddresses, error: null });

    const result = await listAddresses(SESSION, ORG_ID);
    expect(result.addresses).toEqual(mockAddresses);
    expect(mockedPerms.requireOrgMember).toHaveBeenCalledWith(USER_ID, ORG_ID);
  });

  test('returns only org address when org has no orders yet', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressId: 1 }, error: null });
    db.eq.mockReturnValueOnce(db);
    // no orders
    db.eq.mockResolvedValueOnce({ data: [], error: null });
    // No deliveries query fires when orderIds is empty.
    db.in.mockResolvedValueOnce({ data: [mockAddresses[0]], error: null });

    const result = await listAddresses(SESSION, ORG_ID);
    expect(result.addresses).toHaveLength(1);
  });

  test('returns empty array when org has no address and no orders', async () => {
    // no org address
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    db.eq.mockReturnValueOnce(db);
    // no orders
    db.eq.mockResolvedValueOnce({ data: [], error: null });

    const result = await listAddresses(SESSION, ORG_ID);
    expect(result).toEqual({ addresses: [] });
    // The final .in() fetch should NOT be called when there are no IDs
    expect(db.in).not.toHaveBeenCalled();
  });

  test('deduplicates when org address and delivery address are the same', async () => {
    // Both steps resolve to addressID = 1 — Set deduplication means only one row fetched.
    db.maybeSingle.mockResolvedValueOnce({ data: { addressId: 1 }, error: null });
    db.eq.mockReturnValueOnce(db);
    db.eq.mockResolvedValueOnce({ data: [{ orderId: 'uuid-1' }], error: null });
    db.in
      .mockResolvedValueOnce({ data: [{ deliveryAddressID: 1 }], error: null })
      .mockResolvedValueOnce({ data: [mockAddresses[0]], error: null });

    const result = await listAddresses(SESSION, ORG_ID);
    // The in() call for addresses should only pass [1], not [1,1]
    const lastInCall = db.in.mock.calls[1];
    expect(lastInCall[1]).toEqual([1]);
    expect(result.addresses).toHaveLength(1);
  });

  test('throws UnauthorisedError when user is not a member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(
      new UnauthorisedError('not a member')
    );
    await expect(listAddresses(SESSION, ORG_ID)).rejects.toThrow(UnauthorisedError);
  });

  test('throws UnauthorisedError on bad session', async () => {
    mockedUserHelper.getUserIdFromSession.mockRejectedValue(
      new UnauthorisedError('Invalid session')
    );
    await expect(listAddresses('bad', ORG_ID)).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidSupabase when final address fetch fails', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressId: 1 }, error: null });
    db.eq.mockReturnValueOnce(db);
    db.eq.mockResolvedValueOnce({ data: [], error: null });
    db.in.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

    await expect(listAddresses(SESSION, ORG_ID)).rejects.toThrow(InvalidSupabase);
  });
});

// getAddress

describe('getAddress (business logic)', () => {
  test('returns address data on success', async () => {
    const mockAddress = { addressID: ADDRESS_ID, street: '123 Test St', country: 'AUS' };
    db.maybeSingle.mockResolvedValueOnce({ data: mockAddress, error: null });

    const result = await getAddress(SESSION, ADDRESS_ID);
    expect(result).toEqual(mockAddress);
  });

  test('throws InvalidInput when address not found', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getAddress(SESSION, 999)).rejects.toThrow('Address not found');
  });

  test('throws InvalidSupabase on DB error', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });
    await expect(getAddress(SESSION, ADDRESS_ID)).rejects.toThrow(InvalidSupabase);
  });

  test('throws UnauthorisedError on bad session', async () => {
    mockedUserHelper.getUserIdFromSession.mockRejectedValue(
      new UnauthorisedError('Invalid session')
    );
    await expect(getAddress('bad', ADDRESS_ID)).rejects.toThrow(UnauthorisedError);
  });
});

// updateAddress

describe('updateAddress (business logic)', () => {
  test('updates address fields successfully', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });

    const result = await updateAddress(SESSION, ADDRESS_ID, { street: 'New St', city: 'Melb' });
    expect(result).toEqual({ addressId: ADDRESS_ID });
    expect(db.update).toHaveBeenCalledWith({ street: 'New St', city: 'Melb' });
  });

  test('throws InvalidInput when address does not exist', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateAddress(SESSION, 999, { street: 'X' })).rejects.toThrow('Address not found');
  });

  test('throws InvalidInput when no update fields provided', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });
    await expect(updateAddress(SESSION, ADDRESS_ID, {})).rejects.toThrow('No fields');
  });

  test('throws InvalidInput when street exceeds 200 characters', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });
    await expect(
      updateAddress(SESSION, ADDRESS_ID, { street: 'A'.repeat(201) })
    ).rejects.toThrow('too long');
  });

  test('throws InvalidSupabase on DB update error', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });
    db.eq
      .mockReturnValueOnce(db)  // existence check eq — continues chain to maybeSingle
      .mockResolvedValueOnce({ error: { message: 'Update failed' } }); // update eq — terminal

    await expect(
      updateAddress(SESSION, ADDRESS_ID, { street: 'New St' })
    ).rejects.toThrow(InvalidSupabase);
  });
});

// deleteAddress

describe('deleteAddress (business logic)', () => {
  test('deletes address when not referenced anywhere', async () => {
    db.limit
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await deleteAddress(SESSION, ADDRESS_ID);
    expect(result).toEqual({});
    expect(db.delete).toHaveBeenCalled();
  });

  test('throws when address is referenced by a delivery', async () => {
    db.limit.mockResolvedValueOnce({ data: [{ deliveryID: 1 }], error: null });
    await expect(deleteAddress(SESSION, ADDRESS_ID)).rejects.toThrow('order delivery');
  });

  test('throws when address is referenced by an organisation', async () => {
    db.limit
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ orgId: 5 }], error: null });
    await expect(deleteAddress(SESSION, ADDRESS_ID)).rejects.toThrow('organisation');
  });

  test('throws InvalidSupabase on DB delete error', async () => {
    db.limit
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    db.eq
      .mockReturnValueOnce(db)
      .mockReturnValueOnce(db)
      .mockResolvedValueOnce({ error: { message: 'Delete failed' } });

    await expect(deleteAddress(SESSION, ADDRESS_ID)).rejects.toThrow(InvalidSupabase);
  });
});

//  Lambda: createAddressHandler 

describe('Lambda: createAddressHandler', () => {
  test('200 on success — new address', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    db.single.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });

    const res = await createAddressHandler(makeEvent({
      pathParameters: {},
      body: JSON.stringify({ street: '123 Test St', city: 'Sydney', postcode: '2000' }),
    }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ addressId: ADDRESS_ID });
  });

  test('200 on success — dedup returns existing address', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: 7 }, error: null });

    const res = await createAddressHandler(makeEvent({
      pathParameters: {},
      body: JSON.stringify({ street: '123 Test St', city: 'Sydney' }),
    }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ addressId: 7 });
  });

  test('401 when session missing', async () => {
    const res = await createAddressHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 on empty street', async () => {
    const res = await createAddressHandler(makeEvent({
      body: JSON.stringify({ street: '' }),
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toHaveProperty('error');
  });
});

// Lambda: listAddressHandler

describe('Lambda: listAddressHandler', () => {
  test('200 returns address list for the org', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressId: 1 }, error: null });
    db.eq.mockReturnValueOnce(db);
    db.eq.mockResolvedValueOnce({ data: [], error: null });
    db.in.mockResolvedValueOnce({
      data: [{ addressID: 1, street: '1 First St', city: 'Sydney',
        postcode: '2000', country: 'AUS' }],
      error: null,
    });

    const res = await listAddressHandler(makeEvent({ pathParameters: { orgId: String(ORG_ID) } }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).addresses).toHaveLength(1);
  });

  test('200 returns empty array when org has no addresses', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    db.eq.mockReturnValueOnce(db);
    db.eq.mockResolvedValueOnce({ data: [], error: null });

    const res = await listAddressHandler(makeEvent({ pathParameters: { orgId: String(ORG_ID) } }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ addresses: [] });
  });

  test('401 when session missing', async () => {
    const res = await listAddressHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 when orgId is not a number', async () => {
    const res = await listAddressHandler(makeEvent({ pathParameters: { orgId: 'bad' } }));
    expect(res.statusCode).toBe(400);
  });

  test('401 when user is not a member of the org', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(
      new UnauthorisedError('not a member')
    );
    const res = await listAddressHandler(makeEvent({ pathParameters: { orgId: String(ORG_ID) } }));
    expect(res.statusCode).toBe(401);
  });
});

//  Lambda: getAddressHandler 

describe('Lambda: getAddressHandler', () => {
  test('200 on success', async () => {
    const mockAddr = { addressID: ADDRESS_ID, street: '123 St', country: 'AUS' };
    db.maybeSingle.mockResolvedValueOnce({ data: mockAddr, error: null });

    const res = await getAddressHandler(makeEvent({}));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(mockAddr);
  });

  test('401 when session missing', async () => {
    const res = await getAddressHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 when address not found', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await getAddressHandler(makeEvent({}));
    expect(res.statusCode).toBe(400);
  });

  test('400 when addressId is not a number', async () => {
    const res = await getAddressHandler(
      makeEvent({ pathParameters: { addressId: 'abc', orgId: String(ORG_ID) } })
    );
    expect(res.statusCode).toBe(400);
  });
});

//  Lambda: updateAddressHandler 

describe('Lambda: updateAddressHandler', () => {
  test('200 on success', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });

    const res = await updateAddressHandler(makeEvent(
      { body: JSON.stringify({ street: 'New St' }) }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ addressId: ADDRESS_ID });
  });

  test('401 when session missing', async () => {
    const res = await updateAddressHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 when address not found', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await updateAddressHandler(makeEvent({ body: JSON.stringify({ street: 'X' }) }));
    expect(res.statusCode).toBe(400);
  });

  test('400 when no update fields provided', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });
    const res = await updateAddressHandler(makeEvent({ body: JSON.stringify({}) }));
    expect(res.statusCode).toBe(400);
  });
});

//  Lambda: deleteAddressHandler 

describe('Lambda: deleteAddressHandler', () => {
  test('200 on success', async () => {
    db.limit
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const res = await deleteAddressHandler(makeEvent({}));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({});
  });

  test('401 when session missing', async () => {
    const res = await deleteAddressHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 when address is in use by a delivery', async () => {
    db.limit.mockResolvedValueOnce({ data: [{ deliveryID: 1 }], error: null });
    const res = await deleteAddressHandler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toHaveProperty('error');
  });

  test('400 when addressId is not a number', async () => {
    const res = await deleteAddressHandler(
      makeEvent({ pathParameters: { addressId: 'bad', orgId: String(ORG_ID) } })
    );
    expect(res.statusCode).toBe(400);
  });
});