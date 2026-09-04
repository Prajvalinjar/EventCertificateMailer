const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3001;

function validateSmtpConfig(smtp) {
  if (!smtp || typeof smtp !== 'object') {
    return 'SMTP configuration is required';
  }

  if (!smtp.host || typeof smtp.host !== 'string') {
    return 'SMTP host is required';
  }

  if (!smtp.user || typeof smtp.user !== 'string') {
    return 'SMTP username is required';
  }

  if (!smtp.pass || typeof smtp.pass !== 'string') {
    return 'SMTP password is required';
  }

  const port = Number(smtp.port) || 587;

  if (![25, 465, 587].includes(port)) {
    return 'Unsupported SMTP port';
  }

  return null;
}

function createTransporter(smtp) {
  const port = Number(smtp.port) || 587;

  return nodemailer.createTransport({
    host: smtp.host,
    port,
    secure: port === 465,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
  });
}

function validateEmail(email) {
  return (
    typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

// POST /api/test-smtp
app.post('/api/test-smtp', async (req, res) => {
  const { smtp } = req.body;

  const validationError = validateSmtpConfig(smtp);

  if (validationError) {
    return res.status(400).json({
      ok: false,
      error: validationError,
    });
  }

  try {
    const transporter = createTransporter(smtp);

    await transporter.verify();
    transporter.close();

    return res.json({
      ok: true,
      message: 'SMTP connection successful',
    });
  } catch (error) {
    console.error('SMTP test error:', error.message);

    return res.status(500).json({
      ok: false,
      error: 'SMTP connection failed. Please check your settings.',
      details: error.message,
    });
  }
});

// POST /api/send-email
app.post('/api/send-email', async (req, res) => {
  const {
    smtp,
    to,
    subject,
    html,
    attachmentBase64,
    filename,
  } = req.body;

  const smtpError = validateSmtpConfig(smtp);

  if (smtpError) {
    return res.status(400).json({
      ok: false,
      error: smtpError,
    });
  }

  if (!validateEmail(to)) {
    return res.status(400).json({
      ok: false,
      error: 'A valid recipient email address is required',
    });
  }

  if (!subject || typeof subject !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Email subject is required',
    });
  }

  if (!html || typeof html !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Email content is required',
    });
  }

  if (!attachmentBase64 || typeof attachmentBase64 !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Certificate attachment is required',
    });
  }

  try {
    const transporter = createTransporter(smtp);

    const senderName = smtp.fromName
      ? `"${String(smtp.fromName).replace(/"/g, '')}" <${smtp.user}>`
      : smtp.user;

    await transporter.sendMail({
      from: senderName,
      to: to.trim(),
      subject: subject.trim(),
      html,
      attachments: [
        {
          filename: filename || 'certificate.png',
          content: attachmentBase64,
          encoding: 'base64',
          contentType: 'image/png',
        },
      ],
    });

    transporter.close();

    return res.json({
      ok: true,
      message: `Email sent successfully to ${to}`,
    });
  } catch (error) {
    console.error('Send email error:', error.message);

    return res.status(500).json({
      ok: false,
      error: 'Email could not be sent',
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Certificate mailer running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/index.html`);
});