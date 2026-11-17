const test = require('node:test');
const assert = require('node:assert/strict');
const { sendCodeEmail, testOutbox, resetTestOutbox } = require('../src/services/email.service');

test('test email transport stores codes locally and never calls Brevo', async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldTransport = process.env.EMAIL_TRANSPORT;
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_TRANSPORT = 'test';
  resetTestOutbox();
  try {
    await sendCodeEmail({ email: 'local@example.test', name: 'Local Student', code: '123456', purpose: 'email' });
    assert.equal(testOutbox.length, 1);
    assert.equal(testOutbox[0].code, '123456');
    assert.equal(testOutbox[0].email, 'local@example.test');
  } finally {
    resetTestOutbox();
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
    if (oldTransport === undefined) delete process.env.EMAIL_TRANSPORT; else process.env.EMAIL_TRANSPORT = oldTransport;
  }
});

test('test email transport refuses to run outside test mode', async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldTransport = process.env.EMAIL_TRANSPORT;
  process.env.NODE_ENV = 'development';
  process.env.EMAIL_TRANSPORT = 'test';
  try {
    await assert.rejects(sendCodeEmail({ email: 'local@example.test', code: '123456', purpose: 'email' }), /only in test mode/);
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
    if (oldTransport === undefined) delete process.env.EMAIL_TRANSPORT; else process.env.EMAIL_TRANSPORT = oldTransport;
  }
});
