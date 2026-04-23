/**
 * orderV3.ts
 *
 * V3 order logic.  Key differences from orderV2.ts:
 *
 *  - Orders are created from a seller's catalogue; prices are set by the
 *    seller, not the buyer.  Buyers cannot inject arbitrary prices.
 *  - The sellerOrgID column is properly set (in v0/v1/v2 it was hardcoded to
 *    1 and not even written to the DB).
 *  - Orders start with status 'PENDING' instead of 'OPEN'.
 *    Status lifecycle: PENDING → ACCEPTED | REJECTED
 *    (buyers may still cancel a PENDING order via the v2 cancel endpoint)
 *  - Sellers can list orders placed with them, get full order detail, and
 *    accept or reject individual orders.
 *  - The DB insert is done inline here (rather than through createOrderSupaPushV2)
 *    so we can write sellerOrgID and the correct status without touching
 *    existing shared data-store helpers.
 */

import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase';
import { getOrderByIdSupa } from './dataStore';
import { requireOrgMember, requireOrgAdminOrOwner } from './orgPermissions';
import { getUserIdFromSession } from './userHelper';
import { uploadUBLForOrder, getSignedUBLUrl } from './generateUBL';
import {
  InvalidInput,
  InvalidOrderId,
  InvalidRequestPeriod,
  InvalidSupabase,
  UnauthorisedError,
} from './throwError';
import { Order, ReqDeliveryPeriod, OrderLineWithItem,
  EmptyObject, createOrderReturn } from './interfaces';

// Types

/** A single item selected from the seller's catalogue when placing an order. */
export interface CatalogueOrderItem {
  catalogueItemId: number;
  quantity: number;
}

// Private helpers

/**
 * Inserts an order, delivery, and order_lines into Supabase.
 * Separated from createOrderSupaPushV2 so v3 can write a proper
 * sellerOrgID and a non-OPEN initial status without modifying shared helpers.
 *
 * Delivery and per-item inserts run concurrently via Promise.all to reduce
 * round-trip latency when an order has multiple line items.
 */
async function insertOrderV3(
  order: Order,
  deliveryAddressId: number,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  items: { name: string; description: string; unitPrice: number; quantity: number }[]
): Promise<void> {
  const { error: orderError } = await supabase
    .from('orders')
    .insert([{
      orderId: order.orderId,
      currency: order.currency,
      finalPrice: order.finalPrice,
      taxExclusive: order.taxExclusive,
      taxInclusive: order.taxInclusive,
      buyerOrgID: order.buyerOrgID,
      sellerOrgID: order.sellerOrgID,
      status: order.status,
      issuedDate: order.issuedDate,
      issuedTime: order.issuedTime,
    }]);

  if (orderError) {
    throw new InvalidSupabase(`Order creation failed: ${orderError.message}`);
  }

  // Delivery insert and each item's insert are independent — run them in parallel.
  await Promise.all([
    supabase.from('deliveries').insert([{
      orderID: order.orderId,
      deliveryAddressID: deliveryAddressId,
      startDate: reqDeliveryPeriod.startDateTime.toString(),
      endDate: reqDeliveryPeriod.endDateTime.toString(),
    }]),
    ...items.map(async (item) => {
      const { data: itemData } = await supabase
        .from('items')
        .insert([{ name: item.name, price: item.unitPrice, description: item.description }])
        .select()
        .single();

      if (itemData) {
        await supabase.from('order_lines').insert([{
          orderID: order.orderId,
          itemID: itemData.itemId,
          quantity: item.quantity,
          status: 'PENDING',
        }]);
      }
    }),
  ]);
}

/**
 * Asserts the order exists and belongs to the given seller org.
 * Throws appropriate typed errors so the handler can return the right HTTP code.
 */
async function assertOrderBelongsToSeller(orderId: string, sellerOrgId: number): Promise<Order> {
  const order = await getOrderByIdSupa(orderId);
  if (!order) {
    throw new InvalidOrderId('Order not found');
  }
  if (order.sellerOrgID !== sellerOrgId) {
    throw new UnauthorisedError('This order was not placed with your organisation');
  }
  return order;
}

// Public API

