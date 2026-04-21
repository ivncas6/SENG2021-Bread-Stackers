import { supabase } from './supabase';
import { InvalidBusinessName, InvalidInput, 
  InvalidSupabase, UnauthorisedError } from './throwError';
import { getUserIdFromSession } from './userHelper';
import { requireOrgAdminOrOwner, requireOrgOwner, requireOrgMember } from './orgPermissions';
import { ErrorObject, OrgRole } from './interfaces';

function validateBusinessName(businessName: string): ErrorObject | null {
  const charRange: RegExp = /^[a-zA-Z0-9\s\-']+$/;
  if (!charRange.test(businessName)) {
    throw new InvalidBusinessName('invalid business name -> includes special characters');
  }
  if (businessName.length < 2) {
    throw new InvalidBusinessName('Business name is less than 2 characters');
  }
  if (businessName.length > 125) {
    throw new InvalidBusinessName('Business name is more than 125 characters');
  }
  return null;
}

export async function createOrganisation(session: string, orgName: string, addressId: number) {
  const userId = await getUserIdFromSession(session);
  if (!userId) {
    throw new UnauthorisedError('Invalid user session');
  }

  validateBusinessName(orgName);

  // Guard: duplicate name
  const { data: dupOrg } = await supabase
    .from('organisations')
    .select('orgId')
    .eq('orgName', orgName)
    .maybeSingle();

  if (dupOrg) {
    throw new InvalidBusinessName('An organisation with this name already exists');
  }

  const { data: addressData, error: addressError } = await supabase
    .from('addresses')
    .select('addressID')
    .eq('addressID', addressId)
    .maybeSingle();

  if (!addressData || addressError) {
    throw new InvalidInput('Provided addressId does not exist');
  }

  const { data, error } = await supabase
    .from('organisations')
    .insert([{ 
      orgName: orgName,
      addressId: addressId,
      contactId: userId,
    }])
    .select()
    .single();

  if (error) throw new InvalidSupabase(`Org Creation Failed: ${error.message}`);

  // Add the creator as OWNER in organisation_members
  await supabase
    .from('organisation_members')
    .insert([{ orgId: data.orgId, contactId: userId, role: 'OWNER' }]);
    
  return { orgId: data.orgId };
}

export async function updateOrganisation(
  session: string,
  orgId: number,
  orgName: string,
  addressId: number
) {
  const userId = await getUserIdFromSession(session);
  if (!userId) throw new UnauthorisedError('Invalid user session');

  // ADMIN or OWNER can update org details
  await requireOrgAdminOrOwner(userId, orgId);

  validateBusinessName(orgName);

  // Guard: duplicate name (exclude the org being updated)
  const { data: dupOrg } = await supabase
    .from('organisations')
    .select('orgId')
    .eq('orgName', orgName)
    .neq('orgId', orgId)
    .maybeSingle();

  if (dupOrg) {
    throw new InvalidBusinessName('An organisation with this name already exists');
  }

  const { data: addressData } = await supabase
    .from('addresses')
    .select('addressID')
    .eq('addressID', addressId)
    .maybeSingle();

  if (!addressData) {
    throw new InvalidInput('Provided addressId does not exist');
  }

  const { error } = await supabase
    .from('organisations')
    .update({ 
      orgName: orgName,
      addressId: addressId,
    })
    .eq('orgId', orgId);

  if (error) throw new InvalidSupabase(`Org Update Failed: ${error.message}`);
    
  return { orgId };
}

export async function deleteOrganisation(session: string, orgId: number) {
  const userId = await getUserIdFromSession(session);
  if (!userId) throw new UnauthorisedError('Invalid user session');

  // Only OWNER can delete an organisation
  await requireOrgOwner(userId, orgId);

  const { data: orders } = await supabase
    .from('orders')
    .select('orderId')
    .or(`buyerOrgID.eq.${orgId},sellerOrgID.eq.${orgId}`)
    .limit(1);

  if (orders && orders.length > 0) {
    throw new InvalidInput(
      'Cannot delete organization: There are existing orders associated with it.');
  }

  const { error } = await supabase
    .from('organisations')
    .delete()
    .eq('orgId', orgId);

  if (error) throw new InvalidSupabase(`Org Deletion Failed: ${error.message}`);
    
  return {};
}

/**
 * Adds a user to an organisation by their email address.
 * Accepts email instead of userId so the caller does not need to know the
 * internal contactId — they only need to know the user's email.
 * ADMIN or OWNER can add members.
 */
export async function addOrgUser(session: string, email: string, orgId: number) {
  const currUserId = await getUserIdFromSession(session);
  if (!currUserId) throw new UnauthorisedError('Invalid user session');

  // ADMIN or OWNER can add members
  await requireOrgAdminOrOwner(currUserId, orgId);

  // Look up the target user by email — no need for caller to know the userId
  const { data: userData } = await supabase
    .from('contacts')
    .select('contactId')
    .eq('email', email)
    .maybeSingle();

  if (!userData) {
    throw new InvalidInput('No user found with that email address');
  }

  const targetUserId: number = userData.contactId;

  const { data: existing } = await supabase
    .from('organisation_members')
    .select('id')
    .eq('orgId', orgId)
    .eq('contactId', targetUserId)
    .maybeSingle();

  if (existing) {
    throw new InvalidInput('User is already a member of this organisation');
  }

  const { error } = await supabase
    .from('organisation_members')
    .insert([{ orgId: orgId, contactId: targetUserId, role: 'MEMBER' }]);

  if (error) throw new InvalidSupabase(`Add Org User Failed: ${error.message}`);

  return {};
}

/**
 * Updates the role of an existing organisation member.
 * - Only OWNER or ADMIN can call this.
 * - The OWNER's role cannot be changed (use deleteOrganisation to remove ownership).
 * - Valid target roles: 'ADMIN' | 'MEMBER'.
 * - A user cannot demote themselves if they are the only ADMIN/OWNER (guard below).
 */
export async function updateOrgUserRole(
  session: string,
  targetUserId: number,
  orgId: number,
  role: OrgRole
) {
  const currUserId = await getUserIdFromSession(session);
  if (!currUserId) throw new UnauthorisedError('Invalid user session');

  await requireOrgAdminOrOwner(currUserId, orgId);

  if (role !== 'ADMIN' && role !== 'MEMBER') {
    throw new InvalidInput('Role must be ADMIN or MEMBER');
  }

  // protect the org owner from role changes
  const { data: orgData } = await supabase
    .from('organisations')
    .select('contactId')
    .eq('orgId', orgId)
    .maybeSingle();

  if (orgData && orgData.contactId === targetUserId) {
    throw new InvalidInput('Cannot change the role of the organisation owner');
  }

  // Confirm the target is actually a member
  const { data: existing } = await supabase
    .from('organisation_members')
    .select('id, role')
    .eq('orgId', orgId)
    .eq('contactId', targetUserId)
    .maybeSingle();

  if (!existing) {
    throw new InvalidInput('User is not a member of this organisation');
  }

  // Guard: prevent an ADMIN from demoting themselves if they are the only elevated user.
  // An OWNER always exists, so this only matters when an ADMIN tries to demote themselves
  // to MEMBER and would leave no other admin.
  if (currUserId === targetUserId && existing.role === 'ADMIN' && role === 'MEMBER') {
    const { data: admins } = await supabase
      .from('organisation_members')
      .select('contactId')
      .eq('orgId', orgId)
      .eq('role', 'ADMIN');

    // If the caller is the only ADMIN (owner still exists, so org isn't leaderless,
    // but this is still a useful guard to prevent accidental self-demotion)
    if (admins && admins.length === 1) {
      throw new InvalidInput(
        'You are the only admin. Promote another member before demoting yourself.'
      );
    }
  }

  const { error } = await supabase
    .from('organisation_members')
    .update({ role })
    .eq('orgId', orgId)
    .eq('contactId', targetUserId);

  if (error) throw new InvalidSupabase(`Update role failed: ${error.message}`);

  return {};
}

export async function deleteOrgUser(session: string, userId: number, orgId: number) {
  const currUserId = await getUserIdFromSession(session);
  if (!currUserId) throw new UnauthorisedError('Invalid user session');

  // ADMIN or OWNER can remove members
  await requireOrgAdminOrOwner(currUserId, orgId);

  // Get owner to protect them
  const { data: orgData } = await supabase
    .from('organisations')
    .select('contactId')
    .eq('orgId', orgId)
    .maybeSingle();

  if (orgData && orgData.contactId === userId) {
    throw new InvalidInput(
      'Cannot remove the organisation owner. Delete the organisation instead.');
  }

  const { data: existing } = await supabase
    .from('organisation_members')
    .select('id')
    .eq('orgId', orgId)
    .eq('contactId', userId)
    .maybeSingle();

  if (!existing) {
    throw new InvalidInput('User is not a member of this organisation');
  }

  const { error } = await supabase
    .from('organisation_members')
    .delete()
    .eq('orgId', orgId)
    .eq('contactId', userId);

  if (error) throw new InvalidSupabase(`Delete Org User Failed: ${error.message}`);

  return {};
}

/**
 * Lists all members of an organisation, including their role.
 * Queries organisation_members directly for both membership and role, then
 * joins with contacts for display fields. The org's owner (organisations.contactId)
 * is included via the OWNER row that is always inserted into organisation_members
 * at creation time.
 */
export async function listOrgUsers(session: string, orgId: number) {
  const userId = await getUserIdFromSession(session);
  if (!userId) throw new UnauthorisedError('Invalid user session');

  // Any member (including MEMBER role) can list the org's users
  await requireOrgMember(userId, orgId);

  // Fetch all member rows with their roles from organisation_members
  const { data: memberRows, error: memberError } = await supabase
    .from('organisation_members')
    .select('contactId, role')
    .eq('orgId', orgId);

  if (memberError) {
    throw new InvalidSupabase(`List Org Users Failed: ${memberError.message}`);
  }

  if (!memberRows || memberRows.length === 0) {
    return { users: [] };
  }

  // Build a role map so we can attach role to each contact
  const roleMap = new Map<number, string>(
    (memberRows as { contactId: number; role: string }[])
      .map(r => [r.contactId, r.role])
  );

  const { data: contactsData, error: contactsError } = await supabase
    .from('contacts')
    .select('contactId, firstName, lastName, email, telephone')
    .in('contactId', Array.from(roleMap.keys()));

  if (contactsError) {
    throw new InvalidSupabase(`List Org Users Failed: ${contactsError.message}`);
  }

  const users = (contactsData ?? []).map((c: {
    contactId: number;
    firstName: string;
    lastName: string;
    email: string;
    telephone: string;
  }) => ({
    ...c,
    role: roleMap.get(c.contactId) ?? 'MEMBER',
  }));

  return { users };
}