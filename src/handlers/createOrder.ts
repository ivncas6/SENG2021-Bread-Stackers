import { APIGatewayProxyEvent } from 'aws-lambda';
import { createOrder } from '../order';
import { ReqItem, ReqDeliveryPeriod, ReqUser } from '../interfaces';
import {
  InvalidEmail,
  InvalidInput,
  InvalidPhone,
  InvalidRequestPeriod,
  InvalidSupabase,
  UnauthorisedError } from '../throwError';
import { jsonResponse } from './response';
import { invalidemailcheck } from '../userHelper';

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

    const currency: string = body.currency;
    const user: ReqUser = body.user;
    const deliveryAddress: string = body.deliveryAddress;
    const reqDeliveryPeriod: ReqDeliveryPeriod = body.reqDeliveryPeriod;
    const items: ReqItem[] = body.items;

    if (await invalidemailcheck(session, user.email)) {
      throw new InvalidEmail('This email does not belong to the user.');
    }

    const phone = user.telephone;
    const isAllDigits = /^\d+$/.test(phone);
    if (!isAllDigits || phone.length < 8 || phone.length > 12) {
      throw new InvalidPhone('The telephone number is incorrect');
    }

    const result = await createOrder(
      currency,
      session,
      deliveryAddress,
      reqDeliveryPeriod,
      items
    );

    return jsonResponse(200, result);

  } catch (err: unknown) {
    if (err instanceof UnauthorisedError) {
      return jsonResponse(401, { error: err.message });
    }
    if (err instanceof InvalidInput || 
      err instanceof InvalidRequestPeriod ||
      err instanceof InvalidEmail || 
      err instanceof InvalidPhone) {
      return jsonResponse(400, { error: err.message });
    }
    if (err instanceof InvalidSupabase) {
      return jsonResponse(500, { error: err.message });
    }
    // internal server error, server doesnot know how to handle the error
    return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
  }
};
