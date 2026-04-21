import { updateOrganisation } from '../organisation';
import { updateOrganisationHandler } from '../handlers/updateOrganisation';
import * as userHelper from '../userHelper';
import * as orgPermissions from '../orgPermissions';
import { supabase } from '../supabase';
import { InvalidInput, InvalidBusinessName, UnauthorisedError } from '../throwError';
import { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../userHelper');
jest.mock('../orgPermissions');
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    neq: jest.fn(),
    maybeSingle: jest.fn(),
    update: jest.fn(),
  },
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedPerms = orgPermissions as jest.Mocked<typeof orgPermissions>;
const db = supabase as never as {
  from: jest.Mock; select: jest.Mock; eq: jest.Mock;
  neq: jest.Mock; maybeSingle: jest.Mock; update: jest.Mock;
};

const mockSession = 'valid-session';
const mockUserId  = 123;
const mockOrgId   = 456;

beforeEach(() => {
  jest.resetAllMocks();
  db.from.mockReturnThis();
  db.select.mockReturnThis();
  db.update.mockReturnThis();
  db.eq.mockReturnThis();
  db.neq.mockReturnThis();

  mockedUserHelper.getUserIdFromSession.mockResolvedValue(mockUserId);
  mockedPerms.requireOrgAdminOrOwner.mockResolvedValue(undefined);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Backend: updateOrganisation', () => {
  test('successfully updates organisation', async () => {
    // duplicate name check: no duplicate (select.eq.neq.maybeSingle)
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // address exists
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: 2 }, error: null });

    const res = await updateOrganisation(mockSession, mockOrgId, 'Updated Name', 2);
    expect(res).toEqual({ orgId: mockOrgId });
    expect(mockedPerms.requireOrgAdminOrOwner).toHaveBeenCalledWith(mockUserId, mockOrgId);
    expect(db.update).toHaveBeenCalledWith({ orgName: 'Updated Name', addressId: 2 });
  });

  test('throws UnauthorisedError when caller does not have ADMIN or OWNER role', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(
      new UnauthorisedError('Admin or owner permissions are required')
    );
    await expect(updateOrganisation(mockSession, mockOrgId, 'Updated Name', 2))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidBusinessName on duplicate name', async () => {
    // duplicate check returns a different org with same name
    db.maybeSingle.mockResolvedValueOnce({ data: { orgId: 999 }, error: null });
    await expect(updateOrganisation(mockSession, mockOrgId, 'Taken Name', 2))
      .rejects.toThrow('already exists');
  });

  test('throws InvalidInput if new addressId does not exist', async () => {
    // dup check: no duplicate
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // address: not found
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateOrganisation(mockSession, mockOrgId, 'Updated Name', 99))
      .rejects.toThrow(InvalidInput);
  });

  test('throws InvalidBusinessName for invalid name characters', async () => {
    await expect(updateOrganisation(mockSession, mockOrgId, 'Bad@Name!', 2))
      .rejects.toThrow(InvalidBusinessName);
  });
});

describe('Lambda: updateOrganisationHandler', () => {
  test('returns 200 on success', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })               // no dup
      .mockResolvedValueOnce({ data: { addressID: 2 }, error: null });  // address exists

    const event = {
      headers: { session: mockSession },
      pathParameters: { orgId: String(mockOrgId) },
      body: JSON.stringify({ orgName: 'Updated Name', addressId: 2 })
    } as unknown as APIGatewayProxyEvent;

    const res = await updateOrganisationHandler(event);
    expect(res.statusCode).toBe(200);
  });

  test('returns 401 when caller lacks ADMIN/OWNER role', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(
      new UnauthorisedError('Admin or owner permissions are required')
    );
    const event = {
      headers: { session: mockSession },
      pathParameters: { orgId: String(mockOrgId) },
      body: JSON.stringify({ orgName: 'Updated Name', addressId: 2 })
    } as unknown as APIGatewayProxyEvent;

    const res = await updateOrganisationHandler(event);
    expect(res.statusCode).toBe(401);
  });
});