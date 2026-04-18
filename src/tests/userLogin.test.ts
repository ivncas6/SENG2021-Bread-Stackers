import { clearData } from '../dataStore';
import { userLogin } from '../userRegister';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { userLoginHandler } from '../handlers/userLogin';
import { InvalidLogin } from '../throwError';
import { getHashOf } from '../userHelper';
import { supabase } from '../supabase';
import { SupabaseMock } from '../interfaces';

// copy of supabase.ts, for some reason it doesn't work when imported
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    lt: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
}));
const mockedSupabase = supabase as unknown as SupabaseMock;

beforeEach(async () => {
  jest.clearAllMocks();
});

describe('Backend logic tests for userLogin', () => {

  test('successfully login a user', async () => {
    // pretend found user in the database & getHashof pw to match
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { contactId: 1, password: getHashOf('password98') }, 
      error: null 
    });

    const newSession = await userLogin('sample@gmail.com', 'password98');
    
    expect(newSession).toStrictEqual({ session: expect.any(String) });
    expect(mockedSupabase.from).toHaveBeenCalledWith('contacts');
  });

  test('invalid email provided / user does not exist', async () => {
    // no user found
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: null, 
      error: null 
    });

    await expect(userLogin('wrong@gmail.com', 'password98'))
      .rejects.toThrow(InvalidLogin);
  });

  test('incorrect password provided', async () => {
    // mock user exits but pw diff
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { contactId: 1, password: getHashOf('realpassword123') }, 
      error: null 
    });

    await expect(userLogin('sample@gmail.com', 'wrongpassword'))
      .rejects.toThrow(InvalidLogin);
  });

});

describe('Lambda tests for userLoginHandler', () => {
  test('successful login via Lambda', async () => {
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: { contactId: 1, password: getHashOf('password98') }, 
      error: null 
    });

    const event = {
      body: JSON.stringify({
        email: 'sample@gmail.com',
        password: 'password98'
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await userLoginHandler(event);

    expect(response.statusCode).toStrictEqual(200);
    expect(JSON.parse(response.body)).toStrictEqual({
      session: expect.any(String)
    });
  });

  test('missing or invalid credentials', async () => {

    // fail to find a user
    mockedSupabase.maybeSingle.mockResolvedValueOnce({ 
      data: null, 
      error: null 
    });

    const event = {
      body: JSON.stringify({
        email: 'defwrong@gmail.com',
        password: 'defwrongpassword'
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await userLoginHandler(event);
    
    expect(response.statusCode).toStrictEqual(400); 
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

});