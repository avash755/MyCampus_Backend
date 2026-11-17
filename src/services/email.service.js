function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

const testOutbox = [];

async function sendCodeEmail({ email, name, code, purpose }) {
  const transport = process.env.EMAIL_TRANSPORT || (process.env.NODE_ENV === 'production' ? 'brevo' : 'console');
  if (transport === 'test') {
    if (process.env.NODE_ENV !== 'test') throw new Error('The test email transport is available only in test mode.');
    testOutbox.push({ email, name, code, purpose, createdAt: new Date() });
    if (testOutbox.length > 100) testOutbox.shift();
    return { accepted: true, transport: 'test' };
  }
  if (transport === 'console') {
    if (process.env.NODE_ENV === 'production') throw new Error('The console email transport is disabled in production.');
    console.info(`[MyCampus development email] ${purpose} code: ${code}`);
    return { accepted: true, transport: 'console' };
  }
  if (transport !== 'brevo') throw new Error('EMAIL_TRANSPORT must be brevo, console, or test in test mode.');
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
    throw new Error('Email is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL in the server environment.');
  }

  const verification = purpose === 'email';
  const subject = verification ? 'Verify your MyCampus email' : 'Reset your MyCampus password';
  const heading = verification ? 'Verify your email' : 'Reset your password';
  const instruction = verification
    ? 'Enter this six-digit code in MyCampus to finish creating your account.'
    : 'Enter this six-digit code in MyCampus to continue resetting your password.';
  const safeName = escapeHtml(name || 'there');
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'MyCampus',
        email: process.env.BREVO_SENDER_EMAIL
      },
      to: [{ email, name: name || undefined }],
      subject,
      textContent: `Hi ${name || 'there'}, your MyCampus code is ${code}. It expires in ${verification ? '20 minutes' : '10 minutes'}.`,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#272444"><p>Hi ${safeName},</p><h1 style="font-size:24px">${heading}</h1><p>${instruction}</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#6158d9">${code}</p><p>This code expires in ${verification ? '20 minutes' : '10 minutes'}. If you did not request this, you can ignore this email.</p><p>— MyCampus</p></div>`
    })
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = result?.message || result?.code || `HTTP ${response.status}`;
    throw new Error(`Brevo email request failed: ${detail}`);
  }

  return result;
}

function resetTestOutbox() {
  testOutbox.length = 0;
}

module.exports = { sendCodeEmail, testOutbox, resetTestOutbox };
