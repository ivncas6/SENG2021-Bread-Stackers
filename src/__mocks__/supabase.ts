export const supabase = {
  from: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: { contactId: 999 }, error: null }),
  delete: jest.fn().mockReturnThis(),
  neq: jest.fn().mockResolvedValue({ data: null, error: null }),
};