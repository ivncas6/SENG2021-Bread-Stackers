/**
 * aiService.ts
 *
 * Notes:
 *  - tools call business-logic functions directly (same process, no HTTP hop).
 *  - `session` and `orgId` are captured in a closure so they are never part of
 *    the schema the model sees.
 *  - tools return { error } objects instead of throwing so the model can relay
 *    a friendly message without crashing the turn.
 *  - maxSteps: 5 lets the model chain tool calls in one user turn
 *    (e.g. listOrganisations → listCatalogueItems → createOrderFromCatalogue).
 *  - v2 createOrder is intentionally absent — orders are now placed from the
 *    seller catalogue via createOrderFromCatalogue.
 *  - higher-permission operations (org CRUD, member management) are
 *    absent from the tool set.
 */

import { generateText, streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { CoreMessage } from 'ai';
import { z } from 'zod';

import * as orderV2  from '../orderV2';
import * as orderV3  from '../orderV3';
import * as addr     from '../address';
import * as catalogue from '../catalogue';

const SYSTEM_PROMPT = `\
You are an AI assistant built into a B2B order-management platform called BreadStackers.
Help users manage their orders, catalogue items, and delivery addresses.

Your user's organisation can act as both a buyer and a seller.

## Buying workflow
1. Use listOrganisations to find available sellers.
2. Use listCatalogueItems with a sellerOrgId to browse their products.
3. Ensure a delivery address exists (listAddresses or createAddress).
4. Use createOrderFromCatalogue to place the order — prices come from the catalogue.
5. Track placed orders with listOrders and getOrderInfo.

## Selling workflow
1. Manage your product catalogue with createCatalogueItem, updateCatalogueItem, deleteCatalogueItem.
2. Use listReceivedOrders to see incoming orders (filter by PENDING, ACCEPTED, REJECTED).
3. Use acceptOrder or rejectOrder to respond — a rejection reason is required.

## What you CANNOT do
- Create, update, or delete organisations
- Manage organisation members (add, remove, change roles)
- Access another organisation's private data

## Rules
1. Before any WRITE operation confirm the key details with the user and wait for
   their explicit go-ahead, unless their message already contains confirmation language.
2. For cancellations, deletions, and rejections always collect a reason if none was given.
3. Never expose raw stack traces or internal error messages.
4. Ask for missing required information rather than guessing.
5. Keep replies concise; use bullet points only when listing multiple items.`;

export interface ToolContext {
  session: string;
  orgId: number;
}

// Parameter types — declared explicitly to avoid 'implicitly has any' TS errors.

type DeliveryPeriod = { startDateTime: number; endDateTime: number };

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

type CreateOrderFromCatalogueParams = {
  sellerOrgId: number;
  deliveryAddressId: number;
  reqDeliveryPeriod: DeliveryPeriod;
  items: { catalogueItemId: number; quantity: number }[];
};

type UpdateCatalogueItemParams = {
  catalogueItemId: number;
  name?: string | undefined;
  description?: string | undefined;
  price?: number | undefined;
  active?: boolean | undefined;
};

/**
 * Returns all tool definitions bound to the current request's session + orgId.
 * The closure means those values are never visible to the model.
 */
export function createTools(ctx: ToolContext) {

  // Buyer order tools (v2 — list/view/update/cancel/UBL still use v2 routes)

  const listOrders = tool({
    description:
      'List all orders this organisation has placed as a buyer. ' +
      'Returns each order ID, status, issue date, final price, and currency.',
    parameters: z.object({}),
    execute: async () => {
      try { return await orderV2.listOrders(ctx.orgId, ctx.session); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const getOrderInfo = tool({
    description:
      'Fetch full details of a buyer order: items, delivery address, pricing, ' +
      'delivery window, and contact details.',
    parameters: z.object({
      orderId: z.string().uuid().describe('UUID of the order'),
    }),
    execute: async ({ orderId }: { orderId: string }) => {
      try { return await orderV2.getOrderInfo(ctx.orgId, ctx.session, orderId); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const updateOrder = tool({
    description:
      'Update a buyer order\'s delivery address, delivery window, or status. ' +
      'All three fields are required — pass existing values for anything not changing.',
    parameters: z.object({
      orderId: z.string().uuid().describe('UUID of the order to update'),
      deliveryAddressId: z.number().int().positive(),
      reqDeliveryPeriod: z.object({
        startDateTime: z.number(),
        endDateTime: z.number(),
      }),
      status: z.string().describe('e.g. "UPDATED"'),
    }),
    execute: async (
      { orderId, deliveryAddressId, reqDeliveryPeriod, status }: UpdateOrderParams) => {
      try {
        return await orderV2.updateOrder(
          ctx.orgId, ctx.session, orderId, deliveryAddressId, reqDeliveryPeriod, status,
        );
      } catch (e) { return { error: toMsg(e) }; }
    },
  });

  const cancelOrder = tool({
    description:
      'Permanently cancel a buyer order — irreversible. ' +
      'Always confirm with the user and collect a reason first.',
    parameters: z.object({
      orderId: z.string().uuid(),
      reason: z.string().min(1),
    }),
    execute: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      try { return await orderV2.cancelOrder(ctx.orgId, orderId, reason, ctx.session); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const generateUBL = tool({
    description: 'Generate a time-limited signed download URL for a buyer' + 
    'order\'s UBL 2.1 XML document.',
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

  // Address tools

  const listAddresses = tool({
    description:
      'List all addresses associated with this organisation: ' +
      'its registered address plus every past delivery address.',
    parameters: z.object({}),
    execute: async () => {
      try { return await addr.listAddresses(ctx.session, ctx.orgId); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const createAddress = tool({
    description:
      'Create a new reusable address record. ' +
      'Returns the addressId to use when placing or updating orders.',
    parameters: z.object({
      street: z.string().min(1).max(200),
      city: z.string().optional(),
      postcode: z.string().optional(),
      country: z.string().default('AUS'),
    }),
    execute: async ({ street, city, postcode, country }: CreateAddressParams) => {
      try { return await addr.createAddress(ctx.session, street, city, postcode, country); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const getAddress = tool({
    description: 'Retrieve the full details of a single address by its ID.',
    parameters: z.object({
      addressId: z.number().int().positive(),
    }),
    execute: async ({ addressId }: { addressId: number }) => {
      try { return await addr.getAddress(ctx.session, addressId); }
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
        const updates = Object.fromEntries(
          // eslint-disable-next-line
          Object.entries({ street, city, postcode, country }).filter(([_, v]) => v !== undefined)
        );
        return await addr.updateAddress(ctx.session, addressId, updates);
      } catch (e) { return { error: toMsg(e) }; }
    },
  });

  const deleteAddress = tool({
    description: 'Delete an address. Fails if it is still referenced by an order or organisation.',
    parameters: z.object({
      addressId: z.number().int().positive(),
    }),
    execute: async ({ addressId }: { addressId: number }) => {
      try { return await addr.deleteAddress(ctx.session, addressId); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  // Discovery tool

  const listOrganisations = tool({
    description:
      'List all organisations on the platform. ' +
      'Use this to find sellers and their orgId before browsing their catalogue.',
    parameters: z.object({}),
    execute: async () => {
      try { return await orderV3.listOrganisations(ctx.session); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  // Catalogue browsing (buyer-side — any org can browse any seller)

  const listCatalogueItems = tool({
    description:
      'List all active catalogue items for a given seller organisation. ' +
      'Use listOrganisations first if you do not have the sellerOrgId.',
    parameters: z.object({
      sellerOrgId: z.number().int().positive().describe('orgId of the seller to browse'),
    }),
    execute: async ({ sellerOrgId }: { sellerOrgId: number }) => {
      try { return await catalogue.listCatalogueItems(ctx.session, sellerOrgId); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const getCatalogueItem = tool({
    description: 'Retrieve full details of a single catalogue item by its ID.',
    parameters: z.object({
      catalogueItemId: z.number().int().positive(),
    }),
    execute: async ({ catalogueItemId }: { catalogueItemId: number }) => {
      try { return await catalogue.getCatalogueItem(ctx.session, catalogueItemId); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  // Catalogue management (seller-side — acts on this org's own catalogue)

  const createCatalogueItem = tool({
    description:
      'Add a new item to this organisation\'s seller catalogue with a fixed price. ' +
      'Requires ADMIN or OWNER role.',
    parameters: z.object({
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      price: z.number().nonnegative().describe('Price in AUD'),
    }),
    execute: async ({ name, description, price }: 
      { name: string; description?: string | undefined; price: number }) => {
      try { return await catalogue.createCatalogueItem(
        ctx.session, ctx.orgId, name, description, price); 
      } catch (e) { 
        return { error: toMsg(e) }; 
      }
    },
  });

  const updateCatalogueItem = tool({
    description:
      'Update fields on an existing catalogue item. Only supplied fields change. ' +
      'Set active: false to soft-delete (preferred over deletion). Requires ADMIN or OWNER.',
    parameters: z.object({
      catalogueItemId: z.number().int().positive(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      price: z.number().nonnegative().optional(),
      active: z.boolean().optional().describe('Set false to hide item from buyers'),
    }),
    execute: async ({ catalogueItemId, name, description, 
      price, active }: UpdateCatalogueItemParams) => {
      try {
        const updates = Object.fromEntries(
          // eslint-disable-next-line
          Object.entries({ name, description, price, active }).filter(([_, v]) => v !== undefined)
        );
        return await catalogue.updateCatalogueItem(
          ctx.session, ctx.orgId, catalogueItemId, updates,
        );
      } catch (e) { return { error: toMsg(e) }; }
    },
  });

  const deleteCatalogueItem = tool({
    description:
      'Soft-delete a catalogue item (sets active=false). ' +
      'Buyers can no longer order it but historical order data is preserved.' +
      'Requires ADMIN or OWNER.',
    parameters: z.object({
      catalogueItemId: z.number().int().positive(),
    }),
    execute: async ({ catalogueItemId }: { catalogueItemId: number }) => {
      try { return await catalogue.deleteCatalogueItem(ctx.session, ctx.orgId, catalogueItemId); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  // Catalogue-based order placement (v3 buyer flow)

  const createOrderFromCatalogue = tool({
    description:
      'Place an order by selecting items from a seller\'s catalogue. ' +
      'Prices are set by the seller — you supply catalogueItemId and quantity only. ' +
      'The order starts as PENDING until the seller accepts or rejects it. ' +
      'Always confirm the item list and delivery details with the user before calling.',
    parameters: z.object({
      sellerOrgId: z.number().int().positive().describe('orgId of the seller'),
      deliveryAddressId: z.number().int().positive().describe('Existing address ID'),
      reqDeliveryPeriod: z.object({
        startDateTime: z.number().describe('Unix ms timestamp — delivery window start'),
        endDateTime: z.number().describe('Unix ms timestamp — delivery window end'),
      }),
      items: z.array(z.object({
        catalogueItemId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      })).min(1),
    }),
    execute: async ({
      sellerOrgId, deliveryAddressId, reqDeliveryPeriod, items,
    }: CreateOrderFromCatalogueParams) => {
      try {
        return await orderV3.createOrderFromCatalogue(
          ctx.orgId, ctx.session, sellerOrgId, deliveryAddressId, reqDeliveryPeriod, items,
        );
      } catch (e) { return { error: toMsg(e) }; }
    },
  });

  // Seller order management tools

  const listReceivedOrders = tool({
    description:
      'List orders that have been placed with this organisation as the seller. ' +
      'Optionally filter by status: PENDING, ACCEPTED, or REJECTED.',
    parameters: z.object({
      status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']).optional()
        .describe('Filter by order status — omit to return all'),
    }),
    execute: async ({ status }: { status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | undefined }) => {
      try { return await orderV3.listReceivedOrders(ctx.orgId, ctx.session, status); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const getReceivedOrderInfo = tool({
    description:
      'Fetch full details of an order placed with this organisation as the seller, ' +
      'including items, buyer org, delivery info, and current status.',
    parameters: z.object({
      orderId: z.string().uuid().describe('UUID of the received order'),
    }),
    execute: async ({ orderId }: { orderId: string }) => {
      try { return await orderV3.getReceivedOrderInfo(ctx.orgId, ctx.session, orderId); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const acceptOrder = tool({
    description:
      'Accept a PENDING order placed with this organisation as the seller. ' +
      'Status changes to ACCEPTED. Requires ADMIN or OWNER role. ' +
      'Always confirm with the user before accepting.',
    parameters: z.object({
      orderId: z.string().uuid(),
    }),
    execute: async ({ orderId }: { orderId: string }) => {
      try { return await orderV3.acceptOrder(ctx.orgId, orderId, ctx.session); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  const rejectOrder = tool({
    description:
      'Reject a PENDING order placed with this organisation as the seller. ' +
      'Status changes to REJECTED. A reason is required. Requires ADMIN or OWNER role.',
    parameters: z.object({
      orderId: z.string().uuid(),
      reason: z.string().min(1).describe('Reason for rejecting the order'),
    }),
    execute: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      try { return await orderV3.rejectOrder(ctx.orgId, orderId, reason, ctx.session); }
      catch (e) { return { error: toMsg(e) }; }
    },
  });

  return {
    listOrders, getOrderInfo, updateOrder, cancelOrder, generateUBL,
    listAddresses, createAddress, getAddress, updateAddress, deleteAddress,
    listOrganisations,
    listCatalogueItems, getCatalogueItem,
    createCatalogueItem, updateCatalogueItem, deleteCatalogueItem,
    createOrderFromCatalogue,
    listReceivedOrders, getReceivedOrderInfo, acceptOrder, rejectOrder,
  };
}

export interface AgentResponse {
  reply: string;
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
 * Streaming variant — returns the result object, iterate `.textStream` for
 * token-by-token output. Not suitable for standard Lambda; use with Vercel
 * Edge or Express SSE instead.
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

function toMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'An unexpected error occurred';
}