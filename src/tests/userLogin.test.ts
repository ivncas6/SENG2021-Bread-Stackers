import { clearData } from '../dataStore';
import { userRegister, userLogout, userLogin } from '../userRegister';
import { SessionId } from '../interfaces';
// import { InvalidEmail } from '../throwError'; // Or whichever error you throw for bad emails
import { APIGatewayProxyEvent } from 'aws-lambda';
import { userLoginHandler } from '../handlers/userLogin';

beforeEach(async () => {
  await clearData();
  jest.clearAllMocks();
});

async function createUser() {
  const session = await userRegister(
    'sample',
    'user',
    'sample@gmail.com',
    '0412345678',
    'password98'
  ) as SessionId;

  return { session };
}

describe('Backend logic tests for userLogin', () => {

  test('successfully login a user', async () => {
    const { session } = await createUser();
    const res = await userLogout(session.session);
    expect(res).toEqual({});

    const newSession = await userLogin('sample@gmail.com', 'password98');
    expect(newSession).toStrictEqual({ session: expect.any(String) });
  });

  test('invalid email provided', async () => {
    await expect(userLogin('wrong@gmail.com', 'password98'))
      .rejects.toThrow(); // Add your specific Error class here if you want
  });

  test('login with multiple users in system', async () => {
    await createUser();

    // create second user
    await userRegister(
      'random',
      'user',
      'random@gmail.com',
      '0412345679',
      'password12'
    );

    const res = await userLogin('random@gmail.com', 'password12');
    expect(res).toStrictEqual({ session: expect.any(String) });
  });

});

describe('Lambda tests for userLoginHandler', () => {

  test('successful login via Lambda', async () => {
    await createUser();

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
    const event = {
      body: JSON.stringify({
        email: 'wrong@gmail.com',
        password: 'wrongpassword'
      })
    } as unknown as APIGatewayProxyEvent;

    const response = await userLoginHandler(event);

    expect(response.statusCode).not.toBe(200); 
    expect(JSON.parse(response.body)).toHaveProperty('error');
  });

});