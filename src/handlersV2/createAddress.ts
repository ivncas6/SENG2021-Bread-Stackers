import { APIGatewayProxyEvent } from 'aws-lambda';
import { createAddress } from '../address';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const createAddressHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const body = JSON.parse(event.body ?? '{}');
    const { street, city, postcode, country } = body;

    const result = await createAddress(session, street, city, postcode, country);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};