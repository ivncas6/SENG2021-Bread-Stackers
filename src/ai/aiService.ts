/**
 * Note:
 *  - tools call business-logic functions directly (same process, no HTTP hop).
 *  - `session` and `orgId` are captured in a closure so they are never part of
 *    the schema the model sees.
 *  - tools return { error } objects instead of throwing so the model can relay
 *    a friendly message without crashing the turn.
 *  - maxSteps: 5 lets the model chain tool calls in one user turn
 *    (e.g. createAddress → createOrder).
 *  - higher-permission operations (org CRUD, member management) are
 *    absent from the tool set.
 */

import { generateText, streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { CoreMessage } from 'ai';
import { z } from 'zod';

import * as orderV2 from '../orderV2';
import * as addr    from '../address';

// system prompt in MD

const SYSTEM_PROMPT = `\
You are an AI assistant built into a B2B order-management platform called BreadStackers.
Help users manage their orders and delivery addresses within their organisation.

## What you CAN do (via tools)
- List, view, create, update, and cancel orders
- Generate UBL XML documents for orders
- Create, view, update, delete, and list reusable delivery addresses

## What you CANNOT do
- Create, update, or delete organisations
- Manage organisation members (add, remove, change roles)
- Access data belonging to a different organisation

## Rules
1. Before any WRITE operation confirm the key details with the user and wait for
   their explicit go-ahead, unless their message already contains confirmation language.
2. For cancellations or deletions, always collect a reason if none was given.
3. Never expose raw stack traces or internal error messages.
4. Ask for missing required information rather than guessing.
5. Keep replies concise; use bullet points only when listing multiple items.`;

// tool context 

export interface ToolContext {
  session: string;
  orgId: number;
}

// parameter types 

// declaring parameter shapes avoids 'implicitly has any' TS error

type DeliveryPeriod = { startDateTime: number; endDateTime: number };

type CreateOrderParams = {
  currency: string;
  deliveryAddressId: number;
  reqDeliveryPeriod: DeliveryPeriod;
  items: { name: string; description: string; unitPrice: number; quantity: number }[];
};

type UpdateOrderParams = {
  orderId: string;
  deliveryAddressId: number;
  reqDeliveryPeriod: DeliveryPeriod;
  status: string;
};

type CreateAddressParams = {
  street: string; 
  city?: string | undefined; 
  postcode?: string | undefined; 
  country: string;
};

type UpdateAddressParams = {
  addressId: number; 
  street?: string | undefined; 
  city?: string | undefined; 
  postcode?: string | undefined; 
  country?: string | undefined;
};

// tool factory 

/**
 * Returns all tool definitions bound to the current request's session + orgId.
 * The closure means those values are never visible to the model.
 */
export function createTools(ctx: ToolContext) {

  // orders 

  const listOrders = tool({
    description:
      'List all orders for the organisation. ' +
      'Returns each orders ID, status, issue date, final price, and currency.',
    parameters: z.object({}),
    execute: async () => {
      try   { return await orderV2.listOrders(ctx.orgId, ctx.session); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const getOrderInfo = tool({
    description:
      'Fetch full details of one order: items, delivery address, pricing, ' +
      'delivery window, and buyer contact details.',
    parameters: z.object({
      orderId: z.string().uuid().describe('UUID of the order'),
    }),
    execute: async ({ orderId }: { orderId: string }) => {
      try   { return await orderV2.getOrderInfo(ctx.orgId, ctx.session, orderId); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const createOrder = tool({
    description:
      'Create a new order. Requires a pre-existing deliveryAddressId ' +
      '(use createAddress or listAddresses first), currency, delivery window, ' +
      'and at least one line item.',
    parameters: z.object({
      currency: z.string().describe('ISO 4217 code e.g. "AUD"'),
      deliveryAddressId: z.number().int().positive().describe('Existing address ID'),
      reqDeliveryPeriod: z.object({
        startDateTime: z.number().describe('Unix ms timestamp - delivery start'),
        endDateTime: z.number().describe('Unix ms timestamp - delivery end'),
      }),
      items: z.array(z.object({
        name: z.string().min(1),
        description: z.string().default(''),
        unitPrice: z.number().nonnegative(),
        quantity: z.number().int().positive(),
      })).min(1),
    }),
    execute: async ({
      currency, deliveryAddressId, reqDeliveryPeriod, items,
    }: CreateOrderParams) => {
      try {
        return await orderV2.createOrder(
          ctx.orgId, currency, ctx.session,
          deliveryAddressId, reqDeliveryPeriod, items,
        );
      } catch (e) { return { error: toMsg(e) }; }
    },
  });

  const updateOrder = tool({
    description:
      'Update an existing orders delivery address, delivery window, or status. ' +
      'All three required - pass existing values for anything you are not changing.',
    parameters: z.object({
      orderId: z.string().uuid().describe('UUID of the order to update'),
      deliveryAddressId: z.number().int().positive(),
      reqDeliveryPeriod: z.object({
        startDateTime: z.number(),
        endDateTime: z.number(),
      }),
      status: z.string().describe('e.g. "UPDATED"'),
    }),
    execute: async ({
      orderId, deliveryAddressId, reqDeliveryPeriod, status,
    }: UpdateOrderParams) => {
      try {
        return await orderV2.updateOrder(
          ctx.orgId, ctx.session, orderId,
          deliveryAddressId, reqDeliveryPeriod, status,
        );
      } catch (e) { return { error: toMsg(e) }; }
    },
  });

  const cancelOrder = tool({
    description:
      'Permanently delete (cancel) an order - irreversible. ' +
      'Always confirm with the user and collect a reason first.',
    parameters: z.object({
      orderId: z.string().uuid(),
      reason: z.string().min(1),
    }),
    execute: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      try   { return await orderV2.cancelOrder(ctx.orgId, orderId, reason, ctx.session); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const generateUBL = tool({
    description:
      'Generate a time-limited signed download URL for an orders UBL 2.1 XML document.',
    parameters: z.object({
      orderId: z.string().uuid(),
    }),
    execute: async ({ orderId }: { orderId: string }) => {
      try {
        const signedUrl = await orderV2.getOrderUBL(ctx.orgId, ctx.session, orderId);
        return { signedUrl };
      } catch (e) { return { error: toMsg(e) }; }
    },
  });

  // addresses 

  const listAddresses = tool({
    description:
      'List all addresses associated with the organisation: ' +
      'its own registered address plus every past delivery address.',
    parameters: z.object({}),
    execute: async () => {
      try   { return await addr.listAddresses(ctx.session, ctx.orgId); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const createAddress = tool({
    description:
      'Create a new reusable address record. ' +
      'Returns the addressId to reference when creating/updating orders.',
    parameters: z.object({
      street: z.string().min(1).max(200),
      city: z.string().optional(),
      postcode: z.string().optional(),
      country: z.string().default('AUS'),
    }),
    execute: async ({ street, city, postcode, country }: CreateAddressParams) => {
      try   { return await addr.createAddress(ctx.session, street, city, postcode, country); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const getAddress = tool({
    description: 'Retrieve the full details of a single address by its ID.',
    parameters: z.object({
      addressId: z.number().int().positive(),
    }),
    execute: async ({ addressId }: { addressId: number }) => {
      try   { return await addr.getAddress(ctx.session, addressId); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const updateAddress = tool({
    description: 'Update one or more fields on an existing address. Only supplied fields change.',
    parameters: z.object({
      addressId: z.number().int().positive(),
      street: z.string().max(200).optional(),
      city: z.string().optional(),
      postcode: z.string().optional(),
      country: z.string().optional(),
    }),
    execute: async ({ addressId, street, city, postcode, country }: UpdateAddressParams) => {
      try {
        // strip out any properties that are explicitly undefined
        const updates = Object.fromEntries(
          // disable so that it can use '_'
          // eslint-disable-next-line
          Object.entries({ street, city, postcode, country }).filter(([_, v]) => v !== undefined)
        );

        return await addr.updateAddress(
          ctx.session, 
          addressId, 
          updates
        );
      } catch (e) { return { error: toMsg(e) }; }
    },
  });

  const deleteAddress = tool({
    description:
      'Delete an address. Fails if the address is still referenced by an order or organisation.',
    parameters: z.object({
      addressId: z.number().int().positive(),
    }),
    execute: async ({ addressId }: { addressId: number }) => {
      try   { return await addr.deleteAddress(ctx.session, addressId); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  return {
    listOrders, getOrderInfo, createOrder, updateOrder, cancelOrder, generateUBL,
    listAddresses, createAddress, getAddress, updateAddress, deleteAddress,
  };
}

// public API 

export interface AgentResponse {
  // model's text reply for this turn
  reply: string;
  // full updated conversation history - persist client-side, send back next turn
  messages: CoreMessage[];
}

/**
 * Non-streaming: run one conversation turn and return a complete response.
 * Best fit for a standard Lambda that returns a single JSON body.
 *
 * @param messages - Full history with the new user message already appended.
 * @param ctx      - Session + orgId for the current request.
 */
export async function runAgentTurn(
  messages: CoreMessage[],
  ctx: ToolContext,
): Promise<AgentResponse> {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    system: SYSTEM_PROMPT,
    messages,
    tools: createTools(ctx),
    maxSteps: 5,
  });

  const assistantMessage: CoreMessage = {
    role: 'assistant',
    content: result.text,
  };

  return {
    reply: result.text,
    messages: [...messages, assistantMessage],
  };
}

/**
 * streamtext: returns the result object - iterate `.textStream` for token-by-token output.
 * not suitable for standard Lambda; use with Vercel Edge / Express SSE instead.
 *
 * Example:
 *   const stream = streamAgentTurn(messages, ctx);
 *   for await (const delta of stream.textStream) res.write(delta);
 */
export function streamAgentTurn(messages: CoreMessage[], ctx: ToolContext) {
  return streamText({
    model: openai('gpt-4o-mini'),
    system: SYSTEM_PROMPT,
    messages,
    tools: createTools(ctx),
    maxSteps: 5,
  });
}

// internal helpers 

function toMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'An unexpected error occurred';
}