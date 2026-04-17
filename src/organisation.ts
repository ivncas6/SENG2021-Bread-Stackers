import { v4 as uuidv4 } from 'uuid';
import { supabase } from "./supabase";
import { InvalidBusinessName, InvalidLastName, InvalidSupabase, UnauthorisedError } from "./throwError";
import { getUserIdFromSession } from "./userHelper";
import { ErrorObject } from './interfaces';
import { getOrgByUserId } from './dataStore';

function InvalidBusinessname(businessName: string): ErrorObject | null {
  const charRange: RegExp = /^[a-zA-Z\s\-']+$/;
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


export async function createOrganisation(session: string, orgName: string, addressId: string) {

    // invalid session
    const userId = await getUserIdFromSession(session);
    if (!userId) {
        throw new UnauthorisedError("Invalid user session");
    }

    // invalid orgName: 
    InvalidBusinessname(orgName);

    // invalid addressId -> grab from supabase
    

    const orgId: string = uuidv4();
    const { error } = await supabase
    .from('organisations')
    .insert([{ 
        orgId: orgId,
        orgName: orgName,
        addressId: addressId,
        contactId: userId,
    }])
    .select()
    .single();

    if (error) throw new InvalidSupabase(`Org Creation Failed: ${error.message}`);
    return { orgId };
}

export async function updateOrganisation(session: string, orgId: string, orgName: string, addressId: string) {

    // invalid session
    const userId = await getUserIdFromSession(session);
    if (!userId) {
        throw new UnauthorisedError("Invalid user session");
    }

    // invalid OrgId


    // org doesn't belong to user
    const { data: orgData } = await getOrgByUserId(Number(userId));
    if (orgData?.orgId != orgId) {
        throw new UnauthorisedError('User has no associated organization');
    }

    // invalid updated name
    InvalidBusinessname(orgName);

    // invalid addressId

    const { data, error } = await supabase
    .from('organisations')
    .update([{ 
        orgId: orgId,
        orgName: orgName,
        addressId: addressId,
        contactId: userId,
    }])
    .eq('orgId', orgId);

    if (error) throw new InvalidSupabase(`Org Creation Failed: ${error.message}`);
    return { orgId };
}

// optional, needs separate logic like (can't delete, still have orders and users)
export async function deleteOrganisation(session: string, orgId: string) {
    // check if orders and users attached

    // invalid session
    const userId = await getUserIdFromSession(session);
    if (!userId) {
        throw new UnauthorisedError("Invalid user session");
    }

    // invalid orgId


    // org doesn't belong to user
    const { data: orgData } = await getOrgByUserId(Number(userId));
    if (orgData?.orgId != orgId) {
        throw new UnauthorisedError('User has no associated organization');
    }

}

// add and edit users in organisations -> might be kindsa built in alr
export async function addOrgUser(session: string, userId: string, orgId: string) {

    // invalid session
    const currUserId = await getUserIdFromSession(session);
    if (!currUserId) {
        throw new UnauthorisedError("Invalid user session");
    }
    

    // userId already exists in org
}

export async function deleteOrgUser(session: string, userId: string, orgId: string) {

    // invalid session
    const currUserId = await getUserIdFromSession(session);
    if (!currUserId) {
        throw new UnauthorisedError("Invalid user session");
    }


    // userId does not exist in org
    
}
