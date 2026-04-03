import { 
  jwtClean, createNewSession, isTokenBlacklisted, getUserIdFromSession,
  invalidnameFirst, invalidnameLast, invalidemailcheck, invalidphonecheck
} from '../userHelper';
import { supabase } from '../supabase';
import { UnauthorisedError, InvalidFirstName, 
  InvalidLastName, InvalidEmail, InvalidPhone } from '../throwError';
import jwt from 'jsonwebtoken';

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    single: jest.fn()
  }
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn()
}));

const mockSupabase = supabase as never;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

describe('userHelper - Auth & Sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('jwtClean executes supabase delete correctly', async () => {
    mockSupabase.lt.mockResolvedValueOnce({});
    await jwtClean();
    expect(supabase.from).toHaveBeenCalledWith('jwt_blacklist');
    expect(mockSupabase.delete).toHaveBeenCalled();
  });

  test('createNewSession signs a new token and cleans old ones', async () => {
    // mock jwtClean success
    mockSupabase.lt.mockResolvedValueOnce({});
    mockedJwt.sign.mockReturnValue('mocked-token' as never);
    
    const res = await createNewSession(1);
    expect(res).toEqual({ session: 'mocked-token' });
    expect(mockedJwt.sign).toHaveBeenCalled();
  });

  test('isTokenBlacklisted returns true/false correctly', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { jti: '123' }, error: null });
    await expect(isTokenBlacklisted('123')).resolves.toBe(true);

    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(isTokenBlacklisted('123')).resolves.toBe(false);

    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('DB Error') });
    await expect(isTokenBlacklisted('123')).rejects.toThrow('DB Error');
  });

  describe('getUserIdFromSession', () => {
    test('returns userId on valid, non-blacklisted token', async () => {
      mockedJwt.verify.mockReturnValue({ userId: 1, jti: '123' } as never);
      // not blacklisted
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const res = await getUserIdFromSession('valid-token');
      expect(res).toBe(1);
    });

    test('throws UnauthorisedError if payload has no userId', async () => {
      mockedJwt.verify.mockReturnValue({ jti: '123' } as never);
      await expect(getUserIdFromSession('bad-token')).rejects.toThrow(UnauthorisedError);
    });

    test('throws UnauthorisedError if token is blacklisted', async () => {
      mockedJwt.verify.mockReturnValue({ userId: 1, jti: '123' } as never);
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { jti: '123' }, error: null });

      await expect(getUserIdFromSession('blacklisted-token'))
        .rejects.toThrow('Token has been revoked');
    });

    test('throws UnauthorisedError on verification failure', async () => {
      mockedJwt.verify.mockImplementation(() => { throw new Error('JWT Expired'); });
      await expect(getUserIdFromSession('expired-token')).rejects.toThrow('JWT Expired');
    });

    test('throws generic UnauthorisedError for non-Error throws', async () => {
      mockedJwt.verify.mockImplementation(() => { throw 'String error'; });
      await expect(getUserIdFromSession('weird-token'))
        .rejects.toThrow('Invalid or expired session token');
    });
  });
});

describe('userHelper - Validations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // setup valid session verify for the email/phone checks
    mockedJwt.verify.mockReturnValue({ userId: 1, jti: '123' } as never);
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null }); 
  });

  describe('Name Validation', () => {
    test('invalidnameFirst throws correctly', () => {
      expect(invalidnameFirst('John')).toBeNull();
      // special char
      expect(() => invalidnameFirst('J@hn')).toThrow(InvalidFirstName);
      // name too short
      expect(() => invalidnameFirst('J')).toThrow(InvalidFirstName);
      // too long
      expect(() => invalidnameFirst('ThisNameIsWayTooLongForTheSystem'))
        .toThrow(InvalidFirstName);
    });

    test('invalidnameLast throws correctly', () => {
      expect(invalidnameLast('Doe')).toBeNull();
      // numbers/special
      expect(() => invalidnameLast('D0e')).toThrow(InvalidLastName);
      // too short
      expect(() => invalidnameLast('D')).toThrow(InvalidLastName);
      expect(() => invalidnameLast('ThisLastNameIsWayTooLongForTheSystem'))
      // too long
        .toThrow(InvalidLastName);
    });
  });

  describe('Database Checks (Email & Phone)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockedJwt.verify.mockReturnValue({ userId: 1, jti: '123' } as never);
    });

    test('invalidemailcheck throws on bad format or existing email', async () => {
      await expect(invalidemailcheck('token', 'not-an-email')).rejects.toThrow(InvalidEmail);

      // used email and not blacklisted token
      mockSupabase.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null }) 
        .mockResolvedValueOnce({ data: { contactId: 2 }, error: null });
      await expect(invalidemailcheck('token', 'test@test.com'))
        .rejects.toThrow('Email is already used by another user');

      // unused email and not blacklisted token
      mockSupabase.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });
      await expect(invalidemailcheck('token', 'good@test.com')).resolves.toBeNull();
    });

    test('invalidphonecheck throws on bad format or existing phone', async () => {
      await expect(invalidphonecheck('token', '123')).rejects.toThrow(InvalidPhone);
      await expect(invalidphonecheck('token', '12345678901234')).rejects.toThrow(InvalidPhone);
      await expect(invalidphonecheck('token', '1234567a')).rejects.toThrow(InvalidPhone);

      // used phone and not blacklisted token
      mockSupabase.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: { contactId: 2 }, error: null });
      await expect(invalidphonecheck('token', '0412345678'))
        .rejects.toThrow('Phone number is already used by another user');

      // unused phone should pass
      mockSupabase.maybeSingle
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });
      await expect(invalidphonecheck('token', '0412345678')).resolves.toBeNull();
    });
  });
});