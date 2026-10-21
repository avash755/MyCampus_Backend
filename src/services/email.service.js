const nodemailer = require('nodemailer');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function transporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('Email is not configured. Add SMTP_USER and SMTP_PASS to server/.env.');
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendCodeEmail({ email, name, code, purpose }) {
  const verification = purpose === 'email';
  const subject = verification ? 'Verify your MyCampus email' : 'Reset your MyCampus password';
  const heading = verification ? 'Verify your email' : 'Reset your password';
  const instruction = verification
    ? 'Enter this six-digit code in MyCampus to finish creating your account.'
    : 'Enter this six-digit code in MyCampus to continue resetting your password.';
  const safeName = escapeHtml(name || 'there');
  const message = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject,
    text: `Hi ${name || 'there'}, your MyCampus code is ${code}. It expires in ${verification ? '24 hours' : '10 minutes'}.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#272444"><p>Hi ${safeName},</p><h1 style="font-size:24px">${heading}</h1><p>${instruction}</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#6158d9">${code}</p><p>This code expires in ${verification ? '24 hours' : '10 minutes'}. If you did not request this, you can ignore this email.</p><p>— MyCampus</p></div>`
  };
  await transporter().sendMail(message);
}

module.exports = { sendCodeEmail };
