/**
 * dataStore.test.ts
 *
 * KEY RULES for this mock approach:
 *
 * 1. `jest.resetAllMocks()` in beforeEach — unlike clearAllMocks(), this also
 *    clears the mockResolvedValueOnce / mockReturnValueOnce queues, so stale
 *    values from a failed test never bleed into the next test.
 *
 * 2. Re-setup mockReturnThis() for every NON-TERMINAL chain method after reset.
 *    Terminal methods (single, maybeSingle, limit, remove) are left without a
 *    default so tests must set them explicitly — a missing mock is a loud failure,
 *    not a silent undefined.
 *
 * 3. NEVER put mockResolvedValueOnce on a non-terminal chain method (e.g. insert
 *    when it is followed by .select().single()). Doing so makes that call return a
 *    Promise instead of `this`, breaking the chain for the next call.
 *
 * 4. For standalone awaited insert/delete/update (no further chaining), the default
 *    mockReturnThis() is fine: `await mockObject` resolves to the mock object whose
 *    .error property is undefined (falsy) → no error thrown.
 */

import {
  clearData, getData, createOrderSupaPush, getOrderByIdSupa,
  getUserByIdSupa, updateOrderStatus, updateOrderSupa,
  deleteOrderSupa, getOrgByUserId, createOrganisationSupa,
  getUserRoleInOrg,
} from '../dataStore';
import { supabase } from '../supabase';
import { InvalidSupabase } from '../throwError';

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    neq: jest.fn(),
    in: jest.fn(),
    or: jest.fn(),
    limit: jest.fn(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
    storage: {
      from: jest.fn().mockReturnThis(),
      remove: jest.fn(),
    },
  },
}));

jest.mock('../generateUBL', () => ({
  UBLBucket: 'UBL Order Documents',
  generateUBLOrderFilePath: jest.fn().mockResolvedValue('UBLOrders/test-uuid'),
}));

const db = supabase as never as {
  from: jest.Mock; select: jest.Mock; insert: jest.Mock; update: jest.Mock;
  delete: jest.Mock; eq: jest.Mock; neq: jest.Mock; in: jest.Mock;
  or: jest.Mock; limit: jest.Mock; single: jest.Mock; maybeSingle: jest.Mock;
  storage: { from: jest.Mock; remove: jest.Mock };
};

// Re-apply mockReturnThis() on all NON-TERMINAL chain methods after each reset.
function setupChainDefaults() {
  db.from.mockReturnThis();
  db.select.mockReturnThis();
  db.insert.mockReturnThis();
  db.update.mockReturnThis();
  db.delete.mockReturnThis();
  db.eq.mockReturnThis();
  db.neq.mockReturnThis();
  db.in.mockReturnThis();
  db.or.mockReturnThis();
  db.limit.mockReturnThis(); // overridden per-test when terminal
}

beforeEach(() => {
  jest.resetAllMocks();   // clears call records AND the mockResolvedValueOnce queues
  setupChainDefaults();
});

// ---------------------------------------------------------------------------
// Local data helpers
// ---------------------------------------------------------------------------
describe('Local data helpers', () => {
  test('getData returns empty data structure', () => {
    const d = getData();
    expect(d).toHaveProperty('users');
    expect(d).toHaveProperty('orders');
  });

  test('clearData calls delete on all expected tables', async () => {
    // neq is used as the terminal "delete everything" call; its return value
    // doesn't matter for clearData (no error check), so mockReturnThis() is fine.
    await clearData();
    expect(supabase.from).toHaveBeenCalledWith('order_lines');
    expect(supabase.from).toHaveBeenCalledWith('orders');
    expect(supabase.from).toHaveBeenCalledWith('contacts');
  });
});

