import { APIGatewayProxyEvent } from 'aws-lambda';
import { InvalidLastName,
  InvalidFirstName, InvalidEmail, UnauthorisedError,
  InvalidPhone
} from '../throwError';
import { userDetailsUpdate } from '../userRegister';
import { jsonResponse } from '../handlerHelpers/response';

export const updateUserDetailsHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    // get the session from the header
    const session = event.headers.session;
    if (!session) {
      return jsonResponse(401, { error: 'provided session is not valid'});
    }
    // retrieve the parameters from the body
    const body = JSON.parse(event.body ?? '{}');

    const email = body.email;
    const firstName = body.firstName;
    const lastName = body.lastName;
    const telephone = body.telephone;

    const res = await userDetailsUpdate(
      session, email, firstName, lastName, telephone
    );

    return jsonResponse(200, res);

  } catch (e) {
    if (e instanceof InvalidLastName ||
        e instanceof InvalidFirstName ||
        e instanceof InvalidEmail ||
        e instanceof InvalidPhone
    ) {
      return jsonResponse(400, { error: e.message });
    }
    if (e instanceof UnauthorisedError) {
      return jsonResponse(401, { error: e.message });
    }
    // internal server error, server doesnot know how to handle the error
    return jsonResponse(500, { error: 'INTERNAL SERVER ERROR' });
  }
};
