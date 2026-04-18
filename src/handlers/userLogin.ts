import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  InvalidEmail,
  InvalidLogin,
  InvalidPassword
} from '../throwError';
import { userLogin } from '../userRegister';
import { jsonResponse } from '../handlerHelpers/response';

export const userLoginHandler = async (event: APIGatewayProxyEvent) => {
  try {
    // retrieve the parameters from the body
    const body = JSON.parse(event.body ?? '{}');

    const email = body.email;
    const password = body.password;

    // call the backend function
    const session = await userLogin(email, password);

    return jsonResponse(200, session);
  } catch (e) {
    if (e instanceof InvalidEmail || 
      e instanceof InvalidPassword || 
      e instanceof InvalidLogin) {
      return jsonResponse(400, { error: e.message });
    }
    // internal server error, server doesnot know how to handle the error
    return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
  }
};
