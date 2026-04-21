/**
 * orgManagement.test.ts
 *
 * Mocking strategy:
 *   jest.mock('../userHelper')       → getUserIdFromSession
 *   jest.mock('../orgPermissions')   → all role guards (requireOrgMember etc.)
 *   jest.mock('../supabase', ...)    → only when we need to control DB reads
 *                                     inside organisation.ts itself (e.g. address
 *                                     existence checks, contact lookups)
 *
 * Because organisation.ts still calls supabase directly for some DB reads that
 * are NOT permission-related (e.g. "does this address exist?", "does this user
 * exist?") we keep the Supabase mock but limit it to those specific calls.
 * Permission calls go entirely through the mocked orgPermissions module.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  createOrganisation, updateOrganisation, deleteOrganisation,
  addOrgUser, deleteOrgUser, listOrgUsers,
} from '../organisation';
import { createOrganisationHandler } from '../handlersV2/createOrganisation';
import { updateOrganisationHandler } from '../handlersV2/updateOrganisation';
import { deleteOrganisationHandler } from '../handlersV2/deleteOrganisation';
import { addOrgUserHandler } from '../handlersV2/addOrgUser';
import { deleteOrgUserHandler } from '../handlersV2/deleteOrgUser';
import { listOrgUsersHandler } from '../handlersV2/listOrgUsers';
import * as userHelper from '../userHelper';
import * as orgPermissions from '../orgPermissions';
import { supabase } from '../supabase';
import { InvalidInput, InvalidBusinessName, UnauthorisedError } from '../throwError';
import { SupabaseMock } from '../interfaces';

jest.mock('../userHelper');
jest.mock('../orgPermissions');
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    in: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
  },
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedPerms = orgPermissions as jest.Mocked<typeof orgPermissions>;
const db = supabase as unknown as SupabaseMock & {
  or: jest.Mock; limit: jest.Mock; in: jest.Mock;
};

const SESSION = 'valid-session';
const USER_ID = 1;
const ORG_ID = 10;

function setupBase() {
  mockedUserHelper.getUserIdFromSession.mockResolvedValue(USER_ID);
  mockedPerms.requireOrgMember.mockResolvedValue('MEMBER');
  mockedPerms.requireOrgAdminOrOwner.mockResolvedValue(undefined);
  mockedPerms.requireOrgOwner.mockResolvedValue(undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  setupBase();
});

function makeEvent(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    headers: { session: SESSION },
    pathParameters: { orgId: String(ORG_ID) },
    body: null,
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}


// createOrganisation

describe('createOrganisation', () => {
  test('creates org and adds owner to members', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: 1 }, error: null }); // address check
    db.single.mockResolvedValueOnce({ data: { orgId: 99 }, error: null });           // org insert
    db.insert.mockResolvedValueOnce({ error: null });                               // member insert

    const result = await createOrganisation(SESSION, 'My Shop', 1);
    expect(result).toEqual({ orgId: 99 });
    // owner must be added to organisation_members
    expect(db.insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'OWNER' })])
    );
  });

  test('throws InvalidBusinessName on special chars', async () => {
    await expect(createOrganisation(SESSION, 'Bad@Name!', 1)).rejects.toThrow(InvalidBusinessName);
  });

  test('throws InvalidInput when address does not exist', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(createOrganisation(SESSION, 'Good Name', 99)).rejects.toThrow(InvalidInput);
  });

  test('throws UnauthorisedError on invalid session', async () => {
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(null as never);
    await expect(createOrganisation('bad', 'Good Name', 1)).rejects.toThrow(UnauthorisedError);
  });
});


// updateOrganisation

describe('updateOrganisation', () => {
  test('updates org when caller is ADMIN or OWNER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockResolvedValue(undefined);
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: 2 }, error: null }); // address check
    db.eq.mockResolvedValueOnce({ error: null }); // update

    const result = await updateOrganisation(SESSION, ORG_ID, 'New Name', 2);
    expect(result).toEqual({ orgId: ORG_ID });
    expect(mockedPerms.requireOrgAdminOrOwner).toHaveBeenCalledWith(USER_ID, ORG_ID);
  });

  test('throws UnauthorisedError when caller is plain MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin or owner'));
    await expect(updateOrganisation(SESSION, ORG_ID, 'New Name', 2))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidInput when new address does not exist', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateOrganisation(SESSION, ORG_ID, 'New Name', 99)).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidBusinessName on invalid name', async () => {
    await expect(updateOrganisation(SESSION, ORG_ID, 'X', 2)).rejects.toThrow(InvalidBusinessName);
  });
});


// deleteOrganisation

describe('deleteOrganisation', () => {
  test('deletes org when caller is OWNER and no orders', async () => {
    (db as never as { limit: jest.Mock }).limit.mockResolvedValueOnce({ data: [], error: null });
    db.eq.mockResolvedValueOnce({ error: null });

    const result = await deleteOrganisation(SESSION, ORG_ID);
    expect(result).toEqual({});
    expect(mockedPerms.requireOrgOwner).toHaveBeenCalledWith(USER_ID, ORG_ID);
  });

  test('throws UnauthorisedError when caller is ADMIN', async () => {
    mockedPerms.requireOrgOwner.mockRejectedValue(
      new UnauthorisedError('Only the organisation owner')
    );
    await expect(deleteOrganisation(SESSION, ORG_ID))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidInput when orders still exist', async () => {
    (db as never as { limit: jest.Mock }).limit.mockResolvedValueOnce({
      data: [{ orderId: 'some-order' }], error: null,
    });
    await expect(deleteOrganisation(SESSION, ORG_ID)).rejects.toThrow(InvalidInput);
  });
});


// addOrgUser

describe('addOrgUser', () => {
  const TARGET_USER = 42;

  test('adds member when caller is ADMIN or OWNER', async () => {
    db.maybeSingle
      // user exists
      .mockResolvedValueOnce({ data: { contactId: TARGET_USER }, error: null })
      // not already member
      .mockResolvedValueOnce({ data: null, error: null });
    db.insert.mockResolvedValueOnce({ error: null });

    const result = await addOrgUser(SESSION, TARGET_USER, ORG_ID);
    expect(result).toEqual({});
    // check the role written is uppercase MEMBER not lowercase
    expect(db.insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'MEMBER' })])
    );
  });

  test('throws UnauthorisedError when caller is plain MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin or owner'));
    await expect(addOrgUser(SESSION, TARGET_USER, ORG_ID)).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidInput when target user does not exist', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); // user not found
    await expect(addOrgUser(SESSION, TARGET_USER, ORG_ID)).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidInput when user is already a member', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: TARGET_USER }, error: null }) // user exists
      .mockResolvedValueOnce({ data: { id: 1 }, error: null });                  // already member
    await expect(addOrgUser(SESSION, TARGET_USER, ORG_ID)).rejects.toThrow(InvalidInput);
  });
});

// deleteOrgUser
describe('deleteOrgUser', () => {
  const TARGET_USER = 42;

  test('removes member when caller is ADMIN or OWNER', async () => {
    db.maybeSingle
      // org owner is 999 (not target)
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null })
      // member exists
      .mockResolvedValueOnce({ data: { id: 5 }, error: null });   
    db.delete.mockReturnThis();
    db.eq.mockResolvedValueOnce({ error: null });

    const result = await deleteOrgUser(SESSION, TARGET_USER, ORG_ID);
    expect(result).toEqual({});
  });

  test('throws when caller is plain MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin or owner'));
    await expect(deleteOrgUser(SESSION, TARGET_USER, ORG_ID)).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidInput when trying to remove the owner', async () => {
    // org owner IS the target user
    db.maybeSingle.mockResolvedValueOnce({ data: { contactId: TARGET_USER }, error: null });
    await expect(deleteOrgUser(SESSION, TARGET_USER, ORG_ID)).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidInput when target is not a member', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null }) // owner is 999
      .mockResolvedValueOnce({ data: null, error: null });                // not a member
    await expect(deleteOrgUser(SESSION, TARGET_USER, ORG_ID))
      .rejects.toThrow(InvalidInput);
  });
});

// listOrgUsers
describe('listOrgUsers', () => {
  test('returns all members including owner', async () => {
    // org owner
    db.maybeSingle.mockResolvedValueOnce({ data: { contactId: USER_ID }, error: null });
    // member rows
    db.eq.mockResolvedValueOnce({ data: [{ contactId: 2 }], error: null });
    db.in.mockResolvedValueOnce({
      data: [
        { contactId: USER_ID, firstName: 'A', lastName: 'B', email: 'a@b.com', telephone: '000' },
        { contactId: 2, firstName: 'C', lastName: 'D', email: 'c@d.com', telephone: '111' },
      ],
      error: null,
    });

    const result = await listOrgUsers(SESSION, ORG_ID);
    expect(result.users).toHaveLength(2);
  });

  test('throws UnauthorisedError when not a member', async () => {
    mockedPerms.requireOrgMember.mockRejectedValue(new UnauthorisedError('not a member'));
    await expect(listOrgUsers(SESSION, ORG_ID)).rejects.toThrow(UnauthorisedError);
  });
});


// Lambda handlers

describe('Lambda: createOrganisationHandler (V2)', () => {
  test('200 on success', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: 1 }, error: null });
    db.single.mockResolvedValueOnce({ data: { orgId: 99 }, error: null });
    db.insert.mockResolvedValueOnce({ error: null });

    const event = makeEvent({ body: JSON.stringify({ orgName: 'My Shop', addressId: 1 }) });
    const res = await createOrganisationHandler(event);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('orgId', 99);
  });

  test('401 when session missing', async () => {
    const res = await createOrganisationHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 on invalid business name', async () => {
    const event = makeEvent({ body: JSON.stringify({ orgName: 'X', addressId: 1 }) });
    const res = await createOrganisationHandler(event);
    expect(res.statusCode).toBe(400);
  });
});

describe('Lambda: updateOrganisationHandler (V2)', () => {
  test('200 on success', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: 2 }, error: null });
    db.eq.mockResolvedValueOnce({ error: null });

    const event = makeEvent({ body: JSON.stringify({ orgName: 'Updated', addressId: 2 }) });
    const res = await updateOrganisationHandler(event);
    expect(res.statusCode).toBe(200);
  });

  test('401 when session missing', async () => {
    const res = await updateOrganisationHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('401 when caller is MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin or owner'));
    const event = makeEvent({ body: JSON.stringify({ orgName: 'New', addressId: 1 }) });
    const res = await updateOrganisationHandler(event);
    expect(res.statusCode).toBe(401);
  });
});

describe('Lambda: deleteOrganisationHandler (V2)', () => {
  test('200 on success', async () => {
    (db as never as { limit: jest.Mock }).limit.mockResolvedValueOnce({ data: [], error: null });
    db.eq.mockResolvedValueOnce({ error: null });

    const res = await deleteOrganisationHandler(makeEvent({}));
    expect(res.statusCode).toBe(200);
  });

  test('401 when session missing', async () => {
    const res = await deleteOrganisationHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('401 when caller is ADMIN (not OWNER)', async () => {
    mockedPerms.requireOrgOwner.mockRejectedValue(
      new UnauthorisedError('Only the organisation owner')
    );
    const res = await deleteOrganisationHandler(makeEvent({}));
    expect(res.statusCode).toBe(401);
  });
});

describe('Lambda: addOrgUserHandler (V2)', () => {
  test('200 on success', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: 42 }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    db.insert.mockResolvedValueOnce({ error: null });

    const event = makeEvent({ body: JSON.stringify({ userId: 42 }) });
    const res = await addOrgUserHandler(event);
    expect(res.statusCode).toBe(200);
  });

  test('401 when session missing', async () => {
    const res = await addOrgUserHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 when userId missing', async () => {
    const event = makeEvent({ body: JSON.stringify({}) });
    const res = await addOrgUserHandler(event);
    expect(res.statusCode).toBe(400);
  });
});

describe('Lambda: deleteOrgUserHandler (V2)', () => {
  test('200 on success', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null })
      .mockResolvedValueOnce({ data: { id: 5 }, error: null });
    db.delete.mockReturnThis();
    db.eq.mockResolvedValueOnce({ error: null });

    const event = makeEvent({ pathParameters: { orgId: String(ORG_ID), userId: '42' } });
    const res = await deleteOrgUserHandler(event);
    expect(res.statusCode).toBe(200);
  });

  test('401 when session missing', async () => {
    const res = await deleteOrgUserHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });
});

describe('Lambda: listOrgUsersHandler (V2)', () => {
  test('200 returns user list', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { contactId: USER_ID }, error: null });
    db.eq.mockResolvedValueOnce({ data: [{ contactId: 2 }], error: null });
    db.in.mockResolvedValueOnce({
      data: [
        { contactId: USER_ID, firstName: 'A', lastName: 'B', email: 'a@b.com', telephone: '000' },
      ],
      error: null,
    });

    const res = await listOrgUsersHandler(makeEvent({}));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).users).toHaveLength(1);
  });

  test('401 when session missing', async () => {
    const res = await listOrgUsersHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });
});