import { APIGatewayProxyEvent } from 'aws-lambda';
import { createOrder } from '../order';
import { Item, ReqDeliveryPeriod, User } from '../interfaces';
import {
  InvalidDeliveryAddr,
  InvalidInput,
  InvalidRequestPeriod,
  UnauthorisedError } from '../throwError';

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
    const user: User = body.user;
    const deliveryAddress: string = body.deliveryAddress;
    const reqDeliveryPeriod: ReqDeliveryPeriod = body.reqDeliveryPeriod;
    const items: Item[] = body.items;

    const result = createOrder(
      currency,
      session,
      user,
      deliveryAddress,
      reqDeliveryPeriod,
      items
    );

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };

  } catch (err: unknown) {
    if (err instanceof UnauthorisedError) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: err.message })
      };
    }
    if (err instanceof InvalidInput ||
      err instanceof InvalidDeliveryAddr ||
      err instanceof InvalidRequestPeriod) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: err.message })
      };
    }

    // internal server error, server doesnot know how to handle the error
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'INTERNAL SERVER ERROR' }),
    };
  }
};