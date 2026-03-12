import { dummyHandler } from '../handlers/placeholder'

test('dummy test for coverage for placeholder handler', async () => {
  const res = await dummyHandler();
  expect(res.statusCode).toStrictEqual(200);
  expect(JSON.parse(res.body)).toStrictEqual({ status: 'OK' });
});