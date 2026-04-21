import { APIGatewayProxyEvent } from 'aws-lambda';
import { updateAddress } from '../address';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const updateAddressHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const addressId = parseInt(event.pathParameters?.addressId ?? '');
    if (isNaN(addressId)) return jsonResponse(400, { error: 'Invalid addressId in path' });

    const body = JSON.parse(event.body ?? '{}');
    const { street, city, postcode, country } = body;

    const result = await updateAddress(session, addressId, { street, city, postcode, country });
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};