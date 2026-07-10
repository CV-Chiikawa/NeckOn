const nodemailer = require('nodemailer');

const DEFAULT_CONTACT_MAIL_TO = 'fhtkrudgns123@gmail.com';

function getBooleanEnv(value) {
  return String(value || '').toLowerCase() === 'true';
}

function getMailConfig() {
  const jsonTransport = getBooleanEnv(process.env.CONTACT_MAIL_JSON_TRANSPORT);
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587);
  const secure = getBooleanEnv(process.env.SMTP_SECURE || process.env.MAIL_SECURE);
  const user = process.env.SMTP_USER || process.env.MAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASS;
  const from = process.env.MAIL_FROM || user;
  const to =
    process.env.CONTACT_MAIL_TO ||
    process.env.MAIL_TO ||
    DEFAULT_CONTACT_MAIL_TO;

  return {
    jsonTransport,
    host,
    port,
    secure,
    user,
    pass,
    from,
    to,
    subjectPrefix: process.env.CONTACT_MAIL_SUBJECT_PREFIX || '[Turtle Neck Contact]',
  };
}

function isMailConfigured() {
  const config = getMailConfig();

  if (!config.to) {
    return false;
  }

  if (config.jsonTransport) {
    return true;
  }

  return Boolean(config.host && config.from);
}

function createTransporter(config) {
  if (config.jsonTransport) {
    return nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  const transportOptions = {
    host: config.host,
    port: config.port,
    secure: config.secure,
  };

  if (config.user && config.pass) {
    transportOptions.auth = {
      user: config.user,
      pass: config.pass,
    };
  }

  return nodemailer.createTransport(transportOptions);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildContactMail({ user, category, content, attachments = [] }) {
  const config = getMailConfig();
  const safeContent = String(content).trim();
  const subject = `${config.subjectPrefix} ${category.label}`;
  const userLines = [
    `User ID: ${user.id}`,
    `Username: ${user.username || '-'}`,
    `Nickname: ${user.nickname || '-'}`,
    `Email: ${user.email}`,
  ];
  const text = [
    `Category: ${category.label} (${category.code})`,
    ...userLines,
    '',
    'Content:',
    safeContent,
  ].join('\n');
  const htmlContent = escapeHtml(safeContent).replace(/\n/g, '<br>');
  const html = `
    <h2>Contact inquiry</h2>
    <p><strong>Category:</strong> ${escapeHtml(category.label)} (${escapeHtml(category.code)})</p>
    <ul>
      <li><strong>User ID:</strong> ${escapeHtml(user.id)}</li>
      <li><strong>Username:</strong> ${escapeHtml(user.username || '-')}</li>
      <li><strong>Nickname:</strong> ${escapeHtml(user.nickname || '-')}</li>
      <li><strong>Email:</strong> ${escapeHtml(user.email)}</li>
    </ul>
    <hr>
    <p>${htmlContent}</p>
  `;

  return {
    from: config.from,
    to: config.to,
    replyTo: user.email,
    subject,
    text,
    html,
    attachments: attachments.map((file) => ({
      filename: file.originalname,
      content: file.buffer,
      contentType: file.mimetype,
    })),
  };
}

async function sendContactMail(params) {
  const config = getMailConfig();

  if (!isMailConfigured()) {
    return {
      delivered: false,
      reason: 'not_configured',
    };
  }

  const transporter = createTransporter(config);
  const info = await transporter.sendMail(buildContactMail(params));

  return {
    delivered: true,
    messageId: info.messageId || null,
  };
}

module.exports = {
  buildContactMail,
  isMailConfigured,
  sendContactMail,
};
