import { APIGatewayProxyEvent } from 'aws-lambda';
import { deleteAddress } from '../address';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const deleteAddressHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const addressId = parseInt(event.pathParameters?.addressId ?? '');
    if (isNaN(addressId)) return jsonResponse(400, { error: 'Invalid addressId in path' });

    const result = await deleteAddress(session, addressId);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};