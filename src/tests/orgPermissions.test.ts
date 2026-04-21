/**
 * orgPermissions.test.ts
 *
 * WHY factory mock instead of jest.mock('../dataStore') auto-mock:
 *   dataStore.ts has a circular import with generateUBL.ts. Jest's auto-mock
 *   introspects the original module to build stubs which triggers that circular
 *   dependency at creation time → silent compile failure → zero tests registered
 *   → "Your test suite must contain at least one test" error.
 *   A factory mock (() => ({...})) skips introspection entirely.
 */
jest.mock('../dataStore', () => ({
  getUserRoleInOrg: jest.fn(),
}));

import { requireOrgMember, requireOrgAdminOrOwner, requireOrgOwner } from '../orgPermissions';
import { getUserRoleInOrg } from '../dataStore';
import { UnauthorisedError } from '../throwError';
import { OrgRole } from '../interfaces';

const mockGetRole = getUserRoleInOrg as jest.MockedFunction<typeof getUserRoleInOrg>;

function setRole(role: OrgRole | null) {
  mockGetRole.mockResolvedValue(role);
}

beforeEach(() => jest.resetAllMocks());

// ---------------------------------------------------------------------------
describe('requireOrgMember', () => {
  test('returns OWNER when user owns the org', async () => {
    setRole('OWNER');
    await expect(requireOrgMember(1, 10)).resolves.toBe('OWNER');
  });

  test('returns ADMIN for admin members', async () => {
    setRole('ADMIN');
    await expect(requireOrgMember(1, 10)).resolves.toBe('ADMIN');
  });

  test('returns MEMBER for regular members', async () => {
    setRole('MEMBER');
    await expect(requireOrgMember(1, 10)).resolves.toBe('MEMBER');
  });

  test('throws UnauthorisedError when user has no membership', async () => {
    setRole(null);
    await expect(requireOrgMember(1, 10)).rejects.toThrow(UnauthorisedError);
    await expect(requireOrgMember(1, 10)).rejects.toThrow('not a member');
  });
});

// ---------------------------------------------------------------------------
describe('requireOrgAdminOrOwner', () => {
  test('resolves for OWNER', async () => {
    setRole('OWNER');
    await expect(requireOrgAdminOrOwner(1, 10)).resolves.toBeUndefined();
  });

  test('resolves for ADMIN', async () => {
    setRole('ADMIN');
    await expect(requireOrgAdminOrOwner(1, 10)).resolves.toBeUndefined();
  });

  test('throws for plain MEMBER', async () => {
    setRole('MEMBER');
    await expect(requireOrgAdminOrOwner(1, 10)).rejects.toThrow(UnauthorisedError);
    await expect(requireOrgAdminOrOwner(1, 10)).rejects.toThrow('Admin or owner');
  });

  test('throws for non-member', async () => {
    setRole(null);
    await expect(requireOrgAdminOrOwner(1, 10)).rejects.toThrow(UnauthorisedError);
  });
});

// ---------------------------------------------------------------------------
describe('requireOrgOwner', () => {
  test('resolves for OWNER', async () => {
    setRole('OWNER');
    await expect(requireOrgOwner(1, 10)).resolves.toBeUndefined();
  });

  test('throws for ADMIN', async () => {
    setRole('ADMIN');
    await expect(requireOrgOwner(1, 10)).rejects.toThrow(UnauthorisedError);
    await expect(requireOrgOwner(1, 10)).rejects.toThrow('Only the organisation owner');
  });

  test('throws for MEMBER', async () => {
    setRole('MEMBER');
    await expect(requireOrgOwner(1, 10)).rejects.toThrow(UnauthorisedError);
  });

  test('throws for non-member', async () => {
    setRole(null);
    await expect(requireOrgOwner(1, 10)).rejects.toThrow(UnauthorisedError);
  });
});