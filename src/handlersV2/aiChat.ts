import { APIGatewayProxyEvent } from 'aws-lambda';
import type { CoreMessage } from 'ai';
import { runAgentTurn } from '../ai/aiService';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';
import { UnauthorisedError } from '../throwError';

export const aiChatHandler = async (event: APIGatewayProxyEvent) => {
  try {
    // auth & routing
    const session = event.headers?.session;
    if (!session) throw new UnauthorisedError('Session header missing');

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    if (isNaN(orgId)) return jsonResponse(400, { error: 'Invalid orgId in path' });

    const body = JSON.parse(event.body ?? '{}') as {
      message?: string;
      messages?: CoreMessage[];
    };

    const { message, messages: history = [] } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return jsonResponse(400, { error: '"message" is required and must be a non-empty string' });
    }

    // append new user message to whatever history client sent back
    const messages: CoreMessage[] = [
      ...history,
      { role: 'user', content: message.trim() },
    ];

    // run AI agent
    const result = await runAgentTurn(messages, { session, orgId });

    return jsonResponse(200, {
      reply: result.reply,
      messages: result.messages,
    });

  } catch (e) {
    return handleErrorResponse(e);
  }
};