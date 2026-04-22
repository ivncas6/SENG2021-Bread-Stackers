import { APIGatewayProxyEvent } from 'aws-lambda';
import { createOrderFromCatalogue } from '../orderV3';
import { ReqDeliveryPeriod } from '../interfaces';
import { UnauthorisedError } from '../throwError';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';
import { CatalogueOrderItem } from '../orderV3';

/**
 * Creates an order from a seller's catalogue.  The buyer specifies:
 *   - sellerOrgId - which organisation they are buying from
 *   - deliveryAddressId - pre-existing address (from /v2/address)
 *   - reqDeliveryPeriod
 *   - items - array of { catalogueItemId, quantity }
 *
 * Prices come from the catalogue; buyers cannot set their own.
 * The new order starts with status PENDING until the seller accepts or rejects.
 */
export const createOrderHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const session = event.headers?.session;
    if (!session) throw new UnauthorisedError('Session header missing');

    const buyerOrgId = parseInt(event.pathParameters?.orgId ?? '');
    if (isNaN(buyerOrgId)) return jsonResponse(400, { error: 'Invalid orgId in path' });

    const body = JSON.parse(event.body ?? '{}');
    const sellerOrgId       = parseInt(body.sellerOrgId);
    const deliveryAddressId = parseInt(body.deliveryAddressId);
    const reqDeliveryPeriod: ReqDeliveryPeriod = body.reqDeliveryPeriod;
    const items: CatalogueOrderItem[]          = body.items;

    if (isNaN(sellerOrgId)) {
      return jsonResponse(400, { error: 'sellerOrgId must be a valid integer' });
    }
    if (isNaN(deliveryAddressId)) {
      return jsonResponse(400, { error: 'deliveryAddressId must be a valid integer' });
    }

    const result = await createOrderFromCatalogue(
      buyerOrgId, session, sellerOrgId, deliveryAddressId, reqDeliveryPeriod, items
    );
    return jsonResponse(200, result);
  } catch (e) {
    return handleErrorResponse(e);
  }
};