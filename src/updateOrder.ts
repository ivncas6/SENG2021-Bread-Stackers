import { getData } from './dataStore';
import { ReqDeliveryPeriod, EmptyObject, Session } from './interfaces';
import { 
  InvalidDeliveryAddr, 
  InvalidOrderId, 
  InvalidRequestPeriod, 
  UnauthorisedError 
} from './throwError';

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
  const data = getData();

  // Check the current session 
  const sessionEntry = data.sessions.find((s: Session) => s.session === session);
  if (!sessionEntry) {
    throw new UnauthorisedError('Not a valid session');
  }

  // Check order exist 
  const order = data.orders.find(o => o.orderId === orderId);
  if (!order) {
    throw new InvalidOrderId('Order ID does not exist');
  }

  // Check access 
  if (order.userId !== sessionEntry.userId) {
    throw new UnauthorisedError('You do not have permission to update this order');
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