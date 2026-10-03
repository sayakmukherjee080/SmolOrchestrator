// Installer validation helpers (setup.js is never executed by the test suite).
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail, validatePassword } from '../setup.js';

test('email validation', () => {
  assert.equal(validateEmail('admin@example.com'), true);
  assert.equal(validateEmail('not-an-email'), false);
  assert.equal(validateEmail(''), false);
});

test('password policy', () => {
  assert.equal(validatePassword('long-enough-pass'), true);
  assert.equal(validatePassword('short'), false);
  assert.equal(validatePassword('1234567890', 10), true);
  assert.equal(validatePassword('123456789', 10), false);
});
