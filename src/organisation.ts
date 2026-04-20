import { supabase } from './supabase';
import { InvalidBusinessName, InvalidInput, 
  InvalidSupabase, UnauthorisedError } from './throwError';
import { getUserIdFromSession } from './userHelper';
import { ErrorObject } from './interfaces';

function InvalidBusinessname(businessName: string): ErrorObject | null {
  const charRange: RegExp = /^[a-zA-Z0-9\s\-']+$/;
  if (!charRange.test(businessName)) {
    throw new InvalidBusinessName('invalid business name -> includes special characters');
  }
  if (businessName.length < 2) {
    throw new InvalidBusinessName('Last name is less than 2 characters');
  }
  if (businessName.length > 125) {
    throw new InvalidBusinessName('name is more than 125 characters');
  }
  return null;
}

export async function createOrganisation(session: string, orgName: string, addressId: number) {
  // invalidate session
  const userId = await getUserIdFromSession(session);
  if (!userId) {
    throw new UnauthorisedError('Invalid user session');
  }

  InvalidBusinessname(orgName);

  // find if address in database
  const { data: addressData, error: addressError } = await supabase
    .from('addresses')
    .select('addressID')
    .eq('addressID', addressId)
    .maybeSingle();

  if (!addressData || addressError) {
    throw new InvalidInput('Provided addressId does not exist');
  }

  // insert org
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
    
  return { orgId: data.orgId };
}

export async function updateOrganisation(session: string, orgId: 
    number, orgName: string, addressId: number) {
  // invalid sesion
  const userId = await getUserIdFromSession(session);
  if (!userId) {
    throw new UnauthorisedError('Invalid user session');
  }

  // org belongs to user
  const { data: orgData, error: orgError } = await supabase
    .from('organisations')
    .select('orgId, contactId')
    .eq('orgId', orgId)
    .maybeSingle();

  if (orgError) throw orgError;

  if (!orgData) {
    throw new InvalidInput('no attributed orgId found');
  }

  if (orgData.contactId !== userId) {
    throw new UnauthorisedError('You do not have permission to modify this organization');
  }

  InvalidBusinessname(orgName);

  // verify new address exists
  const { data: addressData } = await supabase
    .from('addresses')
    .select('addressID')
    .eq('addressID', addressId)
    .maybeSingle();

  if (!addressData) {
    throw new InvalidInput('Provided addressId does not exist');
  }

  // update org
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
  // invalid session
  const userId = await getUserIdFromSession(session);
  if (!userId) {
    throw new UnauthorisedError('Invalid user session');
  }

  // check org belongs to user and org exists
  const { data: orgData } = await supabase
    .from('organisations')
    .select('orgId, contactId')
    .eq('orgId', orgId)
    .maybeSingle();

  if (!orgData) {
    throw new InvalidInput('No organisation attributed to orgId');
  }

  if (orgData.contactId !== userId) {
    throw new UnauthorisedError('You do not have permission to delete this organization');
  }

  // check if orders are attached - no delete if orders exist
  const { data: orders } = await supabase
    .from('orders')
    .select('orderId')
    .or(`buyerOrgID.eq.${orgId},sellerOrgID.eq.${orgId}`)
    .limit(1);

  if (orders && orders.length > 0) {
    throw new InvalidInput(
      'Cannot delete organization: There are existing orders associated with it.');
  }

  // delete org
  const { error } = await supabase
    .from('organisations')
    .delete()
    .eq('orgId', orgId);

  if (error) throw new InvalidSupabase(`Org Deletion Failed: ${error.message}`);
    
  return {};
}

/* TODO below. Make sure to check for errors (think permissions, 
and if parameters are valid input). Look at Supabase table and Database to understand*/

/* uncomment this and the other * / below to start workign 
// add and edit users in organisations -> might be kindsa built in alr
export async function addOrgUser(session: string, userId: string, orgId: string) {

  // invalid session
  const currUserId = await getUserIdFromSession(session);
  if (!currUserId) {
    throw new UnauthorisedError('Invalid user session');
  }
    

  // userId already exists in org
}
*/

export async function addOrgUser(session: string, userId: number, orgId: number) {
  // check the caller has a valid session
  const currUserId = await getUserIdFromSession(session);
  if (!currUserId) {
    throw new UnauthorisedError('Invalid user session');
  }

  // check the organisation exists, and get its owner
  const { data: orgData, error: orgError } = await supabase
    .from('organisations')
    .select('orgId, contactId')
    .eq('orgId', orgId)
    .maybeSingle();

  if (orgError) throw orgError;
  if (!orgData) {
    throw new InvalidInput('No organisation attributed to orgId');
  }

  // caller must be the owner of the org
  if (orgData.contactId !== currUserId) {
    throw new UnauthorisedError('You do not have permission to modify this organisation');
  }

  // the user being added must actually exist
  const { data: userData } = await supabase
    .from('contacts')
    .select('contactId')
    .eq('contactId', userId)
    .maybeSingle();

  if (!userData) {
    throw new InvalidInput('Provided userId does not exist');
  }

  // the user must not already be a member
  const { data: existing } = await supabase
    .from('organisation_members')
    .select('id')
    .eq('orgId', orgId)
    .eq('contactId', userId)
    .maybeSingle();

  if (existing) {
    throw new InvalidInput('User is already a member of this organisation');
  }

  // insert the new membership row
  const { error } = await supabase
    .from('organisation_members')
    .insert([{ orgId: orgId, contactId: userId, role: 'member' }]);

  if (error) throw new InvalidSupabase(`Add Org User Failed: ${error.message}`);

  return {};
}


export async function deleteOrgUser(session: string, userId: number, orgId: number) {
  // check the caller has a valid session
  const currUserId = await getUserIdFromSession(session);
  if (!currUserId) {
    throw new UnauthorisedError('Invalid user session');
  }

  // check the organisation exists, and get its owner
  const { data: orgData, error: orgError } = await supabase
    .from('organisations')
    .select('orgId, contactId')
    .eq('orgId', orgId)
    .maybeSingle();

  if (orgError) throw orgError;
  if (!orgData) {
    throw new InvalidInput('No organisation attributed to orgId');
  }

  // caller must be the owner of the org
  if (orgData.contactId !== currUserId) {
    throw new UnauthorisedError('You do not have permission to modify this organisation');
  }

  // can't remove the owner via this function
  if (orgData.contactId === userId) {
    throw new InvalidInput(
      'Cannot remove the organisation owner. Delete the organisation instead.');
  }

  // the user must actually be a member currently
  const { data: existing } = await supabase
    .from('organisation_members')
    .select('id')
    .eq('orgId', orgId)
    .eq('contactId', userId)
    .maybeSingle();

  if (!existing) {
    throw new InvalidInput('User is not a member of this organisation');
  }

  // delete the membership row
  const { error } = await supabase
    .from('organisation_members')
    .delete()
    .eq('orgId', orgId)
    .eq('contactId', userId);

  if (error) throw new InvalidSupabase(`Delete Org User Failed: ${error.message}`);

  return {};
}



export async function listOrgUsers(session: string, orgId: number) {
  // check the caller has a valid session
  const userId = await getUserIdFromSession(session);
  if (!userId) {
    throw new UnauthorisedError('Invalid user session');
  }

  // check the organisation exists, and get its owner
  const { data: orgData } = await supabase
    .from('organisations')
    .select('orgId, contactId')
    .eq('orgId', orgId)
    .maybeSingle();

  if (!orgData) {
    throw new InvalidInput('No organisation attributed to orgId');
  }

  // caller must be the owner OR a member
  let isAuthorised = orgData.contactId === userId;
  if (!isAuthorised) {
    const { data: membership } = await supabase
      .from('organisation_members')
      .select('id')
      .eq('orgId', orgId)
      .eq('contactId', userId)
      .maybeSingle();
    isAuthorised = Boolean(membership);
  }
  if (!isAuthorised) {
    throw new UnauthorisedError(
      'You do not have permission to view this organisation\'s users');
  }

  // collect all member ids: the owner + everyone in organisation_members
  const { data: memberRows, error: memberError } = await supabase
    .from('organisation_members')
    .select('contactId')
    .eq('orgId', orgId);

  if (memberError) {
    throw new InvalidSupabase(`List Org Users Failed: ${memberError.message}`);
  }

  const memberIds = new Set<number>(
    (memberRows ?? []).map((r: { contactId: number }) => r.contactId));
  memberIds.add(orgData.contactId);

  // fetch contact details for everyone in the set
  const { data: contactsData, error: contactsError } = await supabase
    .from('contacts')
    .select('contactId, firstName, lastName, email, telephone')
    .in('contactId', Array.from(memberIds));

  if (contactsError) {
    throw new InvalidSupabase(`List Org Users Failed: ${contactsError.message}`);
  }

  return { users: contactsData ?? [] };
}