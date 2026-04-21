import { supabase } from './supabase';
import { InvalidInput, InvalidSupabase } from './throwError';
import { getUserIdFromSession } from './userHelper';

/**
 * Creates a new address record. Any authenticated user may create one.
 * Returns the generated addressId so callers can reference it in
 * createOrganisation or v2 order routes.
 */
export async function createAddress(
  session: string,
  street: string,
  city?: string,
  postcode?: string,
  country: string = 'AUS'
) {
  await getUserIdFromSession(session);

  if (!street || street.trim().length === 0) {
    throw new InvalidInput('Street is required');
  }
  if (street.length > 200) {
    throw new InvalidInput('Street address is too long');
  }

  const { data, error } = await supabase
    .from('addresses')
    .insert([{ street, city: city ?? null, postcode: postcode ?? null, country }])
    .select()
    .single();

  if (error) throw new InvalidSupabase(`Address creation failed: ${error.message}`);
  return { addressId: data.addressID };
}

// Returns a single address record by its primary key.
export async function getAddress(session: string, addressId: number) {
  await getUserIdFromSession(session);

  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .eq('addressID', addressId)
    .maybeSingle();

  if (error) throw new InvalidSupabase(error.message);
  if (!data) throw new InvalidInput('Address not found');
  return data;
}


// patches any fields on an existing address. 
// needs at least one field.
export async function updateAddress(
  session: string,
  addressId: number,
  updates: { street?: string; city?: string; postcode?: string; country?: string }
) {
  await getUserIdFromSession(session);

  // verify address exists
  const { data: existing } = await supabase
    .from('addresses')
    .select('addressID')
    .eq('addressID', addressId)
    .maybeSingle();

  if (!existing) throw new InvalidInput('Address not found');

  // strip undefined fields
  const fields = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  ) as Record<string, string>;

  if (Object.keys(fields).length === 0) {
    throw new InvalidInput('No fields provided for update');
  }

  if (fields['street'] && fields['street'].length > 200) {
    throw new InvalidInput('Street address is too long');
  }

  const { error } = await supabase
    .from('addresses')
    .update(fields)
    .eq('addressID', addressId);

  if (error) throw new InvalidSupabase(`Address update failed: ${error.message}`);
  return { addressId };
}

// deletes an address, but only if it is not currently referenced by any
// delivery or organisation row.
export async function deleteAddress(session: string, addressId: number) {
  await getUserIdFromSession(session);

  // guard: in use by a delivery?
  const { data: deliveryUse } = await supabase
    .from('deliveries')
    .select('deliveryID')
    .eq('deliveryAddressID', addressId)
    .limit(1);

  if (deliveryUse && deliveryUse.length > 0) {
    throw new InvalidInput(
      'Cannot delete address: it is referenced by an existing order delivery'
    );
  }

  // check if used by an organisation
  const { data: orgUse } = await supabase
    .from('organisations')
    .select('orgId')
    .eq('addressId', addressId)
    .limit(1);

  if (orgUse && orgUse.length > 0) {
    throw new InvalidInput(
      'Cannot delete address: it is referenced by an organisation'
    );
  }

  const { error } = await supabase
    .from('addresses')
    .delete()
    .eq('addressID', addressId);

  if (error) throw new InvalidSupabase(`Address deletion failed: ${error.message}`);
  return {};
}