// ---------------------------------------------------------------------------
// createOrderSupaPush
// ---------------------------------------------------------------------------
describe('createOrderSupaPush', () => {
  const mockOrder = { orderId: 'uuid', currency: 'AUD', finalPrice: 100 } as never;
  const period = { startDateTime: 100, endDateTime: 200 };
  const items = [{ name: 'Bread', unitPrice: 5, description: 'Loaf', quantity: 1 }];

  test('pushes full order sequence successfully', async () => {
    // address insert chain: from().insert().select().single()
    db.single
      .mockResolvedValueOnce({ data: { addressID: 1 }, error: null })  // address
      .mockResolvedValueOnce({ data: { itemId: 101 }, error: null });   // item

    // order insert (standalone await, no chain) — default mockReturnThis is fine
    // delivery insert (standalone await) — default mockReturnThis is fine
    // order_lines insert (standalone await) — default mockReturnThis is fine

    await expect(createOrderSupaPush(mockOrder, '123 Fake St', period, items))
      .resolves.not.toThrow();
  });

  test('throws if address insertion fails', async () => {
    db.single.mockResolvedValueOnce({ data: null, error: { message: 'Address error' } });
    await expect(createOrderSupaPush(mockOrder, '123 Fake St', period, items))
      .rejects.toEqual({ message: 'Address error' });
  });

  test('throws if order insertion fails', async () => {
    // address succeeds
    db.single.mockResolvedValueOnce({ data: { addressID: 1 }, error: null });
    // order insert is standalone (no chain), so mockReturnThis returns the mock object.
    // We need to make the order insert specifically fail. We override insert once:
    db.insert
      .mockReturnValueOnce(db)                                         // address insert chain continues
      .mockResolvedValueOnce({ error: { message: 'Order DB Error' } }); // order insert is standalone

    await expect(createOrderSupaPush(mockOrder, '123 Fake St', period, items))
      .rejects.toThrow('Order Table Error: Order DB Error');
  });
});

// ---------------------------------------------------------------------------
// getOrderByIdSupa
// ---------------------------------------------------------------------------
describe('getOrderByIdSupa', () => {
  test('returns null for invalid UUID', async () => {
    expect(await getOrderByIdSupa('not-a-uuid')).toBeNull();
  });

  test('returns order data on success', async () => {
    const mockOrder = { orderId: '550e8400-e29b-41d4-a716-446655440000', status: 'OPEN' };
    db.maybeSingle.mockResolvedValueOnce({ data: mockOrder, error: null });
    expect(await getOrderByIdSupa('550e8400-e29b-41d4-a716-446655440000')).toEqual(mockOrder);
  });

  test('treats PGRST116 as null (no rows found)', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    expect(await getOrderByIdSupa('550e8400-e29b-41d4-a716-446655440000')).toBeNull();
  });

  test('re-throws other Supabase errors', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: 'OTHER', message: 'Fatal' } });
    await expect(getOrderByIdSupa('550e8400-e29b-41d4-a716-446655440000'))
      .rejects.toEqual({ code: 'OTHER', message: 'Fatal' });
  });
});

// ---------------------------------------------------------------------------
// getUserByIdSupa / getOrgByUserId / createOrganisationSupa
// ---------------------------------------------------------------------------
describe('User and Org helpers', () => {
  test('getUserByIdSupa returns contact data', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { contactId: 1 }, error: null });
    expect(await getUserByIdSupa(1)).toEqual({ contactId: 1 });
  });

  test('getOrgByUserId returns org data for owner', async () => {
    db.single.mockResolvedValueOnce({ data: { orgId: 100 }, error: null });
    expect(await getOrgByUserId(1)).toEqual({ data: { orgId: 100 }, error: null });
  });

  test('createOrganisationSupa inserts org then adds owner to organisation_members', async () => {
    // Chain: from('orgs').insert([...]).select().single()  — single is terminal
    db.single.mockResolvedValueOnce({ data: { orgId: 1 }, error: null });
    // Chain: from('org_members').insert([...])            — standalone, mockReturnThis is fine

    const res = await createOrganisationSupa(1, 'John');
    expect(res).toEqual({ orgId: 1 });
    // The owner row must have been inserted with role OWNER
    expect(db.insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'OWNER' })])
    );
  });

  test('createOrganisationSupa throws InvalidSupabase when org insert errors', async () => {
    db.single.mockResolvedValueOnce({ data: null, error: { message: 'Org failed' } });
    await expect(createOrganisationSupa(1, 'John')).rejects.toThrow(InvalidSupabase);
  });
});

