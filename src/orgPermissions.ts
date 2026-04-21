import { getUserRoleInOrg } from './dataStore';
import { UnauthorisedError } from './throwError';
import { OrgRole } from './interfaces';

// asserts the user is a member (any role) of the org.
// returns their role so callers can make further decisions if needed.

export async function requireOrgMember(
  userId: number,
  orgId: number
): Promise<OrgRole> {
  const role = await getUserRoleInOrg(userId, orgId);
  if (!role) {
    throw new UnauthorisedError(
      'You are not a member of this organisation'
    );
  }
  return role;
}

// checks the user is ADMIN or OWNER of the org.
// Throws for plain MEMBERs.
export async function requireOrgAdminOrOwner(
  userId: number,
  orgId: number
): Promise<void> {
  const role = await requireOrgMember(userId, orgId);
  if (role === 'MEMBER') {
    throw new UnauthorisedError(
      'Admin or owner permissions are required for this action'
    );
  }
}

//checks the user is the OWNER of the org.
// Throws for ADMINs and MEMBERs.
export async function requireOrgOwner(
  userId: number,
  orgId: number
): Promise<void> {
  const role = await requireOrgMember(userId, orgId);
  if (role !== 'OWNER') {
    throw new UnauthorisedError(
      'Only the organisation owner can perform this action'
    );
  }
}