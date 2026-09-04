require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { Resend } = require('resend');

const app = express();

const PORT = process.env.PORT || 3001;

// ── RESEND CONFIGURATION ──────────────────────────────────────────────

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// ── CORS CONFIGURATION ────────────────────────────────────────────────

const allowedOrigin = process.env.ALLOWED_ORIGIN;

if (allowedOrigin && allowedOrigin !== '*') {
  app.use(
    cors({
      origin: allowedOrigin,
    })
  );
} else {
  app.use(cors());
}

// ── REQUEST CONFIGURATION ─────────────────────────────────────────────

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

const MAX_ATTACHMENT_BASE64_LENGTH = 20 * 1024 * 1024;

// ── HELPER FUNCTIONS ──────────────────────────────────────────────────

function validateEmail(email) {
  return (
    typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

function validateResendConfiguration() {
  if (!process.env.RESEND_API_KEY) {
    return 'RESEND_API_KEY is not configured on the server';
  }

  if (!process.env.EMAIL_FROM) {
    return 'EMAIL_FROM is not configured on the server';
  }

  return null;
}

function getFromAddress() {
  const fromName = process.env.EMAIL_FROM_NAME || 'Event Certificate Team';
  const fromEmail = process.env.EMAIL_FROM;

  return `"${fromName}" <${fromEmail}>`;
}

function cleanFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'certificate.png';
  }

  const cleaned = filename
    .replace(/[^\w\s.-]/g, '')
    .trim();

  return cleaned || 'certificate.png';
}

// ── HEALTH CHECK ──────────────────────────────────────────────────────

app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'EventCertificateMailer',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    senderConfigured: Boolean(process.env.EMAIL_FROM),
  });
});

// ── CLIENT CONFIGURATION DISCOVERY ────────────────────────────────────
// The API key is never exposed to the frontend.

app.get('/api/config', (req, res) => {
  res.json({
    emailPreconfigured: Boolean(
      process.env.RESEND_API_KEY && process.env.EMAIL_FROM
    ),
    emailProvider: 'Resend',
    fromEmail: process.env.EMAIL_FROM || null,
    fromName: process.env.EMAIL_FROM_NAME || 'Event Certificate Team',
  });
});

// ── TEST EMAIL API CONNECTION ─────────────────────────────────────────

app.post('/api/test-email', async (req, res) => {
  const configurationError = validateResendConfiguration();

  if (configurationError) {
    return res.status(500).json({
      ok: false,
      error: configurationError,
    });
  }

  const { to } = req.body;

  if (!validateEmail(to)) {
    return res.status(400).json({
      ok: false,
      error: 'A valid recipient email address is required',
    });
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [to.trim()],
      subject: 'EventCertificateMailer Test Email',
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Email Configuration Successful</h2>
          <p>This is a test email from EventCertificateMailer.</p>
          <p>Your Resend email integration is working correctly.</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend test email failed:', error);

      return res.status(500).json({
        ok: false,
        error: error.message || 'Failed to send test email',
      });
    }

    return res.json({
      ok: true,
      message: `Test email sent successfully to ${to}`,
      emailId: data?.id || null,
    });
  } catch (error) {
    console.error('Test email exception:', error.message);

    return res.status(500).json({
      ok: false,
      error: 'Failed to send test email',
      details: error.message,
    });
  }
});

// ── SEND CERTIFICATE EMAIL ────────────────────────────────────────────

app.post('/api/send-email', async (req, res) => {
  const {
    to,
    subject,
    html,
    attachmentBase64,
    filename,
  } = req.body;

  // Validate server configuration

  const configurationError = validateResendConfiguration();

  if (configurationError) {
    return res.status(500).json({
      ok: false,
      error: configurationError,
    });
  }

  // Validate recipient

  if (!validateEmail(to)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid recipient email address: "${to}"`,
    });
  }

  // Validate subject

  if (
    !subject ||
    typeof subject !== 'string' ||
    !subject.trim()
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Email subject is required',
    });
  }

  // Validate email body

  if (
    !html ||
    typeof html !== 'string' ||
    !html.trim()
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Email body content is required',
    });
  }

  // Validate certificate attachment

  if (
    !attachmentBase64 ||
    typeof attachmentBase64 !== 'string'
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Certificate image attachment is required',
    });
  }

  if (
    attachmentBase64.length >
    MAX_ATTACHMENT_BASE64_LENGTH
  ) {
    return res.status(400).json({
      ok: false,
      error: 'Certificate attachment exceeds the maximum allowed size',
    });
  }

  try {
    const safeFilename = cleanFilename(filename);

    // Remove the data URL prefix if the frontend sends one.
    // Example:
    // data:image/png;base64,iVBORw0KGgo...
    const cleanBase64 = attachmentBase64.includes(',')
      ? attachmentBase64.split(',')[1]
      : attachmentBase64;

    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [to.trim()],
      subject: subject.trim(),
      html,

      attachments: [
        {
          filename: safeFilename,
          content: cleanBase64,
        },
      ],
    });

    if (error) {
      console.error(
        `Failed to send certificate email to ${to}:`,
        error
      );

      return res.status(500).json({
        ok: false,
        error: error.message || 'Failed to send certificate email',
      });
    }

    console.log(
      `Certificate email sent successfully to ${to}. Email ID: ${data?.id}`
    );

    return res.json({
      ok: true,
      message: `Certificate email successfully sent to ${to}`,
      emailId: data?.id || null,
    });
  } catch (error) {
    console.error(
      `Failed to send certificate email to ${to}:`,
      error.message
    );

    return res.status(500).json({
      ok: false,
      error: 'Failed to deliver certificate email',
      details: error.message,
    });
  }
});

// ── SPA FALLBACK ROUTE ────────────────────────────────────────────────

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── START SERVER ─────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(
    `EventCertificateMailer running on port ${PORT}`
  );

  console.log(
    `Environment: ${process.env.NODE_ENV || 'production'}`
  );

  console.log(
    `Resend configured: ${Boolean(process.env.RESEND_API_KEY)}`
  );

  console.log(
    `Sender configured: ${Boolean(process.env.EMAIL_FROM)}`
  );

  console.log(
    `Health check ready at /health`
  );
});