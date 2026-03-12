// soon to be jest test file for testing files in src

// dummy test --> NPM test needs at least one test
import { getData } from '../dataStore';

test('dataStore dummy test', () => {
  const data = getData();
  expect(data).toHaveProperty('users');
}); 