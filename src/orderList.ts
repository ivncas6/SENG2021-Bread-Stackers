import { OrderInfo } from './interfaces';
import { getData } from './dataStore';
import { UnauthorisedError } from './throwError';

export function listOrders(session: string): { orders: OrderInfo[] } {
  const data = getData();

  // validates the session, tells us who is making the request
  const sessionEntry = data.sessions.find(s => s.session === session);
  if (!sessionEntry) {
    throw new UnauthorisedError('Invalid or expired session');
  }

  // filters and maps orders belonging to the logged-in user
  const orders: OrderInfo[] = data.orders
    .filter(order => order.userId === sessionEntry.userId)
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