import { createOrderUBLXML, getOrderUBLXML, 
  generateUBLOrderFilePath, UBLBucket } from '../generateUBL';
import { generateUBLHandler } from '../handlers/generateUBL';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as dataStore from '../dataStore';
import * as userHelper from '../userHelper';
import { supabase } from '../supabase';
import { InvalidOrderId, InvalidSupabase, UnauthorisedError } from '../throwError';

// mock deps
jest.mock('../dataStore');
jest.mock('../userHelper');

// specific mock for storage supabase
jest.mock('../supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn().mockReturnThis(),
      createSignedUrl: jest.fn(),
      upload: jest.fn(),
    }
  }
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedDataStore = dataStore as jest.Mocked<typeof dataStore>;
const mockedSupabase = supabase as never;

beforeEach(() => {
  jest.clearAllMocks();
});

// fake data helper function
function setupMocks(overrides: { orgMatch?: boolean, orderExists?: boolean,
    supaSuccess?: boolean, hasOrg?: boolean } = {}) {
  const { orgMatch = true, orderExists = true, supaSuccess = true, hasOrg = true } = overrides;

  // Use mockResolvedValue because it's an async function
  mockedUserHelper.getUserIdFromSession.mockResolvedValue(1);
  
  mockedDataStore.getOrgByUserId.mockResolvedValue({
    data: hasOrg ? { orgId: 100 } : null
  } as never);

  mockedDataStore.getUserByIdSupa.mockResolvedValue({
    firstName: 'Test',
    lastName: 'User',
    telephone: '123456789',
    email: 'test@example.com'
  } as never);

  if (orderExists) {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue({
      orderId: 'valid-id',
      buyerOrgID: orgMatch ? 100 : 999, // Allow simulating order ownership issues
      issuedDate: '2026-04-04',
      issuedTime: '12:00:00',
      currency: 'AUD',
      taxExclusive: 100,
      taxInclusive: 110,
      finalPrice: 110,
      order_lines: [
        { quantity: 2, items: { name: 'Bread', description: 'Fresh', price: 50 } },
        { quantity: 1 } // Purposely missing item details to hit the fallback 'Unknown' logic
      ],
      deliveries: [
        { addresses: { street: '123 Test St' } }
      ]
    } as never);
  } else {
    mockedDataStore.getOrderByIdSupa.mockResolvedValue(null);
  }

  // Simulate Supabase upload/download successes or failures
  if (supaSuccess) {
    mockedSupabase.storage.from(UBLBucket).createSignedUrl.mockResolvedValue(
      { data: { signedUrl: 'https://signed-url.com' }, error: null });
    mockedSupabase.storage.from(UBLBucket).upload.mockResolvedValue({ data: {}, error: null });
  } else {
    mockedSupabase.storage.from(UBLBucket).createSignedUrl.mockResolvedValue(
      { data: null, error: { message: 'Supabase URL err' } });
    mockedSupabase.storage.from(UBLBucket).upload.mockResolvedValue(
      { data: null, error: { message: 'Supabase upload err' } });
  }
}

describe('UBL Helpers', () => {
  test('generateUBLOrderFilePath returns correct formatted string', async () => {
    const path = await generateUBLOrderFilePath('order-123');
    expect(path).toBe('UBLOrders/order-123');
  });
});

describe('Backend: getOrderUBLXML', () => {
  test('successfully gets a signed URL', async () => {
    setupMocks();
    const res = await getOrderUBLXML('valid-id', 'valid-session');
    expect(res).toBe('https://signed-url.com');
  });

  test('throws UnauthorisedError if user has no org', async () => {
    setupMocks({ hasOrg: false });
    await expect(getOrderUBLXML('valid-id', 'valid-session')).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidOrderId if order does not exist', async () => {
    setupMocks({ orderExists: false });
    await expect(getOrderUBLXML('valid-id', 'valid-session')).rejects.toThrow(InvalidOrderId);
  });

  test('throws UnauthorisedError if order belongs to a different organisation', async () => {
    setupMocks({ orgMatch: false });
    await expect(getOrderUBLXML('valid-id', 'valid-session')).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidSupabase on storage error', async () => {
    setupMocks({ supaSuccess: false });
    await expect(getOrderUBLXML('valid-id', 'valid-session')).rejects.toThrow(InvalidSupabase);
  });

  test('throws InvalidSupabase on missing data but no direct error', async () => {
    setupMocks();
    // Simulate weird Supabase state where both data and error are null
    mockedSupabase.storage.createSignedUrl.mockResolvedValue({ data: null, error: null });
    await expect(getOrderUBLXML('valid-id', 'valid-session')).rejects.toThrow(InvalidSupabase);
  });
});

describe('Backend: createOrderUBLXML', () => {
  test('successfully generates a UBL XML and uploads it', async () => {
    setupMocks();
    const res = await createOrderUBLXML('valid-id', 'valid-session');
    expect(res).toBeNull();
    expect(mockedSupabase.storage.upload).toHaveBeenCalled();
  });

  test('throws UnauthorisedError if user has no org', async () => {
    setupMocks({ hasOrg: false });
    await expect(createOrderUBLXML('valid-id', 'valid-session')).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidOrderId if order does not exist', async () => {
    setupMocks({ orderExists: false });
    await expect(createOrderUBLXML('valid-id', 'valid-session')).rejects.toThrow(InvalidOrderId);
  });

  test('throws UnauthorisedError if order belongs to a different organisation', async () => {
    setupMocks({ orgMatch: false });
    await expect(createOrderUBLXML('valid-id', 'valid-session')).rejects.toThrow(UnauthorisedError);
  });

  test('throws InvalidSupabase on storage upload error', async () => {
    setupMocks({ supaSuccess: false });
    await expect(createOrderUBLXML('valid-id', 'valid-session')).rejects.toThrow(InvalidSupabase);
  });
});

describe('AWS Lambda Handlers: generateUBLHandler', () => {
  const mockEventTemplate = {
    pathParameters: { orderId: 'valid-id' },
    headers: { session: 'valid-session' }
  } as unknown as APIGatewayProxyEvent;

  test('Handler returns 200 on success', async () => {
    setupMocks();
    const res: APIGatewayProxyResult = await generateUBLHandler(mockEventTemplate);
    
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('signedUrl', 'https://signed-url.com');
  });

  test('Handler returns 400 on InvalidOrderId', async () => {
    setupMocks({ orderExists: false });
    const res: APIGatewayProxyResult = await generateUBLHandler(mockEventTemplate);
    
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toHaveProperty('error');
  });

  test('Handler returns 401 on UnauthorisedError', async () => {
    setupMocks({ orgMatch: false });
    const res: APIGatewayProxyResult = await generateUBLHandler(mockEventTemplate);
    
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toHaveProperty('error');
  });

  test('Handler returns 500 on InvalidSupabase', async () => {
    setupMocks({ supaSuccess: false });
    const res: APIGatewayProxyResult = await generateUBLHandler(mockEventTemplate);
    
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toHaveProperty('error');
  });

  test('Handler returns 500 on generic unhandled error', async () => {
    setupMocks();
    // force raw error out of first func call
    mockedUserHelper.getUserIdFromSession.mockRejectedValue(new Error('Generic database failure'));
    
    const res: APIGatewayProxyResult = await generateUBLHandler(mockEventTemplate);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toHaveProperty('error', 'INTERNAL SERVER ERROR');
  });
});