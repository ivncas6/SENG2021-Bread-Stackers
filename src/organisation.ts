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

  if (!orgData || orgData.contactId !== userId) {
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

// add and edit users in organisations -> might be kindsa built in alr
export async function addOrgUser(session: string, userId: string, orgId: string) {

  // invalid session
  const currUserId = await getUserIdFromSession(session);
  if (!currUserId) {
    throw new UnauthorisedError('Invalid user session');
  }
    

  // userId already exists in org
}

export async function deleteOrgUser(session: string, userId: string, orgId: string) {

  // invalid session
  const currUserId = await getUserIdFromSession(session);
  if (!currUserId) {
    throw new UnauthorisedError('Invalid user session');
  }


  // userId does not exist in org
    
}
