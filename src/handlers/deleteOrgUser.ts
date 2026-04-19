import { APIGatewayProxyEvent } from 'aws-lambda';
import { deleteOrgUser } from '../organisation';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const deleteOrgUserHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const orgId = parseInt(event.pathParameters!.orgId!);
    const userId = parseInt(event.pathParameters!.userId!);
    const session = event.headers.session;

    if (!session) {
      return jsonResponse(401, { error: 'provided session is not valid' });
    }

    const result = await deleteOrgUser(session, userId, orgId);

    return jsonResponse(200, result);
  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};