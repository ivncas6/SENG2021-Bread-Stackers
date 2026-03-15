import  { createOrderReturn, EmptyObject, ErrorObject, Item, Order, 
  OrderInfo, 
  ReqDeliveryPeriod, User } from './interfaces';
import { v4 as uuidv4 } from 'uuid';
import { getData } from './dataStore';
import { createOrderUBLXML } from './generateUBL';
import { InvalidDeliveryAddr, InvalidEmail, InvalidInput,
  InvalidOrderId,
  InvalidRequestPeriod, UnauthorisedError } from './throwError';
import { getUserIdFromSession } from './userHelper';


export function createOrder(currency: string, session: string, 
  user: User, 
  deliveryAddress: string, 
  reqDeliveryPeriod: ReqDeliveryPeriod,
  items: Item[]): createOrderReturn | ErrorObject {
  
  
  const userId = getUserIdFromSession(session);
  const data = getData();
  const u = data.users.find((u) => u.userId === userId);
  if (!u) {
    throw new UnauthorisedError('User does not exist');
  }

  if (u.email !== user.email) {
    throw new InvalidEmail('This email does not belong to the user.');
  }

  const phone = Math.abs(user.telephone).toString();
  if (phone.length !== 9) {
    throw new InvalidInput('The telephone number is incorrect');
  }
  
  if(deliveryAddress.length > 200) {
    throw new InvalidDeliveryAddr('The address is too long.');
  }

  if (reqDeliveryPeriod.endDateTime <= reqDeliveryPeriod.startDateTime) {
    throw new InvalidRequestPeriod('The requested delivery period is invalid.');
  } 
  let totalAmount = 0;
  for (const i of items) {
    totalAmount += i.unitPrice * i.quantity;
  }
  const orderId: string = uuidv4();
    
  const orderDate: number = Math.floor(Date.now()/1000);
  const order: Order = {
    orderId: orderId,
    orderDate: orderDate,
    currency: currency,
    totalAmount: totalAmount,
    userId: userId,
    user: user,
    deliveryAddress: deliveryAddress,
    reqDeliveryPeriod: reqDeliveryPeriod,
    items: items,
    status: 'OPEN'
  };

  data.orders.push(order);
  createOrderUBLXML(order);

  return { orderId: orderId };
}

export function cancelOrder(orderId: string, reason: string, session: string) {

  // find if user for sesh exists
  const userId = getUserIdFromSession(session);

  // get order
  const data = getData();
  const foundOrder = data.orders.find(order => order.orderId === orderId);

  // error check
  if (foundOrder == null) {
    throw new InvalidInput('error: Invalid orderId');
  }

  if (foundOrder.userId !== userId) {
    throw new UnauthorisedError('User does not exist');
  }

  data.orders.splice(data.orders.indexOf(foundOrder), 1);

  // uses reason
  return { reason: reason };
}

export function getOrderInfo(session: string, orderId: string): OrderInfo | ErrorObject {
  const userId = getUserIdFromSession(session);

  // find the order
  const data = getData();
  const order = data.orders.find((order) => order.orderId === orderId);
  if (!order) {
    throw new InvalidOrderId(
      'Provided orderId doesnot correspond to any existing order',
    );
  }
  if (order.userId !== userId) {
    throw new InvalidOrderId(
      'Order with the provided orderId does not belong to this user.',
    );
  }
  return {
    orderId: orderId,
    orderDateTime: order.orderDate,
    status: order.status,
    currency: order.currency,
    deliveryAddress: order.deliveryAddress,
    userDetails: order.user,
    reqDeliveryPeriod: order.reqDeliveryPeriod,
    items: order.items,
  };
}

export function listOrders(session: string): { orders: OrderInfo[] } {

  // validates the session, tells us who is making the request
  const userId = getUserIdFromSession(session);
  const data = getData();

  // filters and maps orders belonging to the logged-in user
  const orders: OrderInfo[] = data.orders
    .filter(order => order.userId === userId)
    .map(order => ({
      orderId: order.orderId ?? '',
      status: 'active',
      orderDateTime: order.orderDate,
      currency: order.currency,
      deliveryAddress: order.deliveryAddress,
      userDetails: order.user,
      reqDeliveryPeriod: order.reqDeliveryPeriod,
      items: order.items,
    }));

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

export function updateOrder(
  session: string,
  orderId: string,
  deliveryAddress: string,
  reqDeliveryPeriod: ReqDeliveryPeriod,
  status: string
): EmptyObject {

  // Check the current session 
  const userId = getUserIdFromSession(session);

  // Check order exist 
  const data = getData();
  const order = data.orders.find(o => o.orderId === orderId);
  if (!order) {
    throw new InvalidOrderId('Order ID does not exist');
  }

  // Check access 
  if (order.userId !== userId) {
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
  order.deliveryAddress = deliveryAddress;
  order.reqDeliveryPeriod = reqDeliveryPeriod;
  order.status = status;

  // Return empty 
  return {};
}
