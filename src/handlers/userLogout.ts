import { APIGatewayProxyEvent } from 'aws-lambda';
import { userLogout } from '../userRegister';
import { handleErrorResponse, jsonResponse } from '../handlerHelpers';

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
  } catch (e: unknown) {
    return handleErrorResponse(e);
  }
};
