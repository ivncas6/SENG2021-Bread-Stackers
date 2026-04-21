import { APIGatewayProxyEvent } from 'aws-lambda';
import { createOrder } from '../order';
import { ReqItem, ReqDeliveryPeriod } from '../interfaces';
import { UnauthorisedError } from '../throwError';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';
import { getUserIdFromSession } from '../userHelper';
import { getUserByIdSupa } from '../dataStore';

export const createOrderHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    const body = JSON.parse(event.body ?? '{}');

    // session comes from header
    const session = event.headers?.session;
    if (!session) {
      throw new UnauthorisedError('Session header missing');
    }

    const userId = await getUserIdFromSession(session);
    const user = await getUserByIdSupa(userId);

    if (!user) {
      throw new UnauthorisedError('User for session does not exist');
    }

    const currency: string = body.currency;
    const deliveryAddress: string = body.deliveryAddress;
    const reqDeliveryPeriod: ReqDeliveryPeriod = body.reqDeliveryPeriod;
    const items: ReqItem[] = body.items;

    const result = await createOrder(
      currency,
      session,
      deliveryAddress,
      reqDeliveryPeriod,
      items
    );

    return jsonResponse(200, result);

  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};
