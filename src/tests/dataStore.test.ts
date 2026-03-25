import { createOrderSupaPush, getOrderByIdSupa } from '../dataStore';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn()
  }
}));

const mockedSupabase = supabase as any;

describe('DataStore Supabase Error Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createOrderSupaPush throws when address insert fails', async () => {
    // Force the mock to return an error for the address insertion
    mockedSupabase.single.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database connection lost' }
    });

    // We expect the function to crash and throw the error we just simulated
    await expect(
      createOrderSupaPush({} as any, '123 Fake St', {} as any, [])
    ).rejects.toEqual({ message: 'Database connection lost' });
  });
});