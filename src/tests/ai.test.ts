import { aiChatHandler } from '../handlersV2/aiChat';
import * as aiService from '../ai/aiService';
import { createTools, runAgentTurn } from '../ai/aiService';
import * as addr from '../address';
import { generateText } from 'ai';

// mocking the external dependencies used by the tools
jest.mock('../address');
jest.mock('ai', () => ({
  generateText: jest.fn(),
  // need the real tool factory logic
  tool: jest.requireActual('ai').tool,
}));

describe('aiChatHandler', () => {
  it('should return 401 if session is missing', async () => {
    const event = { headers: {}, pathParameters: { orgId: '123' }, body: '{}' } as never;
    const response = await aiChatHandler(event);
    expect(response.statusCode).toBe(401);
  });

  it('should return 200 and the AI reply on success', async () => {
    // SPREAD the spy here so we only mock it for this block
    const spy = jest.spyOn(aiService, 'runAgentTurn').mockResolvedValue({
      reply: 'Hello!',
      messages: [{ role: 'assistant', content: 'Hello!' }]
    });

    const event = { 
      headers: { session: 'fake-token' }, 
      pathParameters: { orgId: '123' }, 
      body: JSON.stringify({ message: 'Hi' }) 
    } as never;
    
    const response = await aiChatHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).reply).toBe('Hello!');
    spy.mockRestore(); // Clean up
  });
});

describe('AI Tools', () => {
  const ctx = { session: 'fake-session', orgId: 1 };
  
  // Now this uses the REAL createTools because we removed the global mock
  const tools = createTools(ctx);

  it('createAddress should call addr.createAddress with correct mapped values', async () => {
    jest.spyOn(addr, 'createAddress').mockResolvedValue({ addressId: 99 } as never);
    
    // eslint-disable-next-line
    const result = await (tools.createAddress as any).execute({
      street: '123 Fake St',
      country: 'AUS'
    });

    expect(addr.createAddress).toHaveBeenCalledWith(
      'fake-session',
      '123 Fake St', 
      undefined, 
      undefined, 
      'AUS'
    );
    expect(result).toEqual({ addressId: 99 });
  });

  it('createAddress should safely catch and return errors', async () => {
    jest.spyOn(addr, 'createAddress').mockRejectedValue(new Error('DB Timeout'));
    
    // eslint-disable-next-line
    const result = await (tools.createAddress as any).execute({
      street: '123 Fake St',
      country: 'AUS'
    });

    expect(result).toEqual({ error: 'DB Timeout' });
  });
});

describe('runAgentTurn', () => {
  it('should call generateText with the correct system prompt', async () => {
    // Mock the Vercel AI SDK generateText function
    (generateText as jest.Mock).mockResolvedValue({
      text: 'Sure, I can help.',
    });

    const messages = [{ role: 'user', content: 'Help me' }];
    const ctx = { session: 'token', orgId: 123 };

    const result = await runAgentTurn(messages as never, ctx);

    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      maxSteps: 5,
    }));
    
    expect(result.reply).toBe('Sure, I can help.');
  });
});