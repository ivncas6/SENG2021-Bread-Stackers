import { APIGatewayProxyEvent } from 'aws-lambda';
import { InvalidLastName,
  InvalidFirstName, InvalidEmail, UnauthorisedError
} from '../throwError';
import { userDetailsUpdate} from '../userRegister';

export const updateUserDetailsHandler = async (
  event: APIGatewayProxyEvent
) => {
  try {
    // get the session from the header
    const session = event.headers.session;
    if (!session) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'provided session is not valid'})
      };
    }
    // retrieve the parameters from the body
    const body = JSON.parse(event.body ?? '{}');

    const email = body.email;
    const firstName = body.firstName;
    const lastName = body.lastName;

    const res = userDetailsUpdate(
      session, email, firstName, lastName
    );

    return {
      statusCode: 200,
      body: JSON.stringify(res),
    };

  } catch (e) {
    if (e instanceof InvalidLastName ||
        e instanceof InvalidFirstName ||
        e instanceof InvalidEmail
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: e.message })
      };
    }
    if (e instanceof UnauthorisedError) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: e.message })
      };
    }
    // internal server error, server doesnot know how to handle the error
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'INTERNAL SERVER ERROR' }),
    };
  }
};