import { APIGatewayProxyEvent } from 'aws-lambda';
import { listCatalogueItems } from '../catalogue';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const listCatalogueItemsHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    if (isNaN(orgId)) return jsonResponse(400, { error: 'Invalid orgId in path' });

    const result = await listCatalogueItems(session, orgId);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};