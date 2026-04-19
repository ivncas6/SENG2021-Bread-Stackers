// this file contains the custom errors used for all the functions

// for invalid input
export class InvalidInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_INPUT';
  }
}

// for invalid email (statusCode: 400)
export class InvalidEmail extends InvalidInput {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_EMAIL';
  }
}

// for invalid phone (statusCode: 400)
export class InvalidPhone extends InvalidInput {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_PHONE';
  }
}

// for invalid first name (statusCode: 400)
export class InvalidFirstName extends InvalidInput {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_FIRST_NAME';
  }
}

// for invalid last name (statusCode: 400)
export class InvalidLastName extends InvalidInput {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_LAST_NAME';
  }
}

// for invalid business name (statusCode: 400)
export class InvalidBusinessName extends InvalidInput {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_BUSINESS_NAME';
  }
}

// for invalid password (statusCode: 400)
export class InvalidPassword extends InvalidInput {
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

// for invalid orderId
export class InvalidOrderId extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_ORDER_ID';
  }
}

// for invalid delivery address
export class InvalidDeliveryAddr extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_DELIVERY_ADDRESS';
  }
}

// for invalid delivery request period
export class InvalidRequestPeriod extends InvalidInput {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_REQUEST_PERIOD';
  }
}

// for invalid item number
export class InvalidItemQuantity extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_ITEM_QUANTITY';
  }
}

export class InvalidSupabase extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'INVALID_SUPABASE';
  }
}