require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const app = require('../src/app');
const { ensureModuleTemplates } = require('../src/services/moduleTemplate.service');
const { testOutbox, resetTestOutbox } = require('../src/services/email.service');

const suffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const databaseName = `mycampus_qa_${suffix}`;
if (!databaseName.startsWith('mycampus_qa_')) throw new Error('QA database guard rejected this database name.');

process.env.NODE_ENV = 'test';
process.env.EMAIL_TRANSPORT = 'test';
process.env.MONGO_DB_NAME = databaseName;
if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
  throw new Error('Configured JWT_SECRET must be at least 32 bytes.');
}

const User = require('../src/db/models/user.model');
const Event = require('../src/db/models/event.model');
const CampusPost = require('../src/db/models/campusPost.model');
const ModuleTemplate = require('../src/db/models/moduleTemplate.model');
const ModuleOffering = require('../src/db/models/moduleOffering.model');
const ModuleRegistration = require('../src/db/models/moduleRegistration.model');
const ModuleMessage = require('../src/db/models/moduleMessage.model');
const AuthThrottle = require('../src/db/models/authThrottle.model');

let httpServer;
let origin;
const createdEmails = [];

function assertStatus(response, expected, label) {
  assert.equal(response.status, expected, `${label}: expected HTTP ${expected}, received ${response.status}`);
}

async function api(path, { method = 'GET', body, cookie, originHeader = 'http://localhost:5173' } = {}) {
  const headers = { Origin: originHeader };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(origin + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie || '' };
}

async function createVerifiedStudent(label) {
  const email = `qa.${label}.${suffix}@example.test`;
  createdEmails.push(email);
  const signup = await api('/api/auth/register', {
    method: 'POST', body: { name: `QA ${label}`, email, password: 'qa-password-2026' }
  });
  assertStatus(signup.response, 201, `signup ${label}`);
  assert.equal(signup.data.emailStatus, 'sent');
  const mail = [...testOutbox].reverse().find((item) => item.email === email && item.purpose === 'email');
  assert.ok(mail, `test email outbox should contain OTP for ${label}`);
  const verified = await api('/api/auth/user-verification', {
    method: 'POST', body: { email, code: mail.code }
  });
  assertStatus(verified.response, 200, `verify ${label}`);
  assert.equal(verified.data.user.role, 'student');
  assert.ok(verified.cookie.startsWith('token='));
  return { email, cookie: verified.cookie, user: verified.data.user };
}

async function getAdminCookie(email, password) {
  const result = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  assertStatus(result.response, 200, 'admin sign-in');
  return result.cookie;
}

