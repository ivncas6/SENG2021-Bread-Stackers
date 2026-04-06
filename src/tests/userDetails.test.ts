import { userDetailsUpdate } from '../userRegister';
import { updateUserDetailsHandler } from '../handlers/userDetails';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as userHelper from '../userHelper';
import * as dataStore from '../dataStore';
import { supabase } from '../supabase';
import {
  InvalidEmail,
  InvalidFirstName,
  InvalidPhone,
  UnauthorisedError,
} from '../throwError';

// external deps
jest.mock('../userHelper', () => {
  const actual = jest.requireActual('../userHelper');
  return {
    ...actual,
    getUserIdFromSession: jest.fn(),
    invalidemailcheck: jest.fn(),
    invalidphonecheck: jest.fn(),
  };
});

jest.mock('../dataStore');
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
  }
}));

const mockedUserHelper = userHelper as jest.Mocked<typeof userHelper>;
const mockedDataStore = dataStore as jest.Mocked<typeof dataStore>;
const mockedSupabase = supabase as never;

const mockEvent: Partial<APIGatewayProxyEvent> = {
  headers: {},
  body: ''
};

beforeEach(() => {
  jest.clearAllMocks();
});

async function setupMockUser() {
  const session = 'valid-session';
  const userId = 123;
  mockedUserHelper.getUserIdFromSession.mockReturnValue(userId);
  mockedDataStore.getUserByIdSupa.mockResolvedValue({ contactId: userId } as never);
  mockedSupabase.eq.mockResolvedValue({ error: null });
  
  // Default: validation helpers do nothing (success)
  mockedUserHelper.invalidemailcheck.mockResolvedValue(undefined);
  mockedUserHelper.invalidphonecheck.mockResolvedValue(undefined);
  
  return { session, userId };
}

describe('test for the user details update function', () => {
  test('Successful update', async () => {
    const { session } = await setupMockUser();
    const res = await userDetailsUpdate(session, 'test@test.com', 'John', 'Smith', '0412345678');
    expect(res).toStrictEqual({});
  });

  test('Invalid name characters', async () => {
    const { session } = await setupMockUser();
    // This uses the REAL logic from userHelper because of requireActual
    await expect(
      userDetailsUpdate(session, 'test@test.com', 'Joh!', 'Smith', '0412345678')
    ).rejects.toThrow(InvalidFirstName);
  });

  test('Invalid short name', async () => {
    const { session } = await setupMockUser();
    await expect(
      userDetailsUpdate(session, 'test@test.com', 'J', 'Smith', '0412345678')
    ).rejects.toThrow(InvalidFirstName);
  });

  test('invalid email', async () => {
    const { session } = await setupMockUser();
    // Since we mocked invalidemailcheck, we tell it to throw for this test
    mockedUserHelper.invalidemailcheck.mockRejectedValue(new InvalidEmail('Invalid email'));

    await expect(
      userDetailsUpdate(session, 'bad-email', 'John', 'Smith', '0412345678')
    ).rejects.toThrow(InvalidEmail);
  });

  test('invalid phone', async () => {
    const { session } = await setupMockUser();
    mockedUserHelper.invalidphonecheck.mockRejectedValue(new InvalidPhone('Invalid phone'));

    await expect(
      userDetailsUpdate(session, 'test@test.com', 'John', 'Smith', '123')
    ).rejects.toThrow(InvalidPhone);
  });

  test('user doesnt exist in database', async () => {
    const { session } = await setupMockUser();
    mockedDataStore.getUserByIdSupa.mockResolvedValue(null);

    await expect(
      userDetailsUpdate(session, 'test@test.com', 'John', 'Smith', '0412345678')
    ).rejects.toThrow(UnauthorisedError);
  });
});

describe('Lambda handler tests for userDetailsUpdate', () => {
  test('invalid email provided (Lambda returns 400)', async () => {
    const { session } = await setupMockUser();
    mockedUserHelper.invalidemailcheck.mockRejectedValue(new InvalidEmail('Invalid email'));

    const event = {
      ...mockEvent,
      headers: { session: session },
      body: JSON.stringify({
        firstName: 'John',
        lastName: 'Smith',
        email: 'invalid.com',
        phone: '0412345678'
      }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(event);
    expect(response?.statusCode).toBe(400);
    expect(JSON.parse(response?.body ?? '{}')).toHaveProperty('error');
  });

  test('Missing session header returns 401', async () => {
    const event = {
      ...mockEvent,
      headers: {}, // empty session
      body: JSON.stringify({ firstName: 'John' }),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(event);
    expect(response.statusCode).toBe(401);
  });

  test('Internal Server Error (500) on unexpected crash', async () => {
    const { session } = await setupMockUser();
    // crash
    mockedUserHelper.getUserIdFromSession.mockImplementation(() => {
      throw new Error('Unexpected Crash');
    });

    const event = {
      ...mockEvent,
      headers: { session },
      body: JSON.stringify({}),
    } as unknown as APIGatewayProxyEvent;

    const response = await updateUserDetailsHandler(event);
    expect(response.statusCode).toBe(500);
  });
});