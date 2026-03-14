import { APIGatewayProxyEvent } from 'aws-lambda';
import { createOrder } from '../order';
import { Item, ReqDeliveryPeriod, User } from '../interfaces';
import { InvalidInput, UnauthorisedError } from '../throwError';

export const dummyHandler = async () => ({
  statusCode: 200,
  body: JSON.stringify({ status: 'OK' }),
});