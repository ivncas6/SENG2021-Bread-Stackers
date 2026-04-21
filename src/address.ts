import { supabase } from './supabase';
import { InvalidInput, InvalidSupabase } from './throwError';
import { getUserIdFromSession } from './userHelper';
import { requireOrgMember } from './orgPermissions';

/**
 * Creates an address record, or returns the existing one if an identical
 * address already exists. This way two organisations entering the same
 * physical address share a single row rather than creating duplicates.
 *
 * Matching is done on all four fields. Null city/postcode use IS NULL so
 * the SQL comparison works correctly.
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

  // Dedup: build a query that handles nullable city/postcode correctly.
  // supabase-js uses .eq() for value comparisons and .is() for NULL checks.
  let dupQuery = supabase
    .from('addresses')
    .select('addressID')
    .eq('street', street)
    .eq('country', country);

  dupQuery = city
    ? dupQuery.eq('city', city)
    : dupQuery.is('city', null);

  dupQuery = postcode
    ? dupQuery.eq('postcode', postcode)
    : dupQuery.is('postcode', null);

  const { data: existing } = await dupQuery.maybeSingle();
  if (existing) {
    // Identical address already exists — return it rather than inserting a duplicate.
    return { addressId: existing.addressID };
  }

  const { data, error } = await supabase
    .from('addresses')
    .insert([{ street, city: city ?? null, postcode: postcode ?? null, country }])
    .select()
    .single();

  if (error) throw new InvalidSupabase(`Address creation failed: ${error.message}`);
  return { addressId: data.addressID };
}

/**
 * Returns all addresses associated with an organisation:
 *   1. The org's own registered address (organisations.addressId).
 *   2. Every unique delivery address used across the org's orders.
 *
 * This gives the frontend a full reusable address list for dropdowns
 * when creating/updating orders or editing the org itself.
 */
export async function listAddresses(session: string, orgId: number) {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, orgId);

  // Step 1 — org's own registered address.
  const { data: orgData } = await supabase
    .from('organisations')
    .select('addressId')
    .eq('orgId', orgId)
    .maybeSingle();

  const addressIds = new Set<number>();
  if (orgData?.addressId) addressIds.add(orgData.addressId);

  // Step 2 — all orders belonging to this org.
  const { data: orderRows } = await supabase
    .from('orders')
    .select('orderId')
    .eq('buyerOrgID', orgId);

  const orderIds = (orderRows ?? []).map((o: { orderId: string }) => o.orderId);

  // Step 3 — delivery addresses from those orders.
  if (orderIds.length > 0) {
    const { data: deliveryRows } = await supabase
      .from('deliveries')
      .select('deliveryAddressID')
      .in('orderID', orderIds);

    (deliveryRows ?? []).forEach((d: { deliveryAddressID: number | null }) => {
      if (d.deliveryAddressID) addressIds.add(d.deliveryAddressID);
    });
  }

  if (addressIds.size === 0) return { addresses: [] };

  // Step 4 — fetch full address rows for all collected IDs.
  const { data: addresses, error } = await supabase
    .from('addresses')
    .select('addressID, street, city, postcode, country')
    .in('addressID', Array.from(addressIds));

  if (error) throw new InvalidSupabase(error.message);
  return { addresses: addresses ?? [] };
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

// Patches any supplied fields on an existing address. At least one is required.
export async function updateAddress(
  session: string,
  addressId: number,
  updates: { street?: string; city?: string; postcode?: string; country?: string }
) {
  await getUserIdFromSession(session);

  const { data: existing } = await supabase
    .from('addresses')
    .select('addressID')
    .eq('addressID', addressId)
    .maybeSingle();

  if (!existing) throw new InvalidInput('Address not found');

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

/**
 * Deletes an address only when it is not referenced by any delivery or
 * organisation row — prevents FK violations.
 */
export async function deleteAddress(session: string, addressId: number) {
  await getUserIdFromSession(session);

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