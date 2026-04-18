import { deleteOrganisation } from '../organisation';
import { deleteOrganisationHandler } from '../handlers/deleteOrganisation';
import * as userHelper from '../userHelper';
import { supabase } from '../supabase';
import { InvalidInput } from '../throwError';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { SupabaseMock } from '../interfaces';

jest.mock('../userHelper');
const mockDeleteEq = jest.fn();
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    maybeSingle: jest.fn(),
    // Delete returns a custom object with its own eq that resolves
    delete: jest.fn().mockReturnValue({ eq: mockDeleteEq }), 
  }
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedSupabase = supabase as unknown as SupabaseMock;

describe('Backend: deleteOrganisation', () => {
  const mockSession = 'valid-session';
  const mockUserId = 123;
  const mockOrgId = 456;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(mockUserId);
  });

  test('successfully deletes organisation', async () => {
    // mock org ownership check
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { orgId: mockOrgId, contactId: mockUserId }, error: null 
    });
    // mock orders check (returns empty array meaning no orders exist)
    mockedSupabase.limit.mockResolvedValueOnce({ data: [], error: null });
    // mock final delete execution
    mockDeleteEq.mockResolvedValueOnce({ error: null }); 

    const res = await deleteOrganisation(mockSession, mockOrgId);
    expect(res).toEqual({});
    expect(mockedSupabase.delete).toHaveBeenCalled();
  });

  test('throws InvalidInput if organisation does not exist', async () => {
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(deleteOrganisation(mockSession, mockOrgId))
      .rejects.toThrow(InvalidInput);
  });

  test('throws InvalidInput if orders are still attached', async () => {
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { orgId: mockOrgId, contactId: mockUserId }, error: null 
    });
    // Mock finding an existing order attached to this org
    mockedSupabase.limit.mockResolvedValueOnce({ data: [{ orderId: 'order-123' }], error: null });

    await expect(deleteOrganisation(mockSession, mockOrgId)).rejects.toThrow(InvalidInput);
    expect(mockedSupabase.delete).not.toHaveBeenCalled();
  });
});

describe('Lambda: deleteOrganisationHandler', () => {
  test('returns 200 on success', async () => {
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(123);
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { orgId: 456, contactId: 123 }, error: null 
    });
    mockedSupabase.limit.mockResolvedValueOnce({ data: [], error: null });
    mockDeleteEq.mockResolvedValueOnce({ error: null });

    const event = {
      headers: { session: 'valid-session' },
      pathParameters: { orgId: '456' },
    } as unknown as APIGatewayProxyEvent;

    const res = await deleteOrganisationHandler(event);
    expect(res.statusCode).toBe(200);
  });
});