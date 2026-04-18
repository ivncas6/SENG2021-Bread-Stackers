import { APIGatewayProxyEvent } from 'aws-lambda';
import { updateOrganisation } from '../organisation';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const updateOrganisationHandler = async (event: APIGatewayProxyEvent) => {
  try {
    // extract orgId from the URL path: /v0/organisation/{orgId}
    const orgId = parseInt(event.pathParameters!.orgId!);
    const body = JSON.parse(event.body ?? '{}');
    const session = event.headers.session;

    if (!session) {
      return jsonResponse(401, { error: 'provided session is not valid' });
    }

    const { orgName, addressId } = body;
    const result = await updateOrganisation(session, orgId, orgName, addressId);
    
    return jsonResponse(200, result);
  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};