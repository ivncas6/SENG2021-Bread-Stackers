import { clearData } from '../dataStore';
import { userRegister, userLogout } from '../userRegister';
import { Session } from '../interfaces';
import { UnauthorisedError } from '../throwError';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { userLogoutHandler } from '../handlers/userLogout';

beforeEach(() => {
  clearData();
});

function createUser() {
  const session = userRegister(
    'sample',
    'user',
    'sample@gmail.com',
    'password98'
  ) as Session;

  return { session };
}

describe('Backend logic tests for userLogout', () => {

  test('successfully logs out a user', () => {
    const { session } = createUser();

    const res = userLogout(session.session);

    expect(res).toEqual({});
  });

  test('invalid session provided', () => {
    expect(() =>
      userLogout('invalidsession')
    ).toThrow(UnauthorisedError);
  });

  test('logout with multiple users in system', () => {

    userRegister(
      'sample',
      'user',
      'sample@gmail.com',
      'password98'
    );

    const user2 = userRegister(
      'random',
      'user',
      'random@gmail.com',
      'password12'
    ) as Session;

    const res = userLogout(user2.session);

    expect(res).toEqual({});
  });

});


describe('Lambda tests for userLogoutHandler', () => {

  test('session header missing', async () => {

    const event = {
      headers: {}
    } as unknown as APIGatewayProxyEvent;

    const response = await userLogoutHandler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'provided session is not valid'
    });
  });

  test('invalid session provided', async () => {

    const event = {
      headers: {
        session: 'randomsession'
      }
    } as unknown as APIGatewayProxyEvent;

    const response = await userLogoutHandler(event);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: expect.any(String)
    });
  });

  test('successful logout', async () => {

    const session = userRegister(
      'sample',
      'user',
      'sample@gmail.com',
      'password98'
    ) as Session;

    const event = {
      headers: {
        session: session.session
      }
    } as unknown as APIGatewayProxyEvent;

    const response = await userLogoutHandler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({});
  });

});