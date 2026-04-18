import { APIGatewayProxyEvent } from 'aws-lambda';
import { deleteOrganisation } from '../organisation';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const deleteOrganisationHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const orgId = parseInt(event.pathParameters!.orgId!);
    const session = event.headers.session;

    if (!session) {
      return jsonResponse(401, { error: 'provided session is not valid' });
    }

    const result = await deleteOrganisation(session, orgId);
    
    return jsonResponse(200, result);
  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};