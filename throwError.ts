// this file contains the custom errors used for all the functions

// for invalid email (statusCode: 400)
export class InvalidEmail extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_EMAIL';
  }
}

// for invalid first name (statusCode: 400)
export class InvalidFirstName extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_FIRST_NAME';
  }
}

// for invalid last name (statusCode: 400)
export class InvalidLastName extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_LAST_NAME';
  }
}

// for invalid password (statusCode: 400)
export class InvalidPassword extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_PASSWORD';
  }
}

// for invalid credintials (statusCode: 400)
export class InvalidLogin extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_CREDENTIALS';
  }
}

// for unauthorised errors (statusCode: 401)
export class UnauthorisedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UNAUTHORISED';
  }
}
