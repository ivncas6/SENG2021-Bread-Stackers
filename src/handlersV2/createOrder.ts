import { APIGatewayProxyEvent } from 'aws-lambda';
import { createOrder } from '../orderV2';
import { ReqItem, ReqDeliveryPeriod } from '../interfaces';
import { UnauthorisedError } from '../throwError';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

/**
 * Handler only concerns itself with parsing and HTTP plumbing.
 * All business-rule validation (items, address, period) lives in orderV2.ts.
 */
export const createOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) throw new UnauthorisedError('Session header missing');

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    if (isNaN(orgId)) return jsonResponse(400, { error: 'Invalid orgId in path' });

    const body = JSON.parse(event.body ?? '{}');
    const currency: string = body.currency;
    const deliveryAddressId: number = parseInt(body.deliveryAddressId);
    const reqDeliveryPeriod: ReqDeliveryPeriod = body.reqDeliveryPeriod;
    const items: ReqItem[] = body.items;

    if (isNaN(deliveryAddressId)) {
      return jsonResponse(400, { error: 'deliveryAddressId must be a valid integer' });
    }

    const result = await createOrder(
      orgId, currency, session, deliveryAddressId, reqDeliveryPeriod, items
    );
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};