/**
 * Creates an order from a seller's catalogue.
 *
 * The buyer picks items from the seller's catalogue by ID and specifies
 * quantities.  Prices come from the catalogue - buyers cannot inject
 * their own prices.  The order is placed as PENDING and the seller must
 * accept or reject it.
 */
export async function createOrderFromCatalogue(
  buyerOrgId: number,
  session: string,
  sellerOrgId: number,
  deliveryAddressId: number,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  catalogueItems: CatalogueOrderItem[]
): Promise<createOrderReturn> {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, buyerOrgId);

  if (!Array.isArray(catalogueItems) || catalogueItems.length === 0) {
    throw new InvalidInput('At least one catalogue item is required');
  }
  for (const ci of catalogueItems) {
    if (!Number.isInteger(ci.catalogueItemId) || ci.catalogueItemId <= 0) {
      throw new InvalidInput('Each item must reference a valid catalogueItemId');
    }
    if (!Number.isInteger(ci.quantity) || ci.quantity <= 0) {
      throw new InvalidInput('Each item must have a positive integer quantity');
    }
  }
  if (!Number.isInteger(deliveryAddressId) || deliveryAddressId <= 0) {
    throw new InvalidInput('deliveryAddressId must be a positive integer');
  }
  if (reqDeliveryPeriod.endDateTime <= reqDeliveryPeriod.startDateTime) {
    throw new InvalidRequestPeriod('The requested delivery period is invalid.');
  }

  const itemIds = catalogueItems.map(ci => ci.catalogueItemId);
  const { data: catalogueData, error: catError } = await supabase
    .from('catalogue_items')
    .select('catalogueItemId, name, description, price, active, orgId')
    .in('catalogueItemId', itemIds);

  if (catError) throw new InvalidSupabase(catError.message);

  type CatRow = { catalogueItemId: number; name: string; description: string | null;
    price: number; active: boolean; orgId: number };

  const itemMap = new Map<number, { name: string; description: string; price: number }>();
  for (const ci of catalogueItems) {
    const found = (catalogueData as CatRow[] ?? [])
      .find(r => r.catalogueItemId === ci.catalogueItemId);
    if (!found) {
      throw new InvalidInput(`Catalogue item ${ci.catalogueItemId} not found`);
    }
    if (!found.active) {
      throw new InvalidInput(`Catalogue item ${ci.catalogueItemId} is no longer available`);
    }
    if (found.orgId !== sellerOrgId) {
      throw new InvalidInput(
        `Catalogue item ${ci.catalogueItemId} does not belong to the specified seller organisation`
      );
    }
    itemMap.set(ci.catalogueItemId, {
      name: found.name,
      description: found.description ?? '',
      price: Number(found.price),
    });
  }

  let taxExclusive = 0;
  const reqItems = catalogueItems.map(ci => {
    const item = itemMap.get(ci.catalogueItemId)!;
    taxExclusive += item.price * ci.quantity;
    return { name: item.name, description: item.description,
      unitPrice: item.price, quantity: ci.quantity };
  });

  const taxInclusive = taxExclusive * 1.1;
  const orderId = uuidv4();
  const currTime = new Date();

  const order: Order = {
    orderId,
    issuedDate: currTime.toISOString().slice(0, 10),
    issuedTime: currTime.toLocaleTimeString('en-AU'),
    currency: 'AUD',
    status: 'PENDING',
    buyerOrgID: buyerOrgId,
    sellerOrgID: sellerOrgId,
    taxExclusive,
    taxInclusive,
    finalPrice: taxInclusive,
  };

  await insertOrderV3(order, deliveryAddressId, reqDeliveryPeriod, reqItems);
  await uploadUBLForOrder(orderId, userId);
  return { orderId };
}

/**
 * Lists orders that were placed with the given org as the SELLER.
 * Optionally filter by status (e.g. 'PENDING', 'ACCEPTED', 'REJECTED').
 */
export async function listReceivedOrders(
  sellerOrgId: number,
  session: string,
  status?: string
): Promise<{ orders: unknown[] }> {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, sellerOrgId);

  let query = supabase
    .from('orders')
    .select('orderId, status, issuedDate, finalPrice, currency, buyerOrgID')
    .eq('sellerOrgID', sellerOrgId);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: orders, error } = await query;
  if (error) throw new InvalidSupabase(error.message);
  return { orders: orders ?? [] };
}

