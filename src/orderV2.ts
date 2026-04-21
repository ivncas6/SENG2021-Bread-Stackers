import { createOrderReturn, EmptyObject, Order, 
  ReqDeliveryPeriod, ReqItem, OrderLineWithItem } from './interfaces';
import { v4 as uuidv4 } from 'uuid';
import {
  createOrderSupaPushV2,
  getOrderByIdSupa,
  updateOrderSupaV2,
  deleteOrderSupa,
} from './dataStore';
import { requireOrgMember } from './orgPermissions';
import {
  InvalidDeliveryAddr,
  InvalidInput,
  InvalidOrderId,
  InvalidRequestPeriod,
  InvalidSupabase,
  UnauthorisedError,
} from './throwError';
import { getUserIdFromSession } from './userHelper';
import { supabase } from './supabase';
import { uploadUBLForOrder, getSignedUBLUrl } from './generateUBL';

/**
 * V2 order logic. Key differences from order.ts (V0/V1):
 *  - orgId is taken from the URL path
 *  - deliveryAddressId (number) is used instead of a raw address string —
 *    callers must first create an address via POST /v2/address
 *  - Auth uses requireOrgMember so any member of the org can act
 *  - UBL helpers skip the redundant permission check
 *  - Items are validated here in the business layer (not the handler)
 */


// helpers

// Validates the items array. Throws InvalidInput (400) on any problem.
// Kept here in the business layer so the rule applies regardless of
// which handler calls createOrder or updateOrder.
function validateItems(items: ReqItem[]): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new InvalidInput('At least one item is required');
  }
  for (const item of items) {
    if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
      throw new InvalidInput('Each item must have a non-empty name');
    }
    if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
      throw new InvalidInput('Each item must have a non-negative unitPrice');
    }
    if (
      typeof item.quantity !== 'number' ||
      item.quantity <= 0 ||
      !Number.isInteger(item.quantity)
    ) {
      throw new InvalidInput('Each item must have a positive integer quantity');
    }
  }
}

// Verifies the order exists and belongs to the given org. Throws if not.
async function assertOrderBelongsToOrg(orderId: string, orgId: number): Promise<Order> {
  const order = await getOrderByIdSupa(orderId);
  if (!order) {
    throw new InvalidOrderId('Provided orderId does not correspond to any existing order');
  }
  if (order.buyerOrgID !== orgId) {
    throw new UnauthorisedError('This order does not belong to your organisation');
  }
  return order;
}

// order funcs

export async function createOrder(
  orgId: number,
  currency: string,
  session: string,
  deliveryAddressId: number,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  items: ReqItem[]
): Promise<createOrderReturn> {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, orgId);

  // Validate items in the business layer so any caller gets the same error.
  validateItems(items);

  if (!Number.isInteger(deliveryAddressId) || deliveryAddressId <= 0) {
    throw new InvalidDeliveryAddr('deliveryAddressId must be a positive integer');
  }

  if (reqDeliveryPeriod.endDateTime <= reqDeliveryPeriod.startDateTime) {
    throw new InvalidRequestPeriod('The requested delivery period is invalid.');
  }

  let taxExclusive = 0;
  for (const i of items) taxExclusive += i.unitPrice * i.quantity;
  const taxInclusive = taxExclusive * 1.1;
  const orderId = uuidv4();
  const currTime = new Date();

  const order: Order = {
    orderId,
    issuedDate: currTime.toISOString().slice(0, 10),
    issuedTime: currTime.toLocaleTimeString('en-AU'),
    currency,
    status: 'OPEN',
    buyerOrgID: orgId,
    sellerOrgID: 1,
    taxExclusive,
    taxInclusive,
    finalPrice: taxInclusive,
  };

  await createOrderSupaPushV2(order, deliveryAddressId, reqDeliveryPeriod, items);
  await uploadUBLForOrder(orderId, userId);
  return { orderId };
}

export async function cancelOrder(
  orgId: number,
  orderId: string,
  reason: string,
  session: string
): Promise<{ reason: string }> {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, orgId);
  await assertOrderBelongsToOrg(orderId, orgId);
  await deleteOrderSupa(orderId);
  return { reason };
}

export async function getOrderInfo(
  orgId: number,
  session: string,
  orderId: string
) {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, orgId);

  const order = await assertOrderBelongsToOrg(orderId, orgId);

  const delivery = order.deliveries?.[0];
  const address = delivery?.addresses;
  const contact = order.organisations?.contacts;

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
    deliveryDetails: {
      startDateTime: Number(delivery?.startDate || 0),
      endDateTime: Number(delivery?.endDate || 0),
    },
    userDetails: {
      firstName: contact?.firstName || '',
      lastName: contact?.lastName || '',
      telephone: contact?.telephone || '',
      email: contact?.email || '',
    },
    items: (order.order_lines || []).map((line: OrderLineWithItem) => ({
      name: line.items?.name || 'Unknown',
      description: line.items?.description || '',
      unitPrice: Number(line.items?.price || 0),
      quantity: line.quantity,
    })),
  };
}

export async function listOrders(orgId: number, session: string) {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, orgId);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('orderId, status, issuedDate, finalPrice, currency')
    .eq('buyerOrgID', orgId);

  if (error) throw new InvalidSupabase(error.message);
  return { orders };
}

export async function updateOrder(
  orgId: number,
  session: string,
  orderId: string,
  deliveryAddressId: number,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  status: string
): Promise<EmptyObject> {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, orgId);
  await assertOrderBelongsToOrg(orderId, orgId);

  if (!Number.isInteger(deliveryAddressId) || deliveryAddressId <= 0) {
    throw new InvalidDeliveryAddr('deliveryAddressId must be a positive integer');
  }
  if (reqDeliveryPeriod.endDateTime <= reqDeliveryPeriod.startDateTime) {
    throw new InvalidRequestPeriod('The requested delivery period is invalid.');
  }

  await updateOrderSupaV2(orderId, deliveryAddressId, reqDeliveryPeriod, status);
  await uploadUBLForOrder(orderId, userId);
  return {};
}

export async function getOrderUBL(
  orgId: number,
  session: string,
  orderId: string
): Promise<string> {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, orgId);
  await assertOrderBelongsToOrg(orderId, orgId);
  return getSignedUBLUrl(orderId);
}

export async function getOrdersByOrg(orgId: number, session: string) {
  return listOrders(orgId, session);
}