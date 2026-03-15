import { clearData } from '../dataStore';
import { userRegister, userLogout, userLogin } from '../userRegister';
import { SessionId } from '../interfaces';
/*import { UnauthorisedError } from '../throwError';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { userLoginHandler } from '../handlers/userLogin';*/

beforeEach(async () => {
  await clearData();
  jest.clearAllMocks();
});

function createUser() {
  const session = userRegister(
    'sample',
    'user',
    'sample@gmail.com',
    '0412345678',
    'password98'
  ) as SessionId;

  return { session };
}

describe('Backend logic tests for userLogin', () => {

  test('successfully login a user', () => {
    const { session } = createUser();
    const res = userLogout(session.session);
    expect(res).toEqual({});

    const newSession = userLogin('sample@gmail.com', 'password98');
    expect(newSession).toStrictEqual({session: expect.any(String)});
  });

  /*test('invalid email provided', () => {
    expect(() =>
      userLogin('wrong@gmail.com', 'password98');
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

    const res = userLogin(user2.session);

    expect(res).toStrictEqual({});
  });*/

});


/*describe('Lambda tests for userLoginHandler', () => {

  test('session header missing', async () => {

    const event = {
      headers: {}
    } as unknown as APIGatewayProxyEvent;

    const response = await userLoginHandler(event);

    expect(response.statusCode).toStrictEqual(400);
    expect(JSON.parse(response.body)).toStrictEqual({
      error: 'provided session is not valid'
    });
  });

  test('invalid session provided', async () => {

    const event = {
      headers: {
        session: 'randomsession'
      }
    } as unknown as APIGatewayProxyEvent;

    const response = await userLoginHandler(event);

    expect(response.statusCode).toStrictEqual(401);
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

    const response = await userLoginHandler(event);

    expect(response.statusCode).toStrictEqual(200);
    expect(JSON.parse(response.body)).toStrictEqual({});
  });

});*/