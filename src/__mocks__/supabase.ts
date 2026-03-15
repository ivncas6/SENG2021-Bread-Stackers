// src/__mocks__/supabase.ts
const mockChain = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  maybeSingle: jest.fn().mockReturnThis(),
};

export const supabase = mockChain;