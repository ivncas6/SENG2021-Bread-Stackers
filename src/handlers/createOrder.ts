import { APIGatewayProxyEvent } from 'aws-lambda';
import { createOrder } from '../order';
import { ReqItem, ReqDeliveryPeriod, ReqUser } from '../interfaces';
import {
  InvalidEmail,
  InvalidPhone,
  UnauthorisedError } from '../throwError';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';
import validator from 'validator';

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

    if (!validator.isEmail(user.email)) {
      throw new InvalidEmail('This email is not valid');
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

  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};
