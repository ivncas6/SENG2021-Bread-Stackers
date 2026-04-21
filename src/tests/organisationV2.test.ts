/**
 * organisationV2.test.ts
 *
 * MOCK CHAIN RULES:
 * 1. beforeEach: jest.resetAllMocks() + re-setup mockReturnThis() for all non-terminal methods.
 * 2. mockResolvedValueOnce is ONLY called on terminal methods.
 * 3. createOrganisation now checks for a duplicate name BEFORE the address check, so
 *    maybeSingle calls are: (1) dup-name check, (2) address check.
 * 4. updateOrganisation uses neq for the dup-name check (excludes the current orgId).
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

jest.mock('../userHelper');
jest.mock('../orgPermissions');
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    neq: jest.fn(),     // ← required for updateOrganisation dup-name check
    or: jest.fn(),
    limit: jest.fn(),
    in: jest.fn(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
  },
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedPerms = orgPermissions as jest.Mocked<typeof orgPermissions>;
const db = supabase as never as {
  from: jest.Mock; select: jest.Mock; insert: jest.Mock; update: jest.Mock;
  delete: jest.Mock; eq: jest.Mock; neq: jest.Mock; or: jest.Mock; limit: jest.Mock;
  in: jest.Mock; maybeSingle: jest.Mock; single: jest.Mock;
};

const SESSION = 'valid-session';
const USER_ID = 1;
const ORG_ID = 10;
const TARGET_USER = 42;

function setupChainDefaults() {
  db.from.mockReturnThis();
  db.select.mockReturnThis();
  db.insert.mockReturnThis();
  db.update.mockReturnThis();
  db.delete.mockReturnThis();
  db.eq.mockReturnThis();
  db.neq.mockReturnThis();
  db.or.mockReturnThis();
  db.in.mockReturnThis();
}

function setupBase() {
  mockedUserHelper.getUserIdFromSession.mockResolvedValue(USER_ID);
  mockedPerms.requireOrgMember.mockResolvedValue('MEMBER');
  mockedPerms.requireOrgAdminOrOwner.mockResolvedValue(undefined);
  mockedPerms.requireOrgOwner.mockResolvedValue(undefined);
}

beforeEach(() => {
  jest.resetAllMocks();
  setupChainDefaults();
  setupBase();
  jest.spyOn(console, 'error').mockImplementation(() => {});
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
  test('creates org and adds owner to organisation_members', async () => {
    // 1. dup-name check: no duplicate
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // 2. address check: found
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: 1 }, error: null });
    // 3. org insert
    db.single.mockResolvedValueOnce({ data: { orgId: 99 }, error: null });

    const result = await createOrganisation(SESSION, 'My Shop', 1);
    expect(result).toEqual({ orgId: 99 });
    expect(db.insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'OWNER' })])
    );
  });

  test('throws InvalidBusinessName on special characters', async () => {
    await expect(createOrganisation(SESSION, 'Bad@Name!', 1)).rejects.toThrow(InvalidBusinessName);
  });

  test('throws InvalidBusinessName when name is too short', async () => {
    await expect(createOrganisation(SESSION, 'X', 1)).rejects.toThrow(InvalidBusinessName);
  });

  test('throws InvalidBusinessName on duplicate name', async () => {
    // dup-name check finds an existing org
    db.maybeSingle.mockResolvedValueOnce({ data: { orgId: 77 }, error: null });
    await expect(createOrganisation(SESSION, 'Taken Name', 1))
      .rejects.toThrow('already exists');
  });

  test('throws InvalidInput when address does not exist', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })  // no dup
      .mockResolvedValueOnce({ data: null, error: null }); // address not found
    await expect(createOrganisation(SESSION, 'Good Name', 99)).rejects.toThrow(InvalidInput);
  });

  test('throws UnauthorisedError on invalid session', async () => {
    mockedUserHelper.getUserIdFromSession.mockResolvedValue(null as never);
    await expect(createOrganisation('bad-session', 'Good Name', 1))
      .rejects.toThrow(UnauthorisedError);
  });
});


// updateOrganisation 

describe('updateOrganisation', () => {
  test('updates org when caller is ADMIN or OWNER', async () => {
    // 1. dup-name check: no duplicate
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // 2. address check: found
    db.maybeSingle.mockResolvedValueOnce({ data: { addressID: 2 }, error: null });

    const result = await updateOrganisation(SESSION, ORG_ID, 'New Name', 2);
    expect(result).toEqual({ orgId: ORG_ID });
    expect(mockedPerms.requireOrgAdminOrOwner).toHaveBeenCalledWith(USER_ID, ORG_ID);
    expect(db.update).toHaveBeenCalledWith({ orgName: 'New Name', addressId: 2 });
  });

  test('throws UnauthorisedError when caller is plain MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin or owner'));
    await expect(updateOrganisation(SESSION, ORG_ID, 'New Name', 2))
      .rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidBusinessName on duplicate name', async () => {
    // dup-name check finds a DIFFERENT org with same name
    db.maybeSingle.mockResolvedValueOnce({ data: { orgId: 999 }, error: null });
    await expect(updateOrganisation(SESSION, ORG_ID, 'Taken Name', 2))
      .rejects.toThrow('already exists');
  });

  test('throws InvalidInput when new address does not exist', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })  // no dup
      .mockResolvedValueOnce({ data: null, error: null }); // address not found
    await expect(updateOrganisation(SESSION, ORG_ID, 'New Name', 99)).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidBusinessName on invalid name', async () => {
    await expect(updateOrganisation(SESSION, ORG_ID, 'X', 2)).rejects.toThrow(InvalidBusinessName);
  });
});


// deleteOrganisation 

describe('deleteOrganisation', () => {
  test('deletes org when caller is OWNER and no attached orders', async () => {
    db.limit.mockResolvedValueOnce({ data: [], error: null });

    const result = await deleteOrganisation(SESSION, ORG_ID);
    expect(result).toEqual({});
    expect(mockedPerms.requireOrgOwner).toHaveBeenCalledWith(USER_ID, ORG_ID);
  });

  test('throws UnauthorisedError when caller is not OWNER', async () => {
    mockedPerms.requireOrgOwner.mockRejectedValue(
      new UnauthorisedError('Only the organisation owner')
    );
    await expect(deleteOrganisation(SESSION, ORG_ID)).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidInput when orders are still attached', async () => {
    db.limit.mockResolvedValueOnce({ data: [{ orderId: 'some-order' }], error: null });
    await expect(deleteOrganisation(SESSION, ORG_ID)).rejects.toThrow(InvalidInput);
    expect(db.delete).not.toHaveBeenCalled();
  });
});


// addOrgUser

describe('addOrgUser', () => {
  test('adds member when caller is ADMIN or OWNER', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: TARGET_USER }, error: null }) // user exists
      .mockResolvedValueOnce({ data: null, error: null });                       // not a member yet

    const result = await addOrgUser(SESSION, TARGET_USER, ORG_ID);
    expect(result).toEqual({});
    expect(mockedPerms.requireOrgAdminOrOwner).toHaveBeenCalledWith(USER_ID, ORG_ID);
    expect(db.insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'MEMBER' })])
    );
  });

  test('throws UnauthorisedError when caller is plain MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin or owner'));
    await expect(addOrgUser(SESSION, TARGET_USER, ORG_ID)).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidInput when target user does not exist', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(addOrgUser(SESSION, TARGET_USER, ORG_ID)).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidInput when user is already a member', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: TARGET_USER }, error: null })
      .mockResolvedValueOnce({ data: { id: 1 }, error: null });
    await expect(addOrgUser(SESSION, TARGET_USER, ORG_ID)).rejects.toThrow(InvalidInput);
  });
});


// deleteOrgUser

describe('deleteOrgUser', () => {
  test('removes member when caller is ADMIN or OWNER', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null }) // owner is 999 (≠ target)
      .mockResolvedValueOnce({ data: { id: 5 }, error: null });          // member row exists

    const result = await deleteOrgUser(SESSION, TARGET_USER, ORG_ID);
    expect(result).toEqual({});
  });

  test('throws UnauthorisedError when caller is plain MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin or owner'));
    await expect(deleteOrgUser(SESSION, TARGET_USER, ORG_ID)).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidInput when trying to remove the owner', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { contactId: TARGET_USER }, error: null });
    await expect(deleteOrgUser(SESSION, TARGET_USER, ORG_ID)).rejects.toThrow(InvalidInput);
  });

  test('throws InvalidInput when target is not a member', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(deleteOrgUser(SESSION, TARGET_USER, ORG_ID)).rejects.toThrow(InvalidInput);
  });
});


// listOrgUsers

describe('listOrgUsers', () => {
  test('returns all members including owner', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { contactId: USER_ID }, error: null });
    db.eq.mockReturnValueOnce(db)
      .mockResolvedValueOnce({ data: [{ contactId: 2 }], error: null });
    db.in.mockResolvedValueOnce({
      data: [
        { contactId: USER_ID, firstName: 'A', lastName: 'B', email: 'a@b.com', telephone: '000' },
        { contactId: 2,       firstName: 'C', lastName: 'D', email: 'c@d.com', telephone: '111' },
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

describe('Lambda: createOrganisationHandler', () => {
  test('200 on success', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })               // no dup
      .mockResolvedValueOnce({ data: { addressID: 1 }, error: null });  // address found
    db.single.mockResolvedValueOnce({ data: { orgId: 99 }, error: null });

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

  test('400 on duplicate name', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { orgId: 77 }, error: null });
    const event = makeEvent({ body: JSON.stringify({ orgName: 'Taken', addressId: 1 }) });
    const res = await createOrganisationHandler(event);
    expect(res.statusCode).toBe(400);
  });
});

describe('Lambda: updateOrganisationHandler', () => {
  test('200 on success', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { addressID: 2 }, error: null });

    const event = makeEvent({ body: JSON.stringify({ orgName: 'Updated', addressId: 2 }) });
    const res = await updateOrganisationHandler(event);
    expect(res.statusCode).toBe(200);
  });

  test('401 when session missing', async () => {
    const res = await updateOrganisationHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('401 when caller is plain MEMBER', async () => {
    mockedPerms.requireOrgAdminOrOwner.mockRejectedValue(new UnauthorisedError('Admin or owner'));
    const event = makeEvent({ body: JSON.stringify({ orgName: 'New Name', addressId: 1 }) });
    const res = await updateOrganisationHandler(event);
    expect(res.statusCode).toBe(401);
  });
});

describe('Lambda: deleteOrganisationHandler', () => {
  test('200 on success', async () => {
    db.limit.mockResolvedValueOnce({ data: [], error: null });

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

describe('Lambda: addOrgUserHandler', () => {
  test('200 on success', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: TARGET_USER }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const event = makeEvent({ body: JSON.stringify({ userId: TARGET_USER }) });
    const res = await addOrgUserHandler(event);
    expect(res.statusCode).toBe(200);
  });

  test('401 when session missing', async () => {
    const res = await addOrgUserHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  test('400 when userId is missing from body', async () => {
    const event = makeEvent({ body: JSON.stringify({}) });
    const res = await addOrgUserHandler(event);
    expect(res.statusCode).toBe(400);
  });
});

describe('Lambda: deleteOrgUserHandler', () => {
  test('200 on success', async () => {
    db.maybeSingle
      .mockResolvedValueOnce({ data: { contactId: 999 }, error: null })
      .mockResolvedValueOnce({ data: { id: 5 }, error: null });

    const event = makeEvent({
      pathParameters: { orgId: String(ORG_ID), userId: String(TARGET_USER) }
    });
    const res = await deleteOrgUserHandler(event);
    expect(res.statusCode).toBe(200);
  });

  test('401 when session missing', async () => {
    const res = await deleteOrgUserHandler(makeEvent({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });
});

describe('Lambda: listOrgUsersHandler', () => {
  test('200 returns user list', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: { contactId: USER_ID }, error: null });
    db.eq.mockReturnValueOnce(db)
      .mockResolvedValueOnce({ data: [{ contactId: 2 }], error: null });
    db.in.mockResolvedValueOnce({
      data: [{ contactId: USER_ID, firstName: 'A',
        lastName: 'B', email: 'a@b.com', telephone: '000' }],
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