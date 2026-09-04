require('dotenv').config();

// Force DNS resolution to prefer IPv4.
// This helps avoid Render IPv6 connection errors.
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3001;

// ── CORS CONFIGURATION ────────────────────────────────────────────────
const allowedOriginEnv = process.env.ALLOWED_ORIGIN;

function getCorsOptions() {
  // If ALLOWED_ORIGIN is not specified, empty, or '*', permit all origins
  if (!allowedOriginEnv || allowedOriginEnv.trim() === '*' || allowedOriginEnv.trim() === '') {
    return {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    };
  }

  // Support comma-separated origins with whitespace and trailing slash normalization
  const allowedList = allowedOriginEnv
    .split(',')
    .map(o => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return {
    origin: function (requestOrigin, callback) {
      // Allow non-browser requests (e.g. curl, postman, health checkers)
      if (!requestOrigin) return callback(null, true);

      const cleanOrigin = requestOrigin.trim().replace(/\/+$/, '');

      if (allowedList.includes(cleanOrigin) || allowedList.includes('*')) {
        return callback(null, true);
      }

      // Always allow local development origins regardless of ALLOWED_ORIGIN setting
      if (
        /^https?:\/\/localhost(:\d+)?$/.test(cleanOrigin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(cleanOrigin)
      ) {
        return callback(null, true);
      }

      console.warn(`[CORS Blocked] Origin "${requestOrigin}" is not in ALLOWED_ORIGIN list:`, allowedList);
      return callback(new Error(`Not allowed by CORS: ${requestOrigin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  };
}

const corsMiddleware = cors(getCorsOptions());
app.use(corsMiddleware);
app.options('*', corsMiddleware);

// ── REQUEST CONFIGURATION ─────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

const MAX_ATTACHMENT_BASE64_LENGTH = 20 * 1024 * 1024;

// ── SMTP CONFIGURATION ────────────────────────────────────────────────
function getResolvedSmtpConfig(clientSmtp = {}) {
  const envUser = process.env.SMTP_USER;
  const envPass = process.env.SMTP_PASS;

  // Prefer Render environment variables when configured.
  if (envUser && envPass) {
    return {
      host:
        process.env.SMTP_HOST ||
        clientSmtp.host ||
        'smtp.gmail.com',

      port:
        Number(process.env.SMTP_PORT) ||
        Number(clientSmtp.port) ||
        587,

      user: envUser.trim(),
      pass: envPass,

      fromName:
        process.env.SMTP_FROM_NAME ||
        clientSmtp.fromName ||
        '',

      isFromEnv: true,
    };
  }

  // Fallback to SMTP details supplied by the client.
  return {
    host: clientSmtp.host
      ? String(clientSmtp.host).trim()
      : 'smtp.gmail.com',

    port: Number(clientSmtp.port) || 587,

    user: clientSmtp.user
      ? String(clientSmtp.user).trim()
      : '',

    pass: clientSmtp.pass || '',

    fromName: clientSmtp.fromName
      ? String(clientSmtp.fromName).trim()
      : '',

    isFromEnv: false,
  };
}

// ── SMTP VALIDATION ───────────────────────────────────────────────────
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
    return 'Unsupported SMTP port. Supported ports are 587, 465, or 25';
  }

  return null;
}

// ── CREATE SMTP TRANSPORTER ───────────────────────────────────────────
function createTransporter(smtp) {
  const port = Number(smtp.port) || 587;
  const isSecure = port === 465;

  return nodemailer.createTransport({
    host: smtp.host || 'smtp.gmail.com',
    port,
    secure: isSecure,

    // Force IPv4 to avoid Render IPv6 connection errors.
    family: 4,

    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },

    // Disable pooling because a new transporter is created
    // for each request and closed after the request.
    pool: false,

    // Connection timeout settings.
    connectionTimeout: 60000,
    greetingTimeout: 60000,
    socketTimeout: 120000,
  });
}

// ── EMAIL VALIDATION ──────────────────────────────────────────────────
function validateEmail(email) {
  return (
    typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}

// ── HEALTH CHECK ──────────────────────────────────────────────────────
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'EventCertificateMailer',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    smtpConfigured: Boolean(
      process.env.SMTP_USER && process.env.SMTP_PASS
    ),
  });
});

// ── CLIENT CONFIGURATION DISCOVERY ────────────────────────────────────
// Password is never exposed to the frontend.
app.get('/api/config', (req, res) => {
  const hasEnvSmtp = Boolean(
    process.env.SMTP_USER && process.env.SMTP_PASS
  );

  res.json({
    smtpPreconfigured: hasEnvSmtp,

    smtpHost: hasEnvSmtp
      ? process.env.SMTP_HOST || 'smtp.gmail.com'
      : null,

    smtpPort: hasEnvSmtp
      ? Number(process.env.SMTP_PORT) || 587
      : null,

    smtpUser: hasEnvSmtp
      ? process.env.SMTP_USER
      : null,

    fromName: hasEnvSmtp
      ? process.env.SMTP_FROM_NAME || ''
      : null,
  });
});

// ── TEST SMTP CONNECTION ──────────────────────────────────────────────
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
      message: `SMTP connection successful via ${effectiveSmtp.host}:${effectiveSmtp.port}`,
      source: effectiveSmtp.isFromEnv
        ? 'environment'
        : 'client',
    });
  } catch (error) {
    console.error(
      'SMTP verification failed:',
      error.message
    );

    return res.status(500).json({
      ok: false,
      error: 'SMTP connection failed. Please verify your SMTP settings.',
      details: error.message,
    });
  } finally {
    if (transporter) {
      transporter.close();
    }
  }
});

// ── SEND CERTIFICATE EMAIL ────────────────────────────────────────────
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
      error:
        'Certificate attachment exceeds maximum allowed size (15MB)',
    });
  }

  let transporter;

  try {
    transporter = createTransporter(effectiveSmtp);

    // Clean the display name while preserving the authenticated email.
    const cleanFromName = effectiveSmtp.fromName
      ? String(effectiveSmtp.fromName)
        .replace(/[^\w\s-]/g, '')
        .trim()
      : '';

    const fromAddress = cleanFromName
      ? `"${cleanFromName}" <${effectiveSmtp.user}>`
      : effectiveSmtp.user;

    const safeFilename = filename
      ? String(filename)
        .replace(/[^\w\s.-]/g, '')
        .trim()
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
    console.error(
      `Failed to send certificate email to ${to}:`,
      error.message
    );

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

// ── SPA FALLBACK ROUTE ────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── START SERVER ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(
    `EventCertificateMailer running on port ${PORT}`
  );

  console.log(
    `Environment: ${process.env.NODE_ENV || 'production'}`
  );

  console.log(
    'Health check ready at /health'
  );
});