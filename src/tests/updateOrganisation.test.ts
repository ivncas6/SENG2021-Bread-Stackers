/**
 * updateOrganisation.test.ts  (V0 handler tests — backwards compat)
 *
 * organisation.ts now uses requireOrgAdminOrOwner instead of a raw supabase
 * ownership check.  Mock orgPermissions to keep these tests focused on the
 * business logic that lives AFTER the permission gate.
 */
import { updateOrganisation } from '../organisation';
import { updateOrganisationHandler } from '../handlers/updateOrganisation';
import * as userHelper from '../userHelper';
import * as orgPermissions from '../orgPermissions';
import { supabase } from '../supabase';
import { InvalidInput, UnauthorisedError } from '../throwError';
import { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../userHelper');
jest.mock('../orgPermissions');
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(),
    update: jest.fn(),
  },
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedPerms      = orgPermissions as jest.Mocked<typeof orgPermissions>;
const db = supabase as never as {
  from: jest.Mock; select: jest.Mock; eq: jest.Mock;
  maybeSingle: jest.Mock; update: jest.Mock;
};

const mockSession = 'valid-session';
const mockUserId  = 123;
const mockOrgId   = 456;

beforeEach(() => {
  jest.resetAllMocks();
  db.from.mockReturnThis();
  db.select.mockReturnThis();
  db.update.mockReturnThis();
  db.eq.mockReturnThis(); // default non-terminal; terminal eq calls rely on default → error=undefined

  mockedUserHelper.getUserIdFromSession.mockResolvedValue(mockUserId);
  mockedPerms.requireOrgAdminOrOwner.mockResolvedValue(undefined); // default: caller is admin/owner
});

describe('Backend: updateOrganisation', () => {
  test('successfully updates organisation', async () => {
    // Chain: from('addresses').select().eq().maybeSingle()  — terminal: maybeSingle
    // Then:  from('orgs').update({...}).eq()                — terminal eq → error=undefined ✓
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

  test('throws InvalidInput if new addressId does not exist', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); // address not found
    await expect(updateOrganisation(mockSession, mockOrgId, 'Updated Name', 99))
      .rejects.toThrow(InvalidInput);
  });
});

describe('Lambda: updateOrganisationHandler', () => {
  test('returns 200 on success', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: 2 }, error: null });

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