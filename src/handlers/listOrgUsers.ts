import { APIGatewayProxyEvent } from 'aws-lambda';
import { listOrgUsers } from '../organisation';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const listOrgUsersHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const orgId = parseInt(event.pathParameters!.orgId!);
    const session = event.headers.session;

    if (!session) {
      return jsonResponse(401, { error: 'provided session is not valid' });
    }

    const result = await listOrgUsers(session, orgId);

    return jsonResponse(200, result);
  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};