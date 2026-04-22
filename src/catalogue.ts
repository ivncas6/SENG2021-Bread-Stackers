/**
 * Design decisions:
 *  - Only ADMIN or OWNER of an org can mutate catalogue items.
 *  - Any authenticated user can read (list/get) catalogue items so buyers
 *    can browse seller offerings without needing org membership.
 *  - Deletions are soft (active = false) so historical order data referencing
 *    item names/prices is never broken.
 *  - Deduplication is NOT applied here (unlike addresses) because two orgs
 *    legitimately sell the same product at different prices.
 */

import { supabase } from './supabase';
import { InvalidInput, InvalidSupabase } from './throwError';
import { getUserIdFromSession } from './userHelper';
import { requireOrgAdminOrOwner } from './orgPermissions';

// Types

export interface CatalogueItem {
  catalogueItemId: number;
  orgId: number;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
}

export interface CatalogueItemId {
  catalogueItemId: number;
}

// helpers

function validateName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new InvalidInput('Item name is required');
  }
  if (name.length > 200) {
    throw new InvalidInput('Item name is too long (max 200 characters)');
  }
}

function validatePrice(price: unknown): void {
  if (typeof price !== 'number' || isNaN(price) || price < 0) {
    throw new InvalidInput('Price must be a non-negative number');
  }
}

// CRUD functions

// creates a new catalogue item owned by the given org.
// caller must be ADMIN or OWNER of that org.
export async function createCatalogueItem(
  session:     string,
  orgId:       number,
  name:        string,
  description: string | undefined,
  price:       number
): Promise<CatalogueItemId> {
  const userId = await getUserIdFromSession(session);
  await requireOrgAdminOrOwner(userId, orgId);

  validateName(name);
  validatePrice(price);

  const { data, error } = await supabase
    .from('catalogue_items')
    .insert([{
      orgId,
      name:        name.trim(),
      description: description ?? null,
      price,
      active:      true,
    }])
    .select()
    .single();

  if (error) throw new InvalidSupabase(`Catalogue item creation failed: ${error.message}`);
  return { catalogueItemId: data.catalogueItemId };
}

/**
 * Returns all active catalogue items belonging to the given org.
 * Any authenticated user may call this so buyers can browse seller offerings.
 */
export async function listCatalogueItems(
  session: string,
  orgId:   number
): Promise<{ items: CatalogueItem[] }> {
  // Authentication check — caller must hold a valid session but need not be
  // a member of the seller org.
  await getUserIdFromSession(session);

  const { data, error } = await supabase
    .from('catalogue_items')
    .select('catalogueItemId, orgId, name, description, price, active')
    .eq('orgId', orgId)
    .eq('active', true);

  if (error) throw new InvalidSupabase(error.message);
  return { items: data ?? [] };
}

/**
 * Returns a single catalogue item by its primary key.
 * Active or inactive — so sellers can inspect their own soft-deleted items.
 * Any authenticated user may call this.
 */
export async function getCatalogueItem(
  session:  string,
  itemId:   number
): Promise<CatalogueItem> {
  await getUserIdFromSession(session);

  const { data, error } = await supabase
    .from('catalogue_items')
    .select('catalogueItemId, orgId, name, description, price, active')
    .eq('catalogueItemId', itemId)
    .maybeSingle();

  if (error) throw new InvalidSupabase(error.message);
  if (!data)  throw new InvalidInput('Catalogue item not found');
  return data as CatalogueItem;
}

/**
 * Partially updates a catalogue item.  Only the fields present in `updates`
 * are changed; omitted fields keep their current values.
 * Caller must be ADMIN or OWNER of the item's org.
 */
export async function updateCatalogueItem(
  session: string,
  orgId:   number,
  itemId:  number,
  updates: {
    name?:        string;
    description?: string;
    price?:       number;
    active?:      boolean;
  }
): Promise<CatalogueItemId> {
  const userId = await getUserIdFromSession(session);
  await requireOrgAdminOrOwner(userId, orgId);

  // Verify the item exists and belongs to this org
  const { data: existing } = await supabase
    .from('catalogue_items')
    .select('catalogueItemId')
    .eq('catalogueItemId', itemId)
    .eq('orgId', orgId)
    .maybeSingle();

  if (!existing) throw new InvalidInput('Catalogue item not found in this organisation');

  // Strip undefined values so we only send changed fields to Supabase
  const fields = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  ) as Record<string, unknown>;

  if (Object.keys(fields).length === 0) {
    throw new InvalidInput('No fields provided for update');
  }

  if (fields['name'] !== undefined) {
    validateName(fields['name'] as string);
    fields['name'] = (fields['name'] as string).trim();
  }

  if (fields['price'] !== undefined) {
    validatePrice(fields['price']);
  }

  const { error } = await supabase
    .from('catalogue_items')
    .update(fields)
    .eq('catalogueItemId', itemId);

  if (error) throw new InvalidSupabase(`Catalogue item update failed: ${error.message}`);
  return { catalogueItemId: itemId };
}

/**
 * Soft-deletes a catalogue item by setting active = false.
 * Hard deletion is deliberately avoided so historical order lines that
 * reference item names / prices remain intact.
 * Caller must be ADMIN or OWNER of the item's org.
 */
export async function deleteCatalogueItem(
  session: string,
  orgId:   number,
  itemId:  number
): Promise<Record<string, never>> {
  const userId = await getUserIdFromSession(session);
  await requireOrgAdminOrOwner(userId, orgId);

  const { data: existing } = await supabase
    .from('catalogue_items')
    .select('catalogueItemId')
    .eq('catalogueItemId', itemId)
    .eq('orgId', orgId)
    .maybeSingle();

  if (!existing) throw new InvalidInput('Catalogue item not found in this organisation');

  const { error } = await supabase
    .from('catalogue_items')
    .update({ active: false })
    .eq('catalogueItemId', itemId);

  if (error) throw new InvalidSupabase(`Catalogue item deletion failed: ${error.message}`);
  return {};
}