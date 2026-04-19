import { APIGatewayProxyEvent } from 'aws-lambda';
import { addOrgUser } from '../organisation';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const addOrgUserHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const orgId = parseInt(event.pathParameters!.orgId!);
    const body = JSON.parse(event.body ?? '{}');
    const session = event.headers.session;

    if (!session) {
      return jsonResponse(401, { error: 'provided session is not valid' });
    }

    const { userId } = body;
    const result = await addOrgUser(session, userId, orgId);

    return jsonResponse(200, result);
  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};