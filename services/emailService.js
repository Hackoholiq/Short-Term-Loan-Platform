// backend/services/emailService.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendEmail = async (to, subject, html) => {
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
  });
};

/* =========================
   BUSINESS EMAILS
========================= */

const sendPasswordResetEmail = async (user, resetLink) => {
  const html = `
    <h2>Password Reset</h2>
    <p>Hello ${user.first_name},</p>
    <p>You requested a password reset.</p>
    <p>This link expires in 30 minutes.</p>
    <a href="${resetLink}"
       style="display:inline-block;padding:10px 15px;background:#007bff;color:#fff;border-radius:4px;text-decoration:none">
      Reset Password
    </a>
    <p>If you did not request this, ignore this email.</p>
  `;

  await sendEmail(user.email, 'Reset your password', html);
};

module.exports = {
  sendPasswordResetEmail,
};