import { supabase } from './supabase';
import { InvalidBusinessName, InvalidInput, 
  InvalidSupabase, UnauthorisedError } from './throwError';
import { getUserIdFromSession } from './userHelper';
import { requireOrgAdminOrOwner, requireOrgOwner, requireOrgMember } from './orgPermissions';
import { ErrorObject } from './interfaces';

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

  // add creator as OWNER in organisation_members
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

export async function addOrgUser(session: string, userId: number, orgId: number) {
  const currUserId = await getUserIdFromSession(session);
  if (!currUserId) throw new UnauthorisedError('Invalid user session');

  // ADMIN or OWNER can add members
  await requireOrgAdminOrOwner(currUserId, orgId);

  const { data: userData } = await supabase
    .from('contacts')
    .select('contactId')
    .eq('contactId', userId)
    .maybeSingle();

  if (!userData) {
    throw new InvalidInput('Provided userId does not exist');
  }

  const { data: existing } = await supabase
    .from('organisation_members')
    .select('id')
    .eq('orgId', orgId)
    .eq('contactId', userId)
    .maybeSingle();

  if (existing) {
    throw new InvalidInput('User is already a member of this organisation');
  }

  // FIX: was 'member' (lowercase) which violates the DB CHECK constraint
  const { error } = await supabase
    .from('organisation_members')
    .insert([{ orgId: orgId, contactId: userId, role: 'MEMBER' }]);

  if (error) throw new InvalidSupabase(`Add Org User Failed: ${error.message}`);

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

export async function listOrgUsers(session: string, orgId: number) {
  const userId = await getUserIdFromSession(session);
  if (!userId) throw new UnauthorisedError('Invalid user session');

  // Any member (including MEMBER role) can list the org's users
  await requireOrgMember(userId, orgId);

  // Owner contact + all member rows
  const { data: orgData } = await supabase
    .from('organisations')
    .select('contactId')
    .eq('orgId', orgId)
    .maybeSingle();

  const { data: memberRows, error: memberError } = await supabase
    .from('organisation_members')
    .select('contactId')
    .eq('orgId', orgId);

  if (memberError) {
    throw new InvalidSupabase(`List Org Users Failed: ${memberError.message}`);
  }

  const memberIds = new Set<number>(
    (memberRows ?? []).map((r: { contactId: number }) => r.contactId));
  if (orgData) memberIds.add(orgData.contactId);

  const { data: contactsData, error: contactsError } = await supabase
    .from('contacts')
    .select('contactId, firstName, lastName, email, telephone')
    .in('contactId', Array.from(memberIds));

  if (contactsError) {
    throw new InvalidSupabase(`List Org Users Failed: ${contactsError.message}`);
  }

  return { users: contactsData ?? [] };
}