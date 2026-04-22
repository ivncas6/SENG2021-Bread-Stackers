import { APIGatewayProxyEvent } from 'aws-lambda';
import { deleteCatalogueItem } from '../catalogue';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const deleteCatalogueItemHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const orgId  = parseInt(event.pathParameters?.orgId  ?? '');
    const itemId = parseInt(event.pathParameters?.itemId ?? '');
    if (isNaN(orgId) || isNaN(itemId)) {
      return jsonResponse(400, { error: 'Invalid orgId or itemId in path' });
    }

    const result = await deleteCatalogueItem(session, orgId, itemId);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};