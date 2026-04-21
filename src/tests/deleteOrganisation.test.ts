/**
 * deleteOrganisation.test.ts  (V0 handler tests — backwards compat)
 *
 * organisation.ts now uses orgPermissions (requireOrgOwner) instead of a raw
 * supabase maybeSingle for the ownership check.  We must mock orgPermissions
 * here so the old tests don't try to walk the real permission chain.
 *
 * Semantic change to acknowledge:
 *   OLD: org not found → InvalidInput
 *   NEW: org not found / user not owner → UnauthorisedError  (via requireOrgOwner)
 * The "org does not exist" test now expects UnauthorisedError to match reality.
 */
import { deleteOrganisation } from '../organisation';
import { deleteOrganisationHandler } from '../handlers/deleteOrganisation';
import * as userHelper from '../userHelper';
import * as orgPermissions from '../orgPermissions';
import { supabase } from '../supabase';
import { InvalidInput, UnauthorisedError } from '../throwError';
import { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../userHelper');
jest.mock('../orgPermissions');
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  },
}));

const mockedUserHelper  = userHelper as jest.Mocked<typeof userHelper>;
const mockedPerms       = orgPermissions as jest.Mocked<typeof orgPermissions>;
const mockedLimit       = (supabase as never as { limit: jest.Mock }).limit;

const mockSession = 'valid-session';
const mockUserId  = 123;
const mockOrgId   = 456;

beforeEach(() => {
  jest.resetAllMocks();
  // Re-apply chain defaults after reset
  const db = supabase as never as Record<string, jest.Mock>;
  ['from','select','delete','eq','or'].forEach(m => db[m].mockReturnThis());

  mockedUserHelper.getUserIdFromSession.mockResolvedValue(mockUserId);
  mockedPerms.requireOrgOwner.mockResolvedValue(undefined); // default: caller is owner
});

describe('Backend: deleteOrganisation', () => {
  test('successfully deletes organisation', async () => {
    mockedLimit.mockResolvedValueOnce({ data: [], error: null }); // no orders

    const res = await deleteOrganisation(mockSession, mockOrgId);
    expect(res).toEqual({});
    expect(mockedPerms.requireOrgOwner).toHaveBeenCalledWith(mockUserId, mockOrgId);
  });

  test('throws UnauthorisedError when org does not exist or user is not OWNER', async () => {
    // With the new model, "org not found" is surfaced as UnauthorisedError by requireOrgOwner
    mockedPerms.requireOrgOwner.mockRejectedValue(new UnauthorisedError('Only the organisation owner'));
    await expect(deleteOrganisation(mockSession, mockOrgId)).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidInput if orders are still attached', async () => {
    mockedLimit.mockResolvedValueOnce({ data: [{ orderId: 'order-123' }], error: null });
    await expect(deleteOrganisation(mockSession, mockOrgId)).rejects.toThrow(InvalidInput);
    // delete must not be called when there are active orders
    const db = supabase as never as { delete: jest.Mock };
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe('Lambda: deleteOrganisationHandler', () => {
  test('returns 200 on success', async () => {
    mockedLimit.mockResolvedValueOnce({ data: [], error: null });

    const event = {
      headers: { session: mockSession },
      pathParameters: { orgId: String(mockOrgId) },
    } as unknown as APIGatewayProxyEvent;

    const res = await deleteOrganisationHandler(event);
    expect(res.statusCode).toBe(200);
  });

  test('returns 401 when caller is not OWNER', async () => {
    mockedPerms.requireOrgOwner.mockRejectedValue(new UnauthorisedError('Only the organisation owner'));

    const event = {
      headers: { session: mockSession },
      pathParameters: { orgId: String(mockOrgId) },
    } as unknown as APIGatewayProxyEvent;

    const res = await deleteOrganisationHandler(event);
    expect(res.statusCode).toBe(401);
  });
});