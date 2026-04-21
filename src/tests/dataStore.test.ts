/**
 * dataStore.test.ts
 *
 * Mocking strategy: deep mock of the Supabase client via jest.mock.
 * Every Supabase method is a jest.fn() returning `this` by default so we can
 * chain calls freely. Terminal methods (single, maybeSingle, eq, remove, etc.)
 * are overridden per-test with mockResolvedValueOnce.
 *
 * We also mock generateUBL so deleteOrderSupa can run without UBL side effects.
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
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
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

const mock = supabase as never;

beforeEach(() => jest.clearAllMocks());


// Local data

describe('Local data helpers', () => {
  test('getData returns empty data structure', () => {
    const d = getData();
    expect(d).toHaveProperty('users');
    expect(d).toHaveProperty('orders');
  });

  test('clearData calls delete on all tables', async () => {
    mock.neq.mockResolvedValue({});
    await clearData();
    expect(supabase.from).toHaveBeenCalledWith('order_lines');
    expect(supabase.from).toHaveBeenCalledWith('orders');
    expect(supabase.from).toHaveBeenCalledWith('contacts');
  });
});


// createOrderSupaPush

describe('createOrderSupaPush', () => {
  const mockOrder = { orderId: 'uuid', currency: 'AUD', finalPrice: 100 } as never;
  const period = { startDateTime: 100, endDateTime: 200 };
  const items = [{ name: 'Bread', unitPrice: 5, description: 'Loaf', quantity: 1 }];

  test('pushes full order sequence successfully', async () => {
    mock.insert
      .mockReturnValueOnce(mock) // address insert chain
      .mockResolvedValueOnce({ error: null }) // order insert
      .mockResolvedValueOnce({ error: null }) // delivery insert
      .mockReturnValueOnce(mock) // item insert chain
      .mockResolvedValueOnce({ error: null }); // order_lines insert

    mock.single
      .mockResolvedValueOnce({ data: { addressID: 1 }, error: null }) // address
      .mockResolvedValueOnce({ data: { itemId: 101 }, error: null }); // item

    await expect(createOrderSupaPush(mockOrder, '123 Fake St', period, items))
      .resolves.not.toThrow();
  });

  test('throws if address insertion fails', async () => {
    mock.insert.mockReturnValueOnce(mock);
    mock.single.mockResolvedValueOnce({ data: null, error: { message: 'Address error' } });
    await expect(createOrderSupaPush(mockOrder, '123 Fake St', period, items))
      .rejects.toEqual({ message: 'Address error' });
  });

  test('throws if order insertion fails', async () => {
    mock.insert
      .mockReturnValueOnce(mock)
      .mockResolvedValueOnce({ error: { message: 'Order DB Error' } });
    mock.single.mockResolvedValueOnce({ data: { addressID: 1 }, error: null });
    await expect(createOrderSupaPush(mockOrder, '123 Fake St', period, items))
      .rejects.toThrow('Order Table Error: Order DB Error');
  });
});


// getOrderByIdSupa

describe('getOrderByIdSupa', () => {
  test('returns null for invalid UUID', async () => {
    expect(await getOrderByIdSupa('not-a-uuid')).toBeNull();
  });

  test('returns order data on success', async () => {
    const mockOrder = { orderId: '550e8400-e29b-41d4-a716-446655440000', status: 'OPEN' };
    mock.maybeSingle.mockResolvedValueOnce({ data: mockOrder, error: null });
    expect(await getOrderByIdSupa('550e8400-e29b-41d4-a716-446655440000')).toEqual(mockOrder);
  });

  test('treats PGRST116 as null (no rows found)', async () => {
    mock.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    expect(await getOrderByIdSupa('550e8400-e29b-41d4-a716-446655440000')).toBeNull();
  });

  test('re-throws other Supabase errors', async () => {
    mock.maybeSingle.mockResolvedValueOnce({ 
      data: null, error: { code: 'OTHER', message: 'Fatal' } 
    });
    await expect(getOrderByIdSupa('550e8400-e29b-41d4-a716-446655440000'))
      .rejects.toEqual({ code: 'OTHER', message: 'Fatal' });
  });
});


// getUserByIdSupa / getOrgByUserId / createOrganisationSupa

describe('User and Org helpers', () => {
  test('getUserByIdSupa returns contact data', async () => {
    mock.maybeSingle.mockResolvedValueOnce({ data: { contactId: 1 }, error: null });
    expect(await getUserByIdSupa(1)).toEqual({ contactId: 1 });
  });

  test('getOrgByUserId returns org data for owner', async () => {
    mock.single.mockResolvedValueOnce({ data: { orgId: 100 }, error: null });
    expect(await getOrgByUserId(1)).toEqual({ data: { orgId: 100 }, error: null });
  });

  test('createOrganisationSupa inserts org and owner member row', async () => {
    mock.single.mockResolvedValueOnce({ data: { orgId: 1 }, error: null });
    // second insert (organisation_members) — just needs to not throw
    mock.insert.mockResolvedValueOnce({ error: null });

    const res = await createOrganisationSupa(1, 'John');
    expect(res).toEqual({ orgId: 1 });
    // ensure organisation_members insert was called
    expect(mock.insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'OWNER' })])
    );
  });

  test('createOrganisationSupa throws InvalidSupabase on org insert error', async () => {
    mock.single.mockResolvedValueOnce({ data: null, error: { message: 'Org failed' } });
    await expect(createOrganisationSupa(1, 'John')).rejects.toThrow(InvalidSupabase);
  });
});


// getUserRoleInOrg

describe('getUserRoleInOrg', () => {
  test('returns null if org does not exist', async () => {
    mock.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); // org check
    expect(await getUserRoleInOrg(1, 99)).toBeNull();
  });

  test('returns OWNER when user is the org contact', async () => {
    mock.maybeSingle.mockResolvedValueOnce({ data: { contactId: 1 }, error: null });
    expect(await getUserRoleInOrg(1, 10)).toBe('OWNER');
  });

  test('returns ADMIN when found in organisation_members with ADMIN role', async () => {
    mock.maybeSingle
      // org owner is 999
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null })
      // member row
      .mockResolvedValueOnce({ data: { role: 'ADMIN' }, error: null });
    expect(await getUserRoleInOrg(1, 10)).toBe('ADMIN');
  });

  test('returns MEMBER when found in organisation_members with MEMBER role', async () => {
    mock.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null })
      .mockResolvedValueOnce({ data: { role: 'MEMBER' }, error: null });
    expect(await getUserRoleInOrg(1, 10)).toBe('MEMBER');
  });

  test('returns null when user is not owner and not in organisation_members', async () => {
    mock.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    expect(await getUserRoleInOrg(1, 10)).toBeNull();
  });
});


// updateOrderStatus / updateOrderSupa

describe('updateOrderStatus and updateOrderSupa', () => {
  test('updateOrderStatus succeeds', async () => {
    mock.eq.mockResolvedValueOnce({ data: { status: 'CLOSED' }, error: null });
    expect(await updateOrderStatus('uuid', 'CLOSED')).toEqual({ status: 'CLOSED' });
  });

  test('updateOrderStatus throws InvalidSupabase on error', async () => {
    mock.eq.mockResolvedValueOnce({ data: null, error: { message: 'Update failed' } });
    await expect(updateOrderStatus('uuid', 'CLOSED')).rejects.toThrow(InvalidSupabase);
  });

  test('updateOrderSupa updates order, delivery and address', async () => {
    mock.eq
      .mockResolvedValueOnce({ data: {}, error: null }) // order update
      .mockReturnValueOnce(mock) // delivery chain
      .mockResolvedValueOnce({ data: {}, error: null }); // addr update
    mock.single.mockResolvedValueOnce({ data: { deliveryAddressID: 99 }, error: null });

    await expect(updateOrderSupa('uuid', 'New St', { startDateTime: 1, endDateTime: 2 }, 'CLOSED'))
      .resolves.not.toThrow();
  });

  test('updateOrderSupa throws if order update fails', async () => {
    mock.eq
      .mockResolvedValueOnce({ error: { message: 'Order update fail' } })
      .mockReturnValueOnce(mock);
    mock.single.mockResolvedValueOnce({ data: { deliveryAddressID: 99 }, error: null });

    await expect(updateOrderSupa('uuid', 'New St', { startDateTime: 1, endDateTime: 2 }, 'CLOSED'))
      .rejects.toEqual({ message: 'Order update fail' });
  });
});


// deleteOrderSupa

describe('deleteOrderSupa', () => {
  test('deletes UBL and order successfully', async () => {
    mock.storage.remove.mockResolvedValueOnce({ data: {}, error: null });
    mock.eq.mockResolvedValueOnce({ data: {}, error: null });
    await expect(deleteOrderSupa('uuid')).resolves.not.toThrow();
  });

  test('throws if UBL storage delete fails', async () => {
    mock.storage.remove.mockResolvedValueOnce({ data: null, error: { message: 'Storage error' } });
    await expect(deleteOrderSupa('uuid')).rejects.toEqual({ message: 'Storage error' });
  });

  test('throws if order DB delete fails', async () => {
    mock.storage.remove.mockResolvedValueOnce({ data: {}, error: null });
    mock.eq.mockResolvedValueOnce({ data: null, error: { message: 'DB delete error' } });
    await expect(deleteOrderSupa('uuid')).rejects.toEqual({ message: 'DB delete error' });
  });
});