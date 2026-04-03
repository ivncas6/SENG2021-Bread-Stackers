import { 
  clearData, getData, createOrderSupaPush, getOrderByIdSupa, 
  getUserByIdSupa, updateOrderStatus, updateOrderSupa, 
  deleteOrderSupa, getOrgByUserId, createOrganisationSupa 
} from '../dataStore';
import { supabase } from '../supabase';
import { InvalidSupabase } from '../throwError';

// deep mock of the Supabase client
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    storage: {
      from: jest.fn().mockReturnThis(),
      remove: jest.fn().mockReturnThis()
    }
  }
}));

// Mock of UBL file path generator
jest.mock('../generateUBL', () => ({
  UBLBucket: 'UBL Order Documents',
  generateUBLOrderFilePath: jest.fn().mockResolvedValue('UBLOrders/test-uuid')
}));

const mockSupabase = supabase as any;

describe('DataStore Methods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Local Data', () => {
    test('getData returns the default empty data structure', () => {
      const data = getData();
      expect(data).toHaveProperty('users');
      expect(data).toHaveProperty('orders');
    });

    test('clearData correctly calls supabase delete chains', async () => {
      mockSupabase.neq.mockResolvedValueOnce({}); // order_lines
      await clearData();
      expect(supabase.from).toHaveBeenCalledWith('order_lines');
      expect(supabase.from).toHaveBeenCalledWith('orders');
      expect(supabase.from).toHaveBeenCalledWith('contacts');
    });
  });

  describe('createOrderSupaPush', () => {
    const mockOrder = { orderId: 'uuid', currency: 'AUD', finalPrice: 100 } as never;
    const mockPeriod = { startDateTime: 100, endDateTime: 200 };
    const mockItems = [{ name: 'Bread', unitPrice: 5, description: 'Loaf', quantity: 1 }];

    test('successfully pushes an order sequence', async () => {
      // Address insert, Order insert (no data needed), Delivery insert (no data), Item insert
      mockSupabase.single
        .mockResolvedValueOnce({ data: { addressID: 1 }, error: null }) // address
        .mockResolvedValueOnce({ data: { itemId: 101 }, error: null }); // item
      
      mockSupabase.insert
        .mockResolvedValueOnce({ error: null }) // address
        .mockResolvedValueOnce({ error: null }) // order
        .mockResolvedValueOnce({ error: null }) // delivery
        .mockResolvedValueOnce({ error: null }); // item

      await expect(createOrderSupaPush(mockOrder, '123 Fake St', mockPeriod, mockItems)).resolves.not.toThrow();
    });

    test('throws if address insertion fails', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { message: 'Address error' } });
      await expect(createOrderSupaPush(mockOrder, '123 Fake St', mockPeriod, mockItems)).rejects.toEqual({ message: 'Address error' });
    });

    test('throws if order insertion fails', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { addressID: 1 }, error: null });
      // Supabase insert chain for order returns error
      mockSupabase.insert
        .mockReturnThis() // address
        .mockResolvedValueOnce({ error: { message: 'Order DB Error' } }); // order

      await expect(createOrderSupaPush(mockOrder, '123 Fake St', mockPeriod, mockItems)).rejects.toThrow('Order Table Error: Order DB Error');
    });
  });

  describe('getOrderByIdSupa', () => {
    test('returns null for invalid UUID', async () => {
      const result = await getOrderByIdSupa('not-a-uuid');
      expect(result).toBeNull();
    });

    test('returns an order on success', async () => {
      const mockOrderData = { orderId: '550e8400-e29b-41d4-a716-446655440000', status: 'OPEN' };
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: mockOrderData, error: null });

      const result = await getOrderByIdSupa('550e8400-e29b-41d4-a716-446655440000');
      expect(result).toEqual(mockOrderData);
    });

    test('ignores PGRST116 (no rows) and throws other errors', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'Not found' } });
      await expect(getOrderByIdSupa('550e8400-e29b-41d4-a716-446655440000')).resolves.toBeNull();

      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: 'OTHER', message: 'Fatal DB error' } });
      await expect(getOrderByIdSupa('550e8400-e29b-41d4-a716-446655440000')).rejects.toEqual({ code: 'OTHER', message: 'Fatal DB error' });
    });
  });

  describe('getUserByIdSupa & getOrgByUserId & createOrganisationSupa', () => {
    test('getUserByIdSupa returns data', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { contactId: 1 }, error: null });
      const res = await getUserByIdSupa(1);
      expect(res).toEqual({ contactId: 1 });
    });

    test('getOrgByUserId returns data', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { orgId: 100 }, error: null });
      const res = await getOrgByUserId(1);
      expect(res).toEqual({ data: { orgId: 100 }, error: null });
    });

    test('createOrganisationSupa returns data on success', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { orgId: 1 }, error: null });
      const res = await createOrganisationSupa(1, 'John');
      expect(res).toEqual({ orgId: 1 });
    });

    test('createOrganisationSupa throws InvalidSupabase on error', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { message: 'Org failed' } });
      await expect(createOrganisationSupa(1, 'John')).rejects.toThrow(InvalidSupabase);
    });
  });

  describe('updateOrderStatus & updateOrderSupa', () => {
    test('updateOrderStatus updates successfully', async () => {
      mockSupabase.eq.mockResolvedValueOnce({ data: { status: 'CLOSED' }, error: null });
      const res = await updateOrderStatus('uuid', 'CLOSED');
      expect(res).toEqual({ status: 'CLOSED' });
    });

    test('updateOrderStatus throws on error', async () => {
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: { message: 'Update failed' } });
      await expect(updateOrderStatus('uuid', 'CLOSED')).rejects.toThrow(InvalidSupabase);
    });

    test('updateOrderSupa updates order, delivery, and address', async () => {
      // Mock Promise.all returns (orderRes, deliveryRes)
      mockSupabase.eq.mockResolvedValueOnce({ data: {}, error: null }); // order update
      mockSupabase.single.mockResolvedValueOnce({ data: { deliveryAddressID: 99 }, error: null }); // delivery update
      mockSupabase.eq.mockResolvedValueOnce({ data: {}, error: null }); // address update

      await expect(updateOrderSupa('uuid', 'New St', { startDateTime: 1, endDateTime: 2 }, 'CLOSED')).resolves.not.toThrow();
    });

    test('updateOrderSupa throws if order update fails', async () => {
      mockSupabase.eq.mockResolvedValueOnce({ error: { message: 'Order update fail' } }); // order update
      mockSupabase.single.mockResolvedValueOnce({ data: { deliveryAddressID: 99 }, error: null }); // delivery
      await expect(updateOrderSupa('uuid', 'New St', { startDateTime: 1, endDateTime: 2 }, 'CLOSED')).rejects.toEqual({ message: 'Order update fail' });
    });
  });

  describe('deleteOrderSupa', () => {
    test('successfully deletes UBL and order', async () => {
      mockSupabase.storage.remove.mockResolvedValueOnce({ data: {}, error: null });
      mockSupabase.eq.mockResolvedValueOnce({ data: {}, error: null }); // order delete
      await expect(deleteOrderSupa('uuid')).resolves.not.toThrow();
    });

    test('throws if UBL delete fails', async () => {
      mockSupabase.storage.remove.mockResolvedValueOnce({ data: null, error: { message: 'Storage error' } });
      await expect(deleteOrderSupa('uuid')).rejects.toEqual({ message: 'Storage error' });
    });

    test('throws if order delete fails', async () => {
      mockSupabase.storage.remove.mockResolvedValueOnce({ data: {}, error: null });
      mockSupabase.eq.mockResolvedValueOnce({ data: null, error: { message: 'DB delete error' } });
      await expect(deleteOrderSupa('uuid')).rejects.toEqual({ message: 'DB delete error' });
    });
  });
});