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
