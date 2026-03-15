import  { createOrderReturn, EmptyObject, 
  Order, ReqDeliveryPeriod, ReqItem, ReqUser } from './interfaces';
import { v4 as uuidv4 } from 'uuid';
import { getData, createOrderSupaPush, updateOrderStatus, getOrderByIdSupa, deleteOrderSupa } from './dataStore';
import { createOrderUBLXML } from './generateUBL';
import { InvalidDeliveryAddr, InvalidEmail, InvalidInput,
  InvalidOrderId,
  InvalidPhone,
  InvalidRequestPeriod, UnauthorisedError } from './throwError';
import { getUserIdFromSession } from './userHelper';
import { supabase } from './supabase';


export async function createOrder(
  currency: string, 
  session: string, 
  user: ReqUser, 
  deliveryAddress: string, 
  reqDeliveryPeriod: ReqDeliveryPeriod,
  items: ReqItem[]
): Promise<createOrderReturn> {
  
  const userId = getUserIdFromSession(session);
  const data = getData();
  const u = data.users.find((u) => u.contactId === userId);
  if (!u) {
    throw new UnauthorisedError('User does not exist');
  }

  if (u.email !== user.email) {
    throw new InvalidEmail('This email does not belong to the user.');
  }

  const phone = user.telephone;
  const isAllDigits = /^\d+$/.test(phone);
  if (!isAllDigits || phone.length < 8 || phone.length > 12) {
    throw new InvalidPhone('The telephone number is incorrect');
  }
  
  if(deliveryAddress.length > 200) {
    throw new InvalidDeliveryAddr('The address is too long.');
  }

  if (reqDeliveryPeriod.endDateTime <= reqDeliveryPeriod.startDateTime) {
    throw new InvalidRequestPeriod('The requested delivery period is invalid.');
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
    buyerOrgID: userId,
    sellerOrgID: 1,
    taxExclusive: taxExclusive,
    taxInclusive: taxInclusive,
    finalPrice: taxInclusive
  };

  await createOrderSupaPush(order, deliveryAddress, reqDeliveryPeriod, items);
  createOrderUBLXML(order, items, user, deliveryAddress);

  return { orderId: orderId };
}

export async function cancelOrder(orderId: string, reason: string, session: string) {

  // find if user for sesh exists
  const userId = getUserIdFromSession(session);

  // get order
  const foundOrder = await getOrderByIdSupa(orderId);

  // error check
  if (foundOrder == null) {
    throw new InvalidInput('error: Invalid orderId');
  }

  if (foundOrder.buyerOrgID !== userId) {
    throw new UnauthorisedError('User does not exist');
  }

  await updateOrderStatus(orderId, 'CANCELLED');

  // if a hard delete is what we're going for
  // await deleteOrderSupa(orderId);

  console.log('Order ' + orderId + ' cancelled by userId ' 
    + userId + '. Reason: ' + reason);

  // uses reason
  return { reason: reason };
}

export async function getOrderInfo(session: string, orderId: string) {
  const userId = getUserIdFromSession(session);

  // find the order
  const order = await getOrderByIdSupa(orderId);

  if (!order) {
    throw new InvalidOrderId(
      'Provided orderId doesnot correspond to any existing order',
    );
  }
  if (order.buyerOrgID !== userId) {
    throw new InvalidOrderId(
      'Order with the provided orderId does not belong to this user.',
    );
  }

  const delivery = order.deliveries;
  const address = delivery?.addresses;
  const user = order.users;

  return {
    orderId: orderId,
    status: order.status,
    issuedDate: order.issuedDate,
    issuedTime: order.issuedTime,
    currency: order.currency,
    taxExclusive: order.taxExclusive,
    taxInclusive: order.taxInclusive,
    finalPrice: order.finalPrice,
    address: address?.street || '',
    deliveryDetails: {
      startDateTime: Number(delivery?.startDate),
      endDateTime: Number(delivery?.endDate),
    },
    userDetails: {
      firstName: user?.firstName,
      lastName: user?.lastName,
      telephone: user?.telephone,
      email: user?.email
    },
    items: order.order.items.map((i: any) => ({
      name: i.name,
      description: i.description,
      unitPrice: i.unitPrice,
      quantity: i.quantity
    }))
  };
}

export async function listOrders(session: string) {

  // validates the session, tells us who is making the request
  const userId = getUserIdFromSession(session);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('orderId, status, issuedDate, finalPrice, currency')
    .eq('buyer_id', userId);
  
  if (error) throw error;
  // filters and maps orders belonging to the logged-in user
  /*const orders = data.orders
    .filter(order => order.buyerOrgID === userId)
    .map(order => ({
      orderId: order.orderId ?? '',
      status: 'active',
      issuedDate: order.issuedDate,
      finalPrice: order.finalPrice,
      currency: order.currency
    }));*/

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
  const userId = getUserIdFromSession(session);

  // Check order exist 
  const data = getData();
  const order = data.orders.find(o => o.orderId === orderId);
  if (!order) {
    throw new InvalidOrderId('Order ID does not exist');
  }

  // Check access 
  if (order.buyerOrgID !== userId) {
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

  // Update Order
  /* Update later:
  order.deliveryAddress = deliveryAddress;
  order.reqDeliveryPeriod = reqDeliveryPeriod;
  */
  order.status = status;

  const delivery = data.deliveries.find(d => d.orderID === orderId);
  
  if (delivery) {
    delivery.startDate = reqDeliveryPeriod.startDateTime.toString();
    delivery.endDate = reqDeliveryPeriod.endDateTime.toString();

    const address = data.addresses.find(
      add => add.addressID === delivery.deliveryAddressID
    );
    if (address) {
      address.street = deliveryAddress;
    }
  }

  await updateOrderStatus(orderId, status);

  // Return empty 
  return {};
}
