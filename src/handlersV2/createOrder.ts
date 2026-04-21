import { APIGatewayProxyEvent } from 'aws-lambda';
import { createOrder } from '../orderV2';
import { ReqItem, ReqDeliveryPeriod } from '../interfaces';
import { UnauthorisedError } from '../throwError';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const createOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) throw new UnauthorisedError('Session header missing');

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    if (isNaN(orgId)) return jsonResponse(400, { error: 'Invalid orgId in path' });

    const body = JSON.parse(event.body ?? '{}');
    const currency: string = body.currency;
    const deliveryAddress: string = body.deliveryAddress;
    const reqDeliveryPeriod: ReqDeliveryPeriod = body.reqDeliveryPeriod;
    const items: ReqItem[] = body.items;

    const result = await createOrder(
      orgId, currency, session, deliveryAddress, reqDeliveryPeriod, items
    );
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};