import { APIGatewayProxyEvent } from 'aws-lambda';
import { updateOrgUserRole } from '../organisation';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';
import { OrgRole } from '../interfaces';

export const updateOrgUserHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    const userId = parseInt(event.pathParameters?.userId ?? '');
    if (isNaN(orgId) || isNaN(userId)) {
      return jsonResponse(400, { error: 'Invalid orgId or userId in path' });
    }

    const body = JSON.parse(event.body ?? '{}');
    const { role } = body as { role: OrgRole };

    if (!role) {
      return jsonResponse(400, { error: 'role is required in request body' });
    }

    const result = await updateOrgUserRole(session, userId, orgId, role);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};