/**
 * Returns full details of a received order for the seller.
 * Includes items, delivery address, buyer org ID, and current status.
 */
export async function getReceivedOrderInfo(
  sellerOrgId: number,
  session: string,
  orderId: string
) {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, sellerOrgId);

  const order = await assertOrderBelongsToSeller(orderId, sellerOrgId);

  const delivery = order.deliveries?.[0];
  const address = delivery?.addresses;

  return {
    orderId,
    status: order.status,
    issuedDate: order.issuedDate,
    issuedTime: order.issuedTime,
    currency: order.currency,
    taxExclusive: Number(order.taxExclusive || 0),
    taxInclusive: Number(order.taxInclusive || 0),
    finalPrice: Number(order.finalPrice || 0),
    address: address?.street || '',
    deliveryAddressId: delivery?.deliveryAddressID ?? null,
    buyerOrgId: order.buyerOrgID,
    deliveryDetails: {
      startDateTime: Number(delivery?.startDate || 0),
      endDateTime: Number(delivery?.endDate || 0),
    },
    items: (order.order_lines || []).map((line: OrderLineWithItem) => ({
      name: line.items?.name || 'Unknown',
      description: line.items?.description || '',
      unitPrice: Number(line.items?.price || 0),
      quantity: line.quantity,
    })),
  };
}

/**
 * Accepts a PENDING order (seller action).
 * Status transitions: PENDING → ACCEPTED.
 * Only ADMIN or OWNER of the seller org may accept.
 */
export async function acceptOrder(
  sellerOrgId: number,
  orderId: string,
  session: string
): Promise<EmptyObject> {
  const userId = await getUserIdFromSession(session);
  await requireOrgAdminOrOwner(userId, sellerOrgId);

  const order = await assertOrderBelongsToSeller(orderId, sellerOrgId);

  if (order.status !== 'PENDING') {
    throw new InvalidInput(`Cannot accept an order with status '${order.status}'`);
  }

  const { error } = await supabase
    .from('orders')
    .update({ status: 'ACCEPTED' })
    .eq('orderId', orderId);

  if (error) throw new InvalidSupabase(error.message);
  return {};
}

/**
 * Rejects a PENDING order (seller action).
 * Status transitions: PENDING → REJECTED.
 * A reason is required - it may be stored/returned for buyer communication.
 * Only ADMIN or OWNER of the seller org may reject.
 */
export async function rejectOrder(
  sellerOrgId: number,
  orderId: string,
  reason: string,
  session: string
): Promise<{ reason: string }> {
  const userId = await getUserIdFromSession(session);
  await requireOrgAdminOrOwner(userId, sellerOrgId);

  if (!reason || reason.trim().length === 0) {
    throw new InvalidInput('A rejection reason is required');
  }

  const order = await assertOrderBelongsToSeller(orderId, sellerOrgId);

  if (order.status !== 'PENDING') {
    throw new InvalidInput(`Cannot reject an order with status '${order.status}'`);
  }

  const { error } = await supabase
    .from('orders')
    .update({ status: 'REJECTED' })
    .eq('orderId', orderId);

  if (error) throw new InvalidSupabase(error.message);
  return { reason: reason.trim() };
}

/**
 * Returns a signed URL for the UBL document of a received order.
 * Seller-side equivalent of getOrderUBL in orderV2.
 */
export async function getReceivedOrderUBL(
  sellerOrgId: number,
  session: string,
  orderId: string
): Promise<string> {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, sellerOrgId);
  await assertOrderBelongsToSeller(orderId, sellerOrgId);
  return getSignedUBLUrl(orderId);
}

/**
 * Lists all organisations - lets buyers discover sellers and their org IDs
 * before browsing catalogues.  Any authenticated user may call this.
 */
export async function listOrganisations(
  session: string
): Promise<{ organisations: { orgId: number; orgName: string }[] }> {
  await getUserIdFromSession(session);

  const { data, error } = await supabase
    .from('organisations')
    .select('orgId, orgName');

  if (error) throw new InvalidSupabase(error.message);
  return { organisations: data ?? [] };
}