import { ErrorObject, Session, UserInfo, SessionId } from './interfaces';
import { Data, getData } from './dataStore';
import {
  InvalidEmail,
  InvalidFirstName,
  InvalidLastName,
} from '.././throwError';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import validator from 'validator';

/**
 * Given a registered userId the function will create a new session.
 * @param {number} userId
 * @returns {Session}
 */
// helper function for creating a new session
export function createNewSession(userId:number): SessionId {
  const data = getData();

  // generate random session id
  const sessionId = uuidv4();

  // create a new session object
  const session = {
    session: sessionId,
    userId: userId
  };

  // push  object in session array and return session id
  data.sessions.push(session);

  return { session: sessionId };
}


export function invalidnameFirst(nameFirst: string): null | ErrorObject {
  const charRange: RegExp = /^[a-zA-Z\s\-']+$/;
  if (!charRange.test(nameFirst)) {
    throw new InvalidFirstName('invalid first name: includes special characters');
  }

  if (nameFirst.length < 2) {
    throw new InvalidFirstName('First name is less than 2 characters');
  }
  if (nameFirst.length > 20) {
    throw new InvalidFirstName('First name is more than 20 characters');
  }
  return null;
}

export function invalidnameLast(nameLast: string): ErrorObject | null {
  const charRange: RegExp = /^[a-zA-Z\s\-']+$/;
  if (!charRange.test(nameLast)) {
    throw new InvalidLastName('invalid last name -> includes special characters');
  }
  if (nameLast.length < 2) {
    throw new InvalidLastName('Last name is less than 2 characters');
  }
  if (nameLast.length > 20) {
    throw new InvalidLastName('Last name is more than 20 characters');
  }
  return null;
}

export function invalidemailcheck(sessionId: string, email: string): ErrorObject | null {
  const data: Data = getData();
  const sessionEntry = data.sessions.find((s: Session) => s.session === sessionId);

  if (!sessionEntry) return null;
  const userId = sessionEntry.userId;

  if (!validator.isEmail(email)) {
    throw new InvalidEmail('This email is not valid');
  }

  const otherUsersEmail = data.users.some(
    (user: UserInfo) => user.email === email && user.userId !== userId
  );
  if (otherUsersEmail) {
    throw new InvalidEmail('Email is already used by another user');
  }

  return null;
}


export function checkInteger(password: string) {
  const intRange = /\d/;
  if (intRange.test(password)) {
    return true;
  }
  return false;
}

// Given a string will return true if the string has at least 1 alphabetical value
export function hasNonDigitCharacter(str: string) {
  const regex = /\D/;
  return regex.test(str);
}

// Confirms that the string password given is a valid password.
export function checkPassword(password: string): boolean {
  if (password.length < 8) {
    return false;
  }

  if (hasNonDigitCharacter(password) === true && checkInteger(password) === true) {
    return true;
  }

  return false;
}

export function getHashOf(password: string) {
  return crypto.createHash('sha256').update(password).digest('hex');
}
