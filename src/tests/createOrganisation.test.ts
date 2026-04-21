import { createOrganisation } from '../organisation';
import { createOrganisationHandler } from '../handlers/createOrganisation';
import * as userHelper from '../userHelper';
import { supabase } from '../supabase';
import { InvalidInput, InvalidBusinessName, UnauthorisedError } from '../throwError';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { SupabaseMock } from '../interfaces';

jest.mock('../userHelper');
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
  }
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedSupabase = supabase as unknown as SupabaseMock;

describe('Backend: createOrganisation', () => {
  const mockSession = 'valid-session';
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(123);
  });

  test('successfully creates organisation', async () => {
    // 1. duplicate name check: none found
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // 2. address exists check
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ data: { addressID: 1 }, error: null });
    // 3. insert success
    mockedSupabase.single.mockResolvedValueOnce({ data: { orgId: 999 }, error: null });

    const res = await createOrganisation(mockSession, 'Valid Name', 1);
    expect(res).toEqual({ orgId: 999 });
    expect(mockedSupabase.insert).toHaveBeenCalled();
  });

  test('throws UnauthorisedError on invalid session', async () => {
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(null as never);
    await expect(createOrganisation('bad', 'Name', 1)).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidBusinessName on special characters', async () => {
    await expect(createOrganisation(mockSession, 'Bad@Name', 1))
      .rejects.toThrow(InvalidBusinessName);
  });

  test('throws InvalidBusinessName on duplicate name', async () => {
    // duplicate check returns an existing org
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ data: { orgId: 77 }, error: null });
    await expect(createOrganisation(mockSession, 'Taken Name', 1))
      .rejects.toThrow('already exists');
  });

  test('throws InvalidInput if addressId does not exist', async () => {
    // duplicate check: no duplicate
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // address check: not found
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(createOrganisation(mockSession, 'Valid Name', 99)).rejects.toThrow(InvalidInput);
  });
});

describe('Lambda: createOrganisationHandler', () => {
  test('returns 200 on success', async () => {
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(123);
    // dup check + address check + insert
    mockedSupabase.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { addressID: 1 }, error: null });
    mockedSupabase.single.mockResolvedValueOnce({ data: { orgId: 999 }, error: null });

    const event = {
      headers: { session: 'valid-session' },
      body: JSON.stringify({ orgName: 'Valid Name', addressId: 1 })
    } as unknown as APIGatewayProxyEvent;

    const res = await createOrganisationHandler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ orgId: 999 });
  });

  test('returns 401 if session header is missing', async () => {
    const event = { headers: {}, body: '{}' } as unknown as APIGatewayProxyEvent;
    const res = await createOrganisationHandler(event);
    expect(res.statusCode).toBe(401);
  });
});