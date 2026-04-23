import { streamAgentTurn } from './aiService';
import { corsHeaders } from '../handlerHelpers';

// warning, this doesn't return messages you should call 
// something like this after it finishes streaming:
// await fetch('/api/ai-chat', ...)

// handle preflight (important if frontend is on different origin)
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { message, messages = [], orgId } = body;

    // basic validation
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: '"message" must be a non-empty string' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    const session = req.headers.get('session') || '';
    const orgIdNum = Number(orgId);

    if (!orgIdNum || isNaN(orgIdNum)) {
      return new Response(
        JSON.stringify({ error: 'Invalid orgId' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // build full message history
    const fullMessages = [
      ...messages,
      { role: 'user', content: message.trim() },
    ];

    // start AI stream
    const stream = streamAgentTurn(fullMessages, {
      session,
      orgId: orgIdNum,
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream.textStream) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          console.error('Streaming error:', err);
          controller.enqueue(encoder.encode('\n[ERROR]'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain',
        ...corsHeaders,
      },
    });

  } catch (err) {
    console.error('Request error:', err);

    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
}