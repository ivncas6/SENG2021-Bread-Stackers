import { APIGatewayProxyEvent } from 'aws-lambda';
import { userLogin } from '../userRegister';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

export const userLoginHandler = async (event: APIGatewayProxyEvent) => {
  try {
    // retrieve the parameters from the body
    const body = JSON.parse(event.body ?? '{}');

    const email = body.email;
    const password = body.password;

    // call the backend function
    const session = await userLogin(email, password);

    return jsonResponse(200, session);
  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};
