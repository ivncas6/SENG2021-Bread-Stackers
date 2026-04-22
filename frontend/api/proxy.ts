import * as fs from 'node:fs';
import * as path from 'node:path';

export const config = {
  runtime: 'nodejs',
};

const allowedPathPrefix = '/v0/';

function buildEnvCandidateFiles(): string[] {
  const cwd = process.cwd();
  const candidateDirectories = [
    cwd,
    path.resolve(cwd, '..'),
    path.resolve(cwd, '../..'),
    path.join(cwd, 'frontend'),
    path.join(path.resolve(cwd, '..'), 'frontend'),
  ];

  return Array.from(new Set(candidateDirectories)).map((directory) =>
    path.join(directory, '.env.local'),
  );
}

function readLocalEnvValue(name: string): string | undefined {
  const candidateFiles = buildEnvCandidateFiles();

  for (const filePath of candidateFiles) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const fileContents = fs.readFileSync(filePath, 'utf8');
    const matchingLine = fileContents
      .split('\n')
      .find((line) => line.trim().startsWith(`${name}=`));

    if (!matchingLine) {
      continue;
    }

    const rawValue = matchingLine.split('=').slice(1).join('=').trim();
    return rawValue.replace(/^['"]|['"]$/g, '');
  }

  return undefined;
}

function getEnvValue(name: string): string | undefined {
  return process.env[name] || readLocalEnvValue(name);
}

function buildAwsUrl(requestUrl: URL): string {
  const rawBaseUrl = getEnvValue('AWS_API_BASE_URL');
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
  const apiKey = getEnvValue('AWS_API_KEY');

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
