import { APIGatewayProxyEvent } from 'aws-lambda';
import { deleteOrgUser } from '../organisation';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const deleteOrgUserHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    const userId = parseInt(event.pathParameters?.userId ?? '');
    if (isNaN(orgId) || isNaN(userId)) {
      return jsonResponse(400, { error: 'Invalid orgId or userId in path' });
    }

    const result = await deleteOrgUser(session, userId, orgId);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};