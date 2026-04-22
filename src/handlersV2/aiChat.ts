/**
 * src/handlersV2/aiChat.ts
 *
 * POST /v2/organisation/{orgId}/ai/chat
 *
 * Request body:
 *   {
 *     "message":  string,           // the user's latest message (required)
 *     "messages": CoreMessage[]     // conversation history (optional, omit on first turn)
 *   }
 *
 * Response body (200):
 *   {
 *     "reply":    string,           // model's text response for this turn
 *     "messages": CoreMessage[]     // updated history — store this client-side and
 *   }                               // send it back on the next request for multi-turn
 *
 * Errors follow the standard { error: string } shape used by all other handlers.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import type { CoreMessage } from 'ai';

import { runAgentTurn }                      from '../ai/aiService';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';
import { UnauthorisedError }                 from '../throwError';

export const aiChatHandler = async (event: APIGatewayProxyEvent) => {
  try {
    // ── Auth & routing ────────────────────────────────────────────────────────
    const session = event.headers?.session;
    if (!session) throw new UnauthorisedError('Session header missing');

    const orgId = parseInt(event.pathParameters?.orgId ?? '');
    if (isNaN(orgId)) return jsonResponse(400, { error: 'Invalid orgId in path' });

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = JSON.parse(event.body ?? '{}') as {
      message?:  string;
      messages?: CoreMessage[];
    };

    const { message, messages: history = [] } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return jsonResponse(400, { error: '"message" is required and must be a non-empty string' });
    }

    // Append the new user message to whatever history the client sent back
    const messages: CoreMessage[] = [
      ...history,
      { role: 'user', content: message.trim() },
    ];

    // ── Run AI agent ──────────────────────────────────────────────────────────
    const result = await runAgentTurn(messages, { session, orgId });

    return jsonResponse(200, {
      reply:    result.reply,
      messages: result.messages,
    });

  } catch (e) {
    return handleErrorResponse(e);
  }
};