async function run() {
  await connectDB();
  await Promise.all([
    User.init(), Event.init(), CampusPost.init(), ModuleTemplate.init(), ModuleOffering.init(),
    ModuleRegistration.init(), ModuleMessage.init(), AuthThrottle.init()
  ]);
  await ensureModuleTemplates();

  httpServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
  });
  origin = `http://127.0.0.1:${httpServer.address().port}`;

  let result = await api('/api/health');
  assertStatus(result.response, 200, 'health endpoint');
  result = await api('/api/ready');
  assertStatus(result.response, 200, 'readiness endpoint');
  result = await api('/api/events');
  assertStatus(result.response, 401, 'protected event route without session');
  result = await api('/api/health', { originHeader: 'https://untrusted.example' });
  assertStatus(result.response, 403, 'untrusted origin');

  const password = 'qa-password-2026';
  const admin = await User.create({
    name: 'QA Admin', email: `admin.${suffix}@example.test`, password: await bcrypt.hash(password, 11),
    role: 'admin', isVerified: true
  });
  const adminCookie = await getAdminCookie(admin.email, password);
  const adminModulePage = await api('/api/modules/admin', { cookie: adminCookie });
  assertStatus(adminModulePage.response, 200, 'admin module view');
  assert.equal(adminModulePage.data.templates.length, 25, 'seeded module catalogue');

  const student = await createVerifiedStudent('one');
  const secondStudent = await createVerifiedStudent('two');
  const studentModules = await api('/api/modules/admin', { cookie: student.cookie });
  assertStatus(studentModules.response, 403, 'student cannot open admin module manager');

  let created = await api('/api/modules', {
    method: 'POST', cookie: adminCookie,
    body: {
      templateNumber: 1, startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      durationDays: 1, scheduleLabel: '3 to 4 hours', description: 'Disposable QA offering', published: true
    }
  });
  assertStatus(created.response, 201, 'admin publishes a module offering');
  const offering = created.data.module;
  let request = await api(`/api/modules/${offering._id}/registrations`, { method: 'POST', cookie: student.cookie, body: {} });
  assertStatus(request.response, 200, 'student requests module registration');
  assert.equal(request.data.status, 'pending');
  request = await api(`/api/modules/${offering._id}/registrations`, { method: 'POST', cookie: adminCookie, body: {} });
  assertStatus(request.response, 403, 'admin cannot register as student');
  const adminRequests = await api(`/api/modules/${offering._id}/registrations`, { cookie: adminCookie });
  assertStatus(adminRequests.response, 200, 'admin sees registration request');
  const registration = adminRequests.data.registrations[0];
  const accepted = await api(`/api/modules/${offering._id}/registrations/${registration._id}`, {
    method: 'PATCH', cookie: adminCookie, body: { status: 'accepted' }
  });
  assertStatus(accepted.response, 200, 'admin accepts student registration');
  const cancelAccepted = await api(`/api/modules/${offering._id}/registrations`, { method: 'DELETE', cookie: student.cookie });
  assertStatus(cancelAccepted.response, 409, 'accepted module registration cannot be cancelled');
  let message = await api(`/api/modules/${offering._id}/messages`, {
    method: 'POST', cookie: student.cookie, body: { body: 'QA module chat message' }
  });
  assertStatus(message.response, 201, 'accepted student sends module chat message');
  const newMessageId = message.data.message._id;
  const studentMessage = message.data.message;
  message = await api(`/api/modules/${offering._id}/messages`, { cookie: secondStudent.cookie });
  assertStatus(message.response, 403, 'unregistered student cannot read private module chat');
  let incrementalChat = await api(`/api/modules/${offering._id}/messages?after=${encodeURIComponent(studentMessage.createdAt)}&afterId=${studentMessage._id}`, { cookie: student.cookie });
  assertStatus(incrementalChat.response, 200, 'module chat incremental cursor');
  assert.equal(incrementalChat.data.messages.length, 0);
  const adminMessage = await api(`/api/modules/${offering._id}/messages`, { method: 'POST', cookie: adminCookie, body: { body: 'Admin QA reply' } });
  assertStatus(adminMessage.response, 201, 'admin replies in module chat');
  incrementalChat = await api(`/api/modules/${offering._id}/messages?after=${encodeURIComponent(studentMessage.createdAt)}&afterId=${studentMessage._id}`, { cookie: student.cookie });
  assertStatus(incrementalChat.response, 200, 'accepted student receives incremental chat updates');
  assert.ok(incrementalChat.data.messages.some((item) => item._id === adminMessage.data.message._id));

  const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const event = await api('/api/events', {
    method: 'POST', cookie: adminCookie,
    body: {
      title: 'QA event', category: 'Workshop', description: 'Capacity concurrency validation',
      date: futureDate.toISOString(), startsAt: futureDate.toISOString(), time: '10:00 AM', location: 'QA room', capacity: 3
    }
  });
  assertStatus(event.response, 201, 'create event');
  const eventId = event.data.event._id;
  const qaUsers = [student, secondStudent];
  for (let index = 3; index <= 8; index += 1) {
    const email = `load.${index}.${suffix}@example.test`;
    const user = await User.create({
      name: `QA Load ${index}`, email, password: await bcrypt.hash(password, 4), isVerified: true
    });
    const token = require('jsonwebtoken').sign({ id: user._id, role: user.role, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    qaUsers.push({ email, cookie: `token=${token}` });
  }
  const joined = await Promise.all(qaUsers.map((account) => api(`/api/events/${eventId}/register`, {
    method: 'POST', cookie: account.cookie, body: { action: 'join' }
  })));
  const successfulJoins = joined.filter((item) => item.response.status === 200 && item.data.registered).length;
  assert.equal(successfulJoins, 3, 'atomic registration enforces the event capacity under concurrent requests');
  assert.equal(joined.filter((item) => item.response.status === 409).length, 5);

  const listedEvent = await api('/api/events?limit=5', { cookie: student.cookie });
  assertStatus(listedEvent.response, 200, 'list events');
  assert.equal(listedEvent.data.events.length, 1);
  assert.equal(Object.hasOwn(listedEvent.data.events[0], 'attendees'), false, 'event API does not reveal attendee user IDs');
  assert.equal(listedEvent.data.events[0].attendeeCount, 3);
  assert.equal(listedEvent.data.events[0].isRegistered, true);

  const post = await api('/api/posts', {
    method: 'POST', cookie: student.cookie,
    body: { title: 'QA resource', body: 'A temporary study resource.', category: 'resource', link: 'javascript:alert(1)' }
  });
  assertStatus(post.response, 400, 'unsafe link rejection');
  const safePost = await api('/api/posts', {
    method: 'POST', cookie: student.cookie,
    body: { title: 'QA resource', body: 'A temporary study resource.', category: 'resource', link: 'https://example.test/notes' }
  });
  assertStatus(safePost.response, 201, 'student publishes a direct resource');
  const postList = await api('/api/posts?limit=5', { cookie: student.cookie });
  assertStatus(postList.response, 200, 'list paginated posts');
  assert.equal(postList.data.pagination.limit, 5);
  const memberProfile = await api(`/api/members/${student.user.id}?limit=5`, { cookie: secondStudent.cookie });
  assertStatus(memberProfile.response, 200, 'member profile post list');
  assert.equal(memberProfile.data.pagination.limit, 5);

  const reset = await api('/api/auth/change-password', { method: 'POST', body: { email: student.email } });
  assertStatus(reset.response, 200, 'request password reset');
  const resetEmail = [...testOutbox].reverse().find((item) => item.email === student.email && item.purpose === 'password');
  assert.ok(resetEmail, 'password reset code should be in local test outbox');
  const resetVerified = await api('/api/auth/verify-changes', { method: 'POST', body: { email: student.email, code: resetEmail.code } });
  assertStatus(resetVerified.response, 200, 'verify password reset code');
  const newPassword = await api('/api/auth/new-password', {
    method: 'POST', body: { password: 'new-qa-password-2026' }, cookie: resetVerified.cookie
  });
  assertStatus(newPassword.response, 200, 'set a new password');
  const oldSession = await api('/api/auth/me', { cookie: student.cookie });
  assertStatus(oldSession.response, 401, 'password reset revokes prior session');
  const newSession = await getAdminCookie(student.email, 'new-qa-password-2026').catch(async () => {
    const result = await api('/api/auth/login', { method: 'POST', body: { email: student.email, password: 'new-qa-password-2026' } });
    assertStatus(result.response, 200, 'sign in with updated password');
    return result.cookie;
  });
  assert.ok(newSession.startsWith('token='));

  const cleanup = await api('/api/auth/me', { method: 'DELETE', cookie: newSession, body: { password: 'new-qa-password-2026' } });
  assertStatus(cleanup.response, 200, 'delete disposable student account');
  assert.equal(await ModuleRegistration.countDocuments({ module: offering._id, student: student.user.id }), 0);
  assert.equal(await ModuleMessage.countDocuments({ _id: newMessageId }), 0);
  const remainingEvent = await Event.findById(eventId).lean();
  assert.equal(remainingEvent.attendees.length, 2, 'account deletion removes event attendance');
  assert.equal(await CampusPost.countDocuments({ title: 'QA resource' }), 0, 'account deletion removes authored posts');

  const rateLimited = [];
  for (let i = 0; i < 9; i += 1) {
    rateLimited.push(await api('/api/auth/login', { method: 'POST', body: { email: `bruteforce.${suffix}@example.test`, password: 'wrong-password' } }));
  }
  assert.ok(rateLimited.some((item) => item.response.status === 429), 'login rate limit blocks repeated guesses');

  console.log(JSON.stringify({
    result: 'PASS',
    database: databaseName,
    email: 'in-memory test outbox; no real email was sent',
    checks: [
      'health/readiness, auth protection, and origin rejection',
      'admin/student roles and 25 module templates',
      'module request/accept, accepted cancellation guard, private chat authorization',
      'event privacy and concurrent atomic capacity enforcement',
      'direct resource posting and unsafe URL rejection',
      'password reset, session revocation, and account cleanup',
      'login throttling'
    ]
  }, null, 2));
}

run()
  .catch((error) => {
    console.error('Local QA flow failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    resetTestOutbox();
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    if (mongoose.connection.readyState === 1) {
      try { await mongoose.connection.dropDatabase(); } catch (error) { console.error('Could not drop isolated QA database:', error.message); }
      await mongoose.disconnect();
    }
  });
