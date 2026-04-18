import { APIGatewayProxyEvent } from 'aws-lambda';
import { UnauthorisedError } from '../throwError';
import { userLogout } from '../userRegister';
import { jsonResponse } from '../handlerHelpers/response';

export const userLogoutHandler = async (event: APIGatewayProxyEvent) => {
  try {
    // get the session from the header
    const session = event.headers.session;
    if (!session) {
      return jsonResponse(400, { error: 'provided session is not valid' });
    }

    // call the backend function
    const res = await userLogout(session);

    return jsonResponse(200, res);
  } catch (e) {
    if (e instanceof UnauthorisedError) {
      return jsonResponse(401, { error: e.message });
    }
    // internal server error, server doesnot know how to handle the error
    return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
  }
};
