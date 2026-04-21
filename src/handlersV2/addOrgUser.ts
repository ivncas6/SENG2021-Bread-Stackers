import { APIGatewayProxyEvent } from 'aws-lambda';
import { addOrgUser } from '../organisation';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const addOrgUserHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    if (isNaN(orgId)) return jsonResponse(400, { error: 'Invalid orgId in path' });

    const body = JSON.parse(event.body ?? '{}');
    const userId = parseInt(body.userId);
    if (isNaN(userId)) return jsonResponse(400, { error: 'Invalid userId in body' });

    const result = await addOrgUser(session, userId, orgId);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};