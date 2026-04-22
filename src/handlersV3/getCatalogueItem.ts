import { APIGatewayProxyEvent } from 'aws-lambda';
import { getCatalogueItem } from '../catalogue';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const getCatalogueItemHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) return jsonResponse(401, { error: 'Session header missing' });

    const itemId = parseInt(event.pathParameters?.itemId ?? '');
    if (isNaN(itemId)) return jsonResponse(400, { error: 'Invalid itemId in path' });

    const result = await getCatalogueItem(session, itemId);
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};