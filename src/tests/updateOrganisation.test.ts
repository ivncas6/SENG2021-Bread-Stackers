import { updateOrganisation } from '../organisation';
import { updateOrganisationHandler } from '../handlers/updateOrganisation';
import * as userHelper from '../userHelper';
import { supabase } from '../supabase';
import { InvalidInput, UnauthorisedError } from '../throwError';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { SupabaseMock } from '../interfaces';

jest.mock('../userHelper');
const mockUpdateEq = jest.fn();
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(), // Returns this for chaining maybeSingle
    maybeSingle: jest.fn(),
    // Update returns a custom object with its own eq that resolves
    update: jest.fn().mockReturnValue({ eq: mockUpdateEq }), 
  }
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedSupabase = supabase as unknown as SupabaseMock;

describe('Backend: updateOrganisation', () => {
  const mockSession = 'valid-session';
  const mockUserId = 123;
  const mockOrgId = 456;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(mockUserId);
  });

  test('successfully updates organisation', async () => {
    // mock org ownership check
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { orgId: mockOrgId, contactId: mockUserId }, error: null 
    });
    // mock address validation
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { addressID: 2 }, error: null 
    });
    // mock final update execution
    // this resolves the final .eq('orgId', orgId) on the update
    mockUpdateEq.mockResolvedValueOnce({ error: null });
    const res = await updateOrganisation(mockSession, mockOrgId, 'Updated Name', 2);
    expect(res).toEqual({ orgId: mockOrgId });
    expect(mockedSupabase.update).toHaveBeenCalledWith({ orgName: 'Updated Name', addressId: 2 });
  });

  test('throws UnauthorisedError if user does not own organisation', async () => {
    // mock org ownership check returning a different contactId
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { orgId: mockOrgId, contactId: 999 }, error: null 
    });
    
    await expect(updateOrganisation(mockSession, mockOrgId, 'Updated Name', 2))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidInput if new addressId does not exist', async () => {
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { orgId: mockOrgId, contactId: mockUserId }, error: null 
    });
    // address check fails
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(updateOrganisation(mockSession, mockOrgId, 'Updated Name', 99))
      .rejects.toThrow(InvalidInput);
  });
});

describe('Lambda: updateOrganisationHandler', () => {
  test('returns 200 on success', async () => {
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(123);
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { orgId: 456, contactId: 123 }, error: null 
    });
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { addressID: 2 }, error: null 
    });
    mockUpdateEq.mockResolvedValueOnce({ error: null });

    const event = {
      headers: { session: 'valid-session' },
      pathParameters: { orgId: '456' },
      body: JSON.stringify({ orgName: 'Updated Name', addressId: 2 })
    } as unknown as APIGatewayProxyEvent;

    const res = await updateOrganisationHandler(event);
    expect(res.statusCode).toBe(200);
  });
});