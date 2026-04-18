import { UnauthorisedError, InvalidInput, InvalidBusinessName, 
  InvalidOrderId, InvalidDeliveryAddr, InvalidRequestPeriod, 
  InvalidEmail, InvalidPhone, InvalidPassword, InvalidLogin, 
  InvalidSupabase, InvalidLastName, 
  InvalidFirstName } from './throwError';

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
    e instanceof InvalidInput ||
    e instanceof InvalidBusinessName || 
    e instanceof InvalidFirstName ||
    e instanceof InvalidLastName ||
    e instanceof InvalidOrderId ||
    e instanceof InvalidDeliveryAddr ||
    e instanceof InvalidRequestPeriod ||
    e instanceof InvalidEmail ||
    e instanceof InvalidPhone ||
    e instanceof InvalidPassword ||
    e instanceof InvalidLogin
  ) {
    return jsonResponse(400, { error: e.message });
  }

  // 500 internal database errors
  if (e instanceof InvalidSupabase) {
    return jsonResponse(500, { error: e.message });
  }

  // fallback for unexpected crashes
  console.error('Unhandled Error: ', e); // Good for CloudWatch logs
  return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
}

