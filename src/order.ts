import  { createOrderReturn, EmptyObject, 
  Order, ReqDeliveryPeriod, ReqItem, ReqUser, 
  OrderLineWithItem } from './interfaces';
import { v4 as uuidv4 } from 'uuid';
import { createOrderSupaPush, 
  getOrderByIdSupa, 
  updateOrderSupa,
  deleteOrderSupa,
  getUserByIdSupa,
  getOrgByUserId} from './dataStore';
import { InvalidDeliveryAddr, InvalidEmail, InvalidInput,
  InvalidOrderId,
  InvalidRequestPeriod, InvalidSupabase, UnauthorisedError } from './throwError';
import { getUserIdFromSession } from './userHelper';
import { supabase } from './supabase';
import { createOrderUBLXML } from './generateUBL';


export async function createOrder(
  currency: string, 
  session: string,
  deliveryAddress: string, 
  reqDeliveryPeriod: ReqDeliveryPeriod,
  items: ReqItem[]
): Promise<createOrderReturn> {
  
  const userId = await getUserIdFromSession(session);
  const u = await getUserByIdSupa(userId);

  if (!u) {
    throw new UnauthorisedError('User does not exist');
  }

  /* deprecated from v1
  if (u.email !== user.email) {
    throw new InvalidEmail('This email does not belong to the user.');
  }

  const phone = user.telephone;
  const isAllDigits = /^\d+$/.test(phone);
  if (!isAllDigits || phone.length < 8 || phone.length > 12) {
    throw new InvalidPhone('The telephone number is incorrect');
  }*/
  
  if(deliveryAddress.length > 200) {
    throw new InvalidDeliveryAddr('The address is too long.');
  }

  if (reqDeliveryPeriod.endDateTime <= reqDeliveryPeriod.startDateTime) {
    throw new InvalidRequestPeriod('The requested delivery period is invalid.');
  } 

  const { data: orgData } = await getOrgByUserId(userId);
  if (!orgData) {
    throw new Error('User does not have an associated organization');
  }

  let taxExclusive = 0;
  for (const i of items) {
    taxExclusive += i.unitPrice * i.quantity;
  }
  // assuming it's 10% for GST
  const taxInclusive = taxExclusive * 1.1;
  const orderId: string = uuidv4();
  const currTime = new Date();
    
  const order: Order = {
    orderId: orderId,
    issuedDate: currTime.toISOString().slice(0, 10),
    issuedTime: currTime.toLocaleTimeString('en-AU'),
    currency: currency,
    status: 'OPEN',
    buyerOrgID: orgData.orgId,
    sellerOrgID: 1,
    taxExclusive: taxExclusive,
    taxInclusive: taxInclusive,
    finalPrice: taxInclusive
  };

  await createOrderSupaPush(order, deliveryAddress, reqDeliveryPeriod, items);
  createOrderUBLXML(orderId, session);
  return { orderId: orderId };
}

export async function cancelOrder(orderId: string, reason: string, session: string) {

  // find if user for sesh exists
  const userId = await getUserIdFromSession(session);

  const { data: orgData } = await getOrgByUserId(userId);

  if (!orgData) {
    throw new UnauthorisedError('User has no associated organization');
  }

  // get order
  const foundOrder = await getOrderByIdSupa(orderId);

  // error check
  if (foundOrder == null) {
    throw new InvalidInput('error: Invalid orderId');
  }

  if (foundOrder.buyerOrgID !== orgData.orgId) {
    throw new UnauthorisedError('You do not have permission to cancel this order');
  }

  // if not hard delete just change status
  // await updateOrderStatus(orderId, 'CANCELLED');

  await deleteOrderSupa(orderId);

  // in case we want to logging deletes
  /*console.log('Order ' + orderId + ' cancelled by userId ' 
    + userId + '. Reason: ' + reason);*/

  // uses reason
  return { reason: reason };
}

export async function getOrderInfo(session: string, orderId: string) {
  const userId = await getUserIdFromSession(session);

  const { data: orgData } = await getOrgByUserId(Number(userId));
  if (!orgData) {
    throw new UnauthorisedError('User has no associated organization');
  }

  // find the order
  const order = await getOrderByIdSupa(orderId);

  if (!order) {
    throw new InvalidOrderId(
      'Provided orderId doesnot correspond to any existing order',
    );
  }
  if (String(order.buyerOrgID) !== String(orgData.orgId)) {
    throw new InvalidOrderId(
      'Order with the provided orderId does not belong to this user.',
    );
  }

  const delivery = order.deliveries?.[0];
  const address = delivery?.addresses;
  const contact = order.organisations?.contacts;

  return {
    orderId: orderId,
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
      quantity: line.quantity
    }))
  };
}

export async function listOrders(session: string) {

  // validates the session, tells us who is making the request
  const userId = await getUserIdFromSession(session);

  const { data: orgData } = await getOrgByUserId(Number(userId));
  if (!orgData) {
    return { orders: [] };
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('orderId, status, issuedDate, finalPrice, currency')
    .eq('buyerOrgID', orgData.orgId);

  if (error) throw new InvalidSupabase(error.message);

  return { orders };
}

/**
 * Updates an existing order with the given orderId.
 * @param {string} session 
 * @param {string} orderId 
 * @param {string} deliveryAddress 
 * @param {ReqDeliveryPeriod} reqDeliveryPeriod 
 * @param {string} status
 * @returns {EmptyObject}
 */

export async function updateOrder(
  session: string,
  orderId: string,
  deliveryAddress: string,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  status: string
): Promise<EmptyObject> {

  // Check the current session 
  const userId = await getUserIdFromSession(session);

  const { data: orgData } = await getOrgByUserId(Number(userId));
  if (!orgData) {
    throw new UnauthorisedError('User has no associated organization');
  }

  // Check order exist 
  const order = await getOrderByIdSupa(orderId);
  if (!order) {
    throw new InvalidOrderId('Order ID does not exist');
  }

  if (order.buyerOrgID !== orgData.orgId) {
    throw new UnauthorisedError('You do not have permission to update this order');
  }

  if (!deliveryAddress || deliveryAddress.trim().length === 0) {
    throw new InvalidDeliveryAddr('Address cannot be empty');
  }

  // Validate 
  if (deliveryAddress.length > 200) {
    throw new InvalidDeliveryAddr('The address is too long.');
  }

  if (reqDeliveryPeriod.endDateTime <= reqDeliveryPeriod.startDateTime) {
    throw new InvalidRequestPeriod('The requested delivery period is invalid.');
  }

  await updateOrderSupa(orderId, deliveryAddress, reqDeliveryPeriod, status);
  createOrderUBLXML(orderId, session);

  // Return empty 
  return {};
}
