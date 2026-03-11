// soon to be jest test file for testing files in src

// dummy test --> NPM test needs at least one test

import { sayHello } from '../example.ts';

test('dummy test', () => {
  const msg = sayHello();
  expect(msg).toStrictEqual('Hello, Breadstackers!');
});


