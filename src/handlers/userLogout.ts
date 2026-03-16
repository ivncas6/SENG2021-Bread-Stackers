import { APIGatewayProxyEvent } from 'aws-lambda';
import { UnauthorisedError } from '../throwError';
import { userLogout } from '../userRegister';

export const userLogoutHandler = async (event: APIGatewayProxyEvent) => {
  try {
    // get the session from the header
    const session = event.headers.session;
    if (!session) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'provided session is not valid' }),
      };
    }

    // call the backend function
    const res = await userLogout(session);

    return {
      statusCode: 200,
      body: JSON.stringify(res),
    };
  } catch (e) {
    if (e instanceof UnauthorisedError) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: e.message }),
      };
    }
    // internal server error, server doesnot know how to handle the error
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'INTERNAL SERVER ERROR' }),
    };
  }
};
