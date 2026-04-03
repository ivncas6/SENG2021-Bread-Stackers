import { createOrderSupaPush, getOrderByIdSupa } from '../dataStore';
import { supabase } from '../supabase';

// Deep mock of the Supabase client
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  }
}));

describe('DataStore Supabase Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getOrderByIdSupa returns an order on success', async () => {
    const mockOrderData = { orderId: 'test-uuid', status: 'OPEN' };
    
    // Mock the resolution of the chained promise
    (supabase.from('').select('').maybeSingle as jest.Mock).mockResolvedValueOnce({ 
      data: mockOrderData, 
      error: null 
    });

    const result = await getOrderByIdSupa('550e8400-e29b-41d4-a716-446655440000');
    expect(supabase.from).toHaveBeenCalledWith('orders');
    expect(result).toEqual(mockOrderData);
  });

  test('createOrderSupaPush successfully pushes an order sequence', async () => {
    // Mock sequential address and item inserts
    (supabase.from('').select('').single as jest.Mock)
      .mockResolvedValueOnce({ data: { addressID: 1 }, error: null }) // Address insert
      .mockResolvedValueOnce({ data: { itemId: 101 }, error: null }); // Item insert

    const mockOrder = { orderId: 'uuid', currency: 'AUD', finalPrice: 100 } as never;
    const mockPeriod = { startDateTime: 100, endDateTime: 200 };
    const mockItems = [{ name: 'Bread', unitPrice: 5, description: 'Loaf', quantity: 1 }];

    await expect(createOrderSupaPush(mockOrder, 
      '123 Fake St', mockPeriod, mockItems)).resolves.not.toThrow();
    
    expect(supabase.from).toHaveBeenCalledWith('addresses');
    expect(supabase.from).toHaveBeenCalledWith('orders');
    expect(supabase.from).toHaveBeenCalledWith('deliveries');
    expect(supabase.from).toHaveBeenCalledWith('items');
    expect(supabase.from).toHaveBeenCalledWith('order_lines');
  });
});