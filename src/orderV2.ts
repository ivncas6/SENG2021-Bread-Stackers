import { createOrderReturn, EmptyObject, Order, 
  ReqDeliveryPeriod, ReqItem, OrderLineWithItem } from './interfaces';
import { v4 as uuidv4 } from 'uuid';
import {
  createOrderSupaPush,
  getOrderByIdSupa,
  updateOrderSupa,
  deleteOrderSupa,
} from './dataStore';
import { requireOrgMember } from './orgPermissions';
import {
  InvalidDeliveryAddr,
  InvalidOrderId,
  InvalidRequestPeriod,
  InvalidSupabase,
  UnauthorisedError,
} from './throwError';
import { getUserIdFromSession } from './userHelper';
import { supabase } from './supabase';
import { uploadUBLForOrder, getSignedUBLUrl } from './generateUBL';

/**
 *  key differences from order.ts (V0/V1):
 *  - orgId is passed explicitly by the caller (taken from the URL path)
 *  - Auth uses requireOrgMember from orgPermissions so any member of the
 *    org can operate on its orders, not just the owner
 *  - UBL generation uses the lightweight uploadUBLForOrder / getSignedUBLUrl
 *    helpers that do not repeat the permission check
 */


// helpers

// verify order belongs to given org. Throws if not.
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
  deliveryAddress: string,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  items: ReqItem[]
): Promise<createOrderReturn> {
  const userId = await getUserIdFromSession(session);
  // Any member of the org can create orders
  await requireOrgMember(userId, orgId);

  if (deliveryAddress.length > 200) {
    throw new InvalidDeliveryAddr('The address is too long.');
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

  await createOrderSupaPush(order, deliveryAddress, reqDeliveryPeriod, items);
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
  deliveryAddress: string,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  status: string
): Promise<EmptyObject> {
  const userId = await getUserIdFromSession(session);
  await requireOrgMember(userId, orgId);
  await assertOrderBelongsToOrg(orderId, orgId);

  if (!deliveryAddress || deliveryAddress.trim().length === 0) {
    throw new InvalidDeliveryAddr('Address cannot be empty');
  }
  if (deliveryAddress.length > 200) {
    throw new InvalidDeliveryAddr('The address is too long.');
  }
  if (reqDeliveryPeriod.endDateTime <= reqDeliveryPeriod.startDateTime) {
    throw new InvalidRequestPeriod('The requested delivery period is invalid.');
  }

  await updateOrderSupa(orderId, deliveryAddress, reqDeliveryPeriod, status);
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

// V2 organisation management (uses orgPermissions for correct role based access)
// replaces the direct contactId checks in the V0 organisation.ts

export async function getOrdersByOrg(orgId: number, session: string) {
  return listOrders(orgId, session);
}