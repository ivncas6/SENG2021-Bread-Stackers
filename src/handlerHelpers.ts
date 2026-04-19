import { UnauthorisedError, InvalidInput, 
  InvalidOrderId, InvalidDeliveryAddr, InvalidLogin, 
  InvalidSupabase } from './throwError';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-api-key,session',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
};

export function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

// master error handler
export function handleErrorResponse(e: unknown) {
  // 401 Unauthorised
  if (e instanceof UnauthorisedError) {
    return jsonResponse(401, { error: e.message });
  }

  // 400 Bad Request (validation errors)
  if (
    // invalid input covers a lot of errors as they are sub classes
    e instanceof InvalidInput ||
    e instanceof InvalidOrderId ||
    e instanceof InvalidDeliveryAddr ||
    e instanceof InvalidLogin
  ) {
    return jsonResponse(400, { error: e.message });
  }

  // 500 internal database errors
  if (e instanceof InvalidSupabase) {
    return jsonResponse(500, { error: e.message });
  }

  // fallback for unexpected crashes. Good for CloudWatch logs
  console.error('Unhandled Error: ', e);
  return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
}

