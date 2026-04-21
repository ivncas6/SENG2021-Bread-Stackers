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
    const { email } = body;

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      return jsonResponse(400, { error: 'email is required in request body' });
    }

    const result = await addOrgUser(session, email.trim(), orgId);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};