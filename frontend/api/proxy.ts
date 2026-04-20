const allowedPathPrefix = '/v0/';

function buildAwsUrl(requestUrl: URL): string {
  const rawBaseUrl = process.env.AWS_API_BASE_URL;
  const rawPath = requestUrl.searchParams.get('path');

  if (!rawBaseUrl) {
    throw new Error('Missing AWS_API_BASE_URL environment variable.');
  }

  if (!rawPath || !rawPath.startsWith(allowedPathPrefix)) {
    throw new Error('Invalid proxy path.');
  }

  const baseUrl = rawBaseUrl.replace(/\/$/, '');
  return `${baseUrl}${rawPath}`;
}

function createForwardHeaders(request: Request): Headers {
  const apiKey = process.env.AWS_API_KEY;

  if (!apiKey) {
    throw new Error('Missing AWS_API_KEY environment variable.');
  }

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  const session = request.headers.get('session');

  if (contentType) {
    headers.set('content-type', contentType);
  }

  if (session) {
    headers.set('session', session);
  }

  headers.set('x-api-key', apiKey);

  return headers;
}

async function forwardToAws(request: Request): Promise<Response> {
  const awsUrl = buildAwsUrl(new URL(request.url));
  const method = request.method.toUpperCase();
  const init: RequestInit = {
    headers: createForwardHeaders(request),
    method,
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.text();
  }

  const upstreamResponse = await fetch(awsUrl, init);
  const responseHeaders = new Headers();
  const contentType = upstreamResponse.headers.get('content-type');

  if (contentType) {
    responseHeaders.set('content-type', contentType);
  }

  return new Response(upstreamResponse.body, {
    headers: responseHeaders,
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
  });
}

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected proxy error.';

  return Response.json(
    { error: message },
    { status: message === 'Invalid proxy path.' ? 400 : 500 },
  );
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await forwardToAws(request);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