// ---------------------------------------------------------------------------
// getUserRoleInOrg
// ---------------------------------------------------------------------------
describe('getUserRoleInOrg', () => {
  test('returns null if org does not exist', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await getUserRoleInOrg(1, 99)).toBeNull();
  });

  test('returns OWNER when user is the org contactId', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { contactId: 1 }, error: null });
    expect(await getUserRoleInOrg(1, 10)).toBe('OWNER');
  });

  test('returns ADMIN when found in organisation_members with ADMIN role', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null }) // org: owner is 999
      .mockResolvedValueOnce({ data: { role: 'ADMIN' }, error: null });  // member row
    expect(await getUserRoleInOrg(1, 10)).toBe('ADMIN');
  });

  test('returns MEMBER when found in organisation_members with MEMBER role', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null })
      .mockResolvedValueOnce({ data: { role: 'MEMBER' }, error: null });
    expect(await getUserRoleInOrg(1, 10)).toBe('MEMBER');
  });

  test('returns null when user is not owner and not in organisation_members', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    expect(await getUserRoleInOrg(1, 10)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateOrderStatus / updateOrderSupa
// ---------------------------------------------------------------------------
describe('updateOrderStatus and updateOrderSupa', () => {
  test('updateOrderStatus succeeds', async () => {
    // from('orders').update().eq() — eq is terminal
    db.eq.mockResolvedValueOnce({ data: { status: 'CLOSED' }, error: null });
    expect(await updateOrderStatus('uuid', 'CLOSED')).toEqual({ status: 'CLOSED' });
  });

  test('updateOrderStatus throws InvalidSupabase on error', async () => {
    db.eq.mockResolvedValueOnce({ data: null, error: { message: 'Update failed' } });
    await expect(updateOrderStatus('uuid', 'CLOSED')).rejects.toThrow(InvalidSupabase);
  });

  test('updateOrderSupa updates order, delivery and address successfully', async () => {
    // Promise.all runs two chains concurrently:
    //   A) from('orders').update().eq()          — eq terminal, default mockReturnThis → error=undefined ✓
    //   B) from('deliveries').update().eq().select().single() — single terminal
    // Then:
    //   C) from('addresses').update().eq()       — eq terminal, default mockReturnThis → error=undefined ✓

    db.single.mockResolvedValueOnce({ data: { deliveryAddressID: 99 }, error: null });
    await expect(updateOrderSupa('uuid', 'New St', { startDateTime: 1, endDateTime: 2 }, 'CLOSED'))
      .resolves.not.toThrow();
  });

  test('updateOrderSupa throws when delivery update single returns an error', async () => {
    // Simulate the delivery query failing (single returns an error object)
    db.single.mockResolvedValueOnce({ data: null, error: { message: 'delivery error' } });
    await expect(updateOrderSupa('uuid', 'New St', { startDateTime: 1, endDateTime: 2 }, 'CLOSED'))
      .rejects.toEqual({ message: 'delivery error' });
  });
});

// ---------------------------------------------------------------------------
// deleteOrderSupa
// ---------------------------------------------------------------------------
describe('deleteOrderSupa', () => {
  test('deletes UBL and order successfully', async () => {
    // storage.remove: terminal
    db.storage.remove.mockResolvedValueOnce({ data: {}, error: null });
    // from('orders').delete().eq() — eq terminal, default mockReturnThis → error=undefined ✓
    await expect(deleteOrderSupa('uuid')).resolves.not.toThrow();
  });

  test('throws if UBL storage delete fails', async () => {
    db.storage.remove.mockResolvedValueOnce({ data: null, error: { message: 'Storage error' } });
    await expect(deleteOrderSupa('uuid')).rejects.toEqual({ message: 'Storage error' });
  });

  test('throws if order DB delete fails', async () => {
    db.storage.remove.mockResolvedValueOnce({ data: {}, error: null });
    // Override eq to return an error for the delete terminal call
    db.eq.mockResolvedValueOnce({ data: null, error: { message: 'DB delete error' } });
    await expect(deleteOrderSupa('uuid')).rejects.toEqual({ message: 'DB delete error' });
  });
});