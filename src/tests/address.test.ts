import { createAddress, getAddress, updateAddress, deleteAddress } from '../address';
import { createAddressHandler } from '../handlersV2/createAddress';
import { getAddressHandler } from '../handlersV2/getAddress';
import { updateAddressHandler } from '../handlersV2/updateAddress';
import { deleteAddressHandler } from '../handlersV2/deleteAddress';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as userHelper from '../userHelper';
import { supabase } from '../supabase';
import { InvalidInput, InvalidSupabase, UnauthorisedError } from '../throwError';

// mocks

jest.mock('../userHelper');
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    neq: jest.fn(),
    limit: jest.fn(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
  },
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const db = supabase as never as {
  from: jest.Mock; select: jest.Mock; insert: jest.Mock; update: jest.Mock;
  delete: jest.Mock; eq: jest.Mock; neq: jest.Mock; limit: jest.Mock;
  maybeSingle: jest.Mock; single: jest.Mock;
};

const SESSION = 'valid-session';
const USER_ID = 1;
const ADDRESS_ID = 42;

// Non-terminal chain methods return `this` by default.
// Terminal methods (maybeSingle, single, limit-as-terminal) are set explicitly per test.
function setupChain() {
  db.from.mockReturnThis();
  db.select.mockReturnThis();
  db.insert.mockReturnThis();
  db.update.mockReturnThis();
  db.delete.mockReturnThis();
  db.eq.mockReturnThis();
  db.neq.mockReturnThis();
  // limit, maybeSingle and single left without a default — tests must set them explicitly
}

function makeEvent(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    headers: { session: SESSION },
    pathParameters: { addressId: String(ADDRESS_ID) },
    body: null,
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

beforeEach(() => {
  jest.resetAllMocks();
  setupChain();
  mockedUserHelper.getUserIdFromSession.mockResolvedValue(USER_ID);
});

// createAddress 

describe('createAddress (business logic)', () => {
  test('creates address and returns addressId', async () => {
    db.single.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });

    const result = await createAddress(SESSION, '123 Test St', 'Sydney', '2000', 'AUS');
    expect(result).toEqual({ addressId: ADDRESS_ID });
    expect(db.insert).toHaveBeenCalledWith([expect.objectContaining({ street: '123 Test St' })]);
  });

  test('throws InvalidInput when street is empty', async () => {
    await expect(createAddress(SESSION, '')).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidInput when street is only whitespace', async () => {
    await expect(createAddress(SESSION, '   ')).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidInput when street is too long', async () => {
    await expect(createAddress(SESSION, 'A'.repeat(201))).rejects.toThrow('too long');
  });

  test('throws UnauthorisedError on bad session', async () => {
    mockedUserHelper.getUserIdFromSession.mockRejectedValue(
      new UnauthorisedError('Invalid session')
    );
    await expect(createAddress('bad', '123 St')).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidSupabase on DB error', async () => {
    db.single.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });
    await expect(createAddress(SESSION, '123 St')).rejects.toThrow(InvalidSupabase);
  });

  test('defaults country to AUS when not provided', async () => {
    db.single.mockResolvedValueOnce({ data: { addressID: 1 }, error: null });
    await createAddress(SESSION, '123 St');
    expect(db.insert).toHaveBeenCalledWith([expect.objectContaining({ country: 'AUS' })]);
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

  test('throws with "Address not found" message when not found', async () => {
    // One call only — avoids consuming a queued mock for the second assertion
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

  test('throws with "Address not found" when address does not exist', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateAddress(SESSION, 999, { street: 'X' })).rejects.toThrow('Address not found');
  });

  test('throws InvalidInput when no fields are provided', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });
    await expect(updateAddress(SESSION, ADDRESS_ID, {})).rejects.toThrow('No fields');
  });

  test('throws InvalidInput when street is too long', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });
    await expect(
      updateAddress(SESSION, ADDRESS_ID, { street: 'A'.repeat(201) })
    ).rejects.toThrow('too long');
  });

  test('throws InvalidSupabase on DB update error', async () => {
    // updateAddress makes two eq calls:
    // eq #1 (existence check): .select().eq() → maybeSingle is terminal, eq must return `this`
    // eq #2 (update):          .update().eq() → terminal, must resolve with error
    // Explicitly queue both to guarantee correct ordering.
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });
    db.eq
      .mockReturnValueOnce(db)  // eq #1: existence check — chain continues to maybeSingle
      .mockResolvedValueOnce({ error: { message: 'Update failed' } }); // eq #2: terminal

    await expect(
      updateAddress(SESSION, ADDRESS_ID, { street: 'New St' })
    ).rejects.toThrow(InvalidSupabase);
  });
});

// deleteAddress 

describe('deleteAddress (business logic)', () => {
  test('deletes address when not in use', async () => {
    db.limit
      .mockResolvedValueOnce({ data: [], error: null })   // delivery guard
      .mockResolvedValueOnce({ data: [], error: null });   // org guard

    const result = await deleteAddress(SESSION, ADDRESS_ID);
    expect(result).toEqual({});
    expect(db.delete).toHaveBeenCalled();
  });

  test('throws "order delivery" when address is used by a delivery', async () => {
    // Throws immediately after first limit — no second call needed
    db.limit.mockResolvedValueOnce({ data: [{ deliveryID: 1 }], error: null });
    await expect(deleteAddress(SESSION, ADDRESS_ID)).rejects.toThrow('order delivery');
  });

  test('throws "organisation" when address is used by an org', async () => {
    db.limit
      .mockResolvedValueOnce({ data: [], error: null })               // no deliveries
      .mockResolvedValueOnce({ data: [{ orgId: 5 }], error: null });  // org match
    await expect(deleteAddress(SESSION, ADDRESS_ID)).rejects.toThrow('organisation');
  });

  test('throws InvalidSupabase on DB delete error', async () => {
    // Both guard limit calls pass
    db.limit
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    // deleteAddress makes 3 eq calls:
    // eq #1: delivery guard .eq('deliveryAddressID', …) → limit is terminal, eq returns this
    // eq #2: org guard      .eq('addressId', …)         → limit is terminal, eq returns this
    // eq #3: delete         .delete().eq(…)             → terminal, resolves with error
    db.eq
      .mockReturnValueOnce(db)
      .mockReturnValueOnce(db)
      .mockResolvedValueOnce({ error: { message: 'Delete failed' } });

    await expect(deleteAddress(SESSION, ADDRESS_ID)).rejects.toThrow(InvalidSupabase);
  });

  test('throws UnauthorisedError on bad session', async () => {
    mockedUserHelper.getUserIdFromSession.mockRejectedValue(
      new UnauthorisedError('Invalid session')
    );
    await expect(deleteAddress('bad', ADDRESS_ID)).rejects.toThrow(UnauthorisedError);
  });
});

// Lambda handlers 

describe('Lambda: createAddressHandler', () => {
  test('200 on success', async () => {
    db.single.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });

    const event = makeEvent({
      pathParameters: {},
      body: JSON.stringify({ street: '123 Test St', city: 'Sydney', postcode: '2000' }),
    });
    const res = await createAddressHandler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ addressId: ADDRESS_ID });
  });

  test('401 when session missing', async () => {
    const res = await createAddressHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 on empty street', async () => {
    const event = makeEvent({ body: JSON.stringify({ street: '' }) });
    const res = await createAddressHandler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toHaveProperty('error');
  });
});

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
      makeEvent({ pathParameters: { addressId: 'abc' } })
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('Lambda: updateAddressHandler', () => {
  test('200 on success', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });

    const event = makeEvent({ body: JSON.stringify({ street: 'New St' }) });
    const res = await updateAddressHandler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ addressId: ADDRESS_ID });
  });

  test('401 when session missing', async () => {
    const res = await updateAddressHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 when address not found', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const event = makeEvent({ body: JSON.stringify({ street: 'New St' }) });
    const res = await updateAddressHandler(event);
    expect(res.statusCode).toBe(400);
  });

  test('400 when no update fields provided', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: ADDRESS_ID }, error: null });
    const event = makeEvent({ body: JSON.stringify({}) });
    const res = await updateAddressHandler(event);
    expect(res.statusCode).toBe(400);
  });
});

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
      makeEvent({ pathParameters: { addressId: 'bad' } })
    );
    expect(res.statusCode).toBe(400);
  });
});