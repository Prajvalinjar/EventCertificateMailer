require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();

// CORS Configuration
const allowedOrigin = process.env.ALLOWED_ORIGIN;
if (allowedOrigin && allowedOrigin !== '*') {
  app.use(cors({ origin: allowedOrigin }));
} else {
  app.use(cors());
}

// Request size protection (certificates can be high-res Base64 images)
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3001;

// Maximum attachment size allowed (15 MB raw binary ~= 20 MB base64)
const MAX_ATTACHMENT_BASE64_LENGTH = 20 * 1024 * 1024;

/**
 * Resolves effective SMTP settings, preferring server environment variables if configured.
 */
function getResolvedSmtpConfig(clientSmtp = {}) {
  const envUser = process.env.SMTP_USER;
  const envPass = process.env.SMTP_PASS;

  if (envUser && envPass) {
    return {
      host: process.env.SMTP_HOST || clientSmtp.host || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || Number(clientSmtp.port) || 587,
      user: envUser.trim(),
      pass: envPass,
      fromName: process.env.SMTP_FROM_NAME || clientSmtp.fromName || '',
      isFromEnv: true,
    };
  }

  return {
    host: clientSmtp.host ? String(clientSmtp.host).trim() : 'smtp.gmail.com',
    port: Number(clientSmtp.port) || 587,
    user: clientSmtp.user ? String(clientSmtp.user).trim() : '',
    pass: clientSmtp.pass || '',
    fromName: clientSmtp.fromName ? String(clientSmtp.fromName).trim() : '',
    isFromEnv: false,
  };
}

/**
 * Validates the SMTP configuration object.
 */
function validateSmtpConfig(smtp) {
  if (!smtp || typeof smtp !== 'object') {
    return 'SMTP configuration is required';
  }

  if (!smtp.host || typeof smtp.host !== 'string') {
    return 'SMTP host is required';
  }

  if (!smtp.user || typeof smtp.user !== 'string') {
    return 'SMTP username / email is required';
  }

  if (!smtp.pass || typeof smtp.pass !== 'string') {
    return 'SMTP password or Google App Password is required';
  }

  const port = Number(smtp.port) || 587;
  if (![25, 465, 587].includes(port)) {
    return 'Unsupported SMTP port. Supported ports are 587 (TLS), 465 (SSL), or 25';
  }

  return null;
}

/**
 * Creates a Nodemailer transporter instance with connection pooling.
 */
function createTransporter(smtp) {
  const port = Number(smtp.port) || 587;
  const isSecure = port === 465;

  return nodemailer.createTransport({
    host: smtp.host,
    port,
    secure: isSecure, // true for 465, false for 587 (STARTTLS)
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  });
}

/**
 * Validates email format using standard regex.
 */
function validateEmail(email) {
  return (
    typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

// ── HEALTH CHECK ROUTE ────────────────────────────────────────────────
// GET /health and /api/health for Render/production monitoring
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'EventCertificateMailer',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    smtpConfigured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
  });
});

// ── CLIENT CONFIGURATION DISCOVERY ───────────────────────────────────
// GET /api/config — allows client to know if server has pre-configured SMTP
// Note: Password is NEVER exposed.
app.get('/api/config', (req, res) => {
  const hasEnvSmtp = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
  res.json({
    smtpPreconfigured: hasEnvSmtp,
    smtpHost: hasEnvSmtp ? (process.env.SMTP_HOST || 'smtp.gmail.com') : null,
    smtpPort: hasEnvSmtp ? (Number(process.env.SMTP_PORT) || 587) : null,
    smtpUser: hasEnvSmtp ? process.env.SMTP_USER : null,
    fromName: hasEnvSmtp ? (process.env.SMTP_FROM_NAME || '') : null,
  });
});

// ── TEST SMTP CONNECTION ─────────────────────────────────────────────
// POST /api/test-smtp
app.post('/api/test-smtp', async (req, res) => {
  const effectiveSmtp = getResolvedSmtpConfig(req.body.smtp);
  const validationError = validateSmtpConfig(effectiveSmtp);

  if (validationError) {
    return res.status(400).json({
      ok: false,
      error: validationError,
    });
  }

  let transporter;
  try {
    transporter = createTransporter(effectiveSmtp);
    await transporter.verify();

    return res.json({
      ok: true,
      message: `SMTP connection successful via ${effectiveSmtp.host}:${effectiveSmtp.port} (${effectiveSmtp.user})`,
      source: effectiveSmtp.isFromEnv ? 'environment' : 'client',
    });
  } catch (error) {
    console.error('SMTP verification failed for user %s: %s', effectiveSmtp.user, error.message);

    return res.status(500).json({
      ok: false,
      error: 'SMTP connection failed. Please verify your Google App Password and account settings.',
      details: error.message,
    });
  } finally {
    if (transporter) {
      transporter.close();
    }
  }
});

// ── SEND CERTIFICATE EMAIL ───────────────────────────────────────────
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

  const effectiveSmtp = getResolvedSmtpConfig(smtp);
  const smtpError = validateSmtpConfig(effectiveSmtp);

  if (smtpError) {
    return res.status(400).json({
      ok: false,
      error: smtpError,
    });
  }

  if (!validateEmail(to)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid recipient email address: "${to}"`,
    });
  }

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'Email subject is required',
    });
  }

  if (!html || typeof html !== 'string' || !html.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'Email body content is required',
    });
  }

  if (!attachmentBase64 || typeof attachmentBase64 !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Certificate image attachment is required',
    });
  }

  if (attachmentBase64.length > MAX_ATTACHMENT_BASE64_LENGTH) {
    return res.status(400).json({
      ok: false,
      error: 'Certificate attachment exceeds maximum allowed size (15MB)',
    });
  }

  let transporter;
  try {
    transporter = createTransporter(effectiveSmtp);

    // Ensure the authenticated Gmail account matches the sender address
    const cleanFromName = effectiveSmtp.fromName
      ? String(effectiveSmtp.fromName).replace(/[^\w\s-]/g, '').trim()
      : '';
    const fromAddress = cleanFromName
      ? `"${cleanFromName}" <${effectiveSmtp.user}>`
      : effectiveSmtp.user;

    const safeFilename = filename
      ? String(filename).replace(/[^\w\s.-]/g, '').trim()
      : 'certificate.png';

    await transporter.sendMail({
      from: fromAddress,
      to: to.trim(),
      subject: subject.trim(),
      html,
      attachments: [
        {
          filename: safeFilename,
          content: attachmentBase64,
          encoding: 'base64',
          contentType: 'image/png',
        },
      ],
    });

    return res.json({
      ok: true,
      message: `Certificate email successfully dispatched to ${to}`,
    });
  } catch (error) {
    console.error('Failed to send certificate email to %s: %s', to, error.message);

    return res.status(500).json({
      ok: false,
      error: 'Failed to deliver email through Gmail SMTP',
      details: error.message,
    });
  } finally {
    if (transporter) {
      transporter.close();
    }
  }
});

// Fallback route for single-page app routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`EventCertificateMailer running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`Health check ready at: http://localhost:${PORT}/health`);
});