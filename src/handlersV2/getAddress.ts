import { APIGatewayProxyEvent } from 'aws-lambda';
import { getAddress } from '../address';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const getAddressHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const addressId = parseInt(event.pathParameters?.addressId ?? '');
    if (isNaN(addressId)) return jsonResponse(400, { error: 'Invalid addressId in path' });

    const result = await getAddress(session, addressId);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};