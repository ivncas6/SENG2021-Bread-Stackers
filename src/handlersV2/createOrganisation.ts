import { APIGatewayProxyEvent } from 'aws-lambda';
import { createOrganisation } from '../organisation';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const createOrganisationHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const body = JSON.parse(event.body ?? '{}');
    const result = await createOrganisation(session, body.orgName, body.addressId);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};