import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  InvalidEmail,
  InvalidPassword
} from '../throwError';
import { userLogin } from '../userRegister';

export const userLoginHandler = async (event: APIGatewayProxyEvent) => {
  try {
    // retrieve the parameters from the body
    const body = JSON.parse(event.body ?? '{}');

    const email = body.email;
    const password = body.password;

    // call the backend function
    const session = userLogin(email, password);

    return {
      statusCode: 200,
      body: JSON.stringify(session),
    };
  } catch (e) {
    if (e instanceof InvalidEmail || e instanceof InvalidPassword) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: e.message })
      };
    }
    // internal server error, server doesnot know how to handle the error
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'INTERNAL SERVER ERROR' })
    };
  }
};
