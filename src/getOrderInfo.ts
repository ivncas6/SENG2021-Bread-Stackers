import { getData } from './dataStore';
import { ErrorObject, OrderInfo } from './interfaces';
import { InvalidOrderId, UnauthorisedError } from './throwError';

export function getOrderInfo(
  session: string,
  orderId: string,
): OrderInfo | ErrorObject {
  const data = getData();

  const ses = data.sessions.find((s) => s.session === session);
  if (!ses) {
    throw new UnauthorisedError('Not a valid session');
  }

  const u = data.users.find((u) => u.userId === ses.userId);
  if (!u) {
    throw new UnauthorisedError('Provided userId is not valid');
  }
  // find the order
  const order = data.orders.find((order) => order.orderId === orderId);

  if (!order) {
    throw new InvalidOrderId(
      'Provided orderId doesnot correspond to any existing order'
    );
  }

  if (order.userId !== ses.userId) {
    throw new InvalidOrderId(
      'Order with the provided orderId does not belong to this user.'
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
