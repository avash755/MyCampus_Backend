const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordError, isEmail, safeHttpUrl, escapeRegex, pagination } = require('../src/utils/security');

test('password validation enforces bcrypt byte limit and minimum length', () => {
  assert.match(passwordError('short'), /at least 8/);
  assert.equal(passwordError('a'.repeat(72)), null);
  assert.match(passwordError('a'.repeat(73)), /72 UTF-8 bytes/);
  assert.match(passwordError('é'.repeat(37)), /72 UTF-8 bytes/);
});

test('email validation rejects oversized and malformed addresses', () => {
  assert.equal(isEmail('student@example.edu'), true);
  assert.equal(isEmail('  student@example.edu  '), true);
  assert.equal(isEmail('not-an-email'), false);
  assert.equal(isEmail('x'.repeat(250) + '@a.com'), false);
});

test('only absolute HTTP(S) URLs are allowed for external links', () => {
  assert.equal(safeHttpUrl('https://example.com/resource'), 'https://example.com/resource');
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('//example.com'), null);
  assert.equal(safeHttpUrl(''), '');
});

test('search input is escaped before it becomes a regex', () => {
  const pattern = new RegExp(escapeRegex('.*(notes)+?'), 'i');
  assert.equal(pattern.test('.*(notes)+?'), true);
  assert.equal(pattern.test('anything notes'), false);
});

test('pagination is bounded and rejects malformed values', () => {
  assert.deepEqual(pagination({ page: '2', limit: '1000' }), { page: 2, limit: 50, skip: 50 });
  assert.deepEqual(pagination({}), { page: 1, limit: 30, skip: 0 });
  assert.throws(() => pagination({ page: '2abc' }), { status: 400 });
});
