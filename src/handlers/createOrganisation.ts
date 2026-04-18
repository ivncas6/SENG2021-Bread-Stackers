import { APIGatewayProxyEvent } from 'aws-lambda';
import { createOrganisation } from '../organisation';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const createOrganisationHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const body = JSON.parse(event.body ?? '{}');
    const session = event.headers.session;

    if (!session) {
        return jsonResponse(401, { error: 'provided session is not valid' });
    }

    const { orgName, addressId } = body;
    const result = await createOrganisation(session, orgName, addressId);
    
    return jsonResponse(200, result);
  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};