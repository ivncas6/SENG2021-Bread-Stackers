import { APIGatewayProxyEvent } from 'aws-lambda';
import { createCatalogueItem } from '../catalogue';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const createCatalogueItemHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    if (isNaN(orgId)) return jsonResponse(400, { error: 'Invalid orgId in path' });

    const body = JSON.parse(event.body ?? '{}');
    const { name, description, price } = body;

    const result = await createCatalogueItem(session, orgId, name, description, price);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};