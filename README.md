# EventCertificateMailer

> **EventCertificateMailer** is an application designed to simplify the process of sending event participation certificates to multiple recipients. It uses Gmail SMTP to deliver personalized emails with certificate attachments, reducing manual work and improving the efficiency of certificate distribution.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)

---

## Overview

Organizing workshops, webinars, hackathons, and conferences often involves issuing personalized certificates to dozens or hundreds of attendees. Manually customizing graphics in design tools and sending individual emails is slow, tedious, and error-prone.

**EventCertificateMailer** bridges this gap by providing an intuitive, browser-based visual workspace where event coordinators can:
1. Upload any custom certificate background image (PNG, JPG, WebP).
2. Ingest attendee spreadsheets (`.xlsx`, `.xls`, `.csv`).
3. Visually drag and position spreadsheet columns onto the certificate canvas with rich typography controls.
4. Preview and fine-tune individual recipient certificates (e.g., resizing text for exceptionally long names).
5. Generate high-resolution certificates directly in the browser.
6. Dispatch personalized emails with certificates attached directly through **Gmail SMTP** using an authorized **Google App Password**, or download all certificates as a single compressed ZIP archive.

---

## Features

- **Interactive Canvas Designer**: Drag and drop spreadsheet columns directly onto the certificate background with real-time positioning and visual alignment.
- **Spreadsheet Ingestion**: Supports `.xlsx`, `.xls`, and `.csv` files using SheetJS. Every column header automatically becomes a placeable field chip.
- **Rich Typography & Styling**: 20+ Google Fonts (Handwriting, Elegant Serif, Classic Serif, Sans-serif, Monospace), font sizing, color picker, bold/italic toggles, text alignment, casing transforms (UPPERCASE, Title Case), and customizable drop shadows.
- **Per-Row Fine-Tuning (Overrides)**: Inspect any recipient's certificate in row-edit mode. Adjust position or font size for outlier names without altering the global layout.
- **Gmail SMTP Integration**: Dispatch personalized certificate emails directly through Google's secure mail servers using standard SMTP and Google App Passwords.
- **Rich-Text Email Composer**: In-app WYSIWYG editor supporting placeholders like `{{firstName}}`, `{{name}}`, and custom column attributes (e.g., `{{event}}`, `{{role}}`), with draft auto-saving and reusable templates.
- **Bulk Local Export**: Download individual preview certificates or package all generated certificates into a single `.zip` archive via JSZip.
- **Responsive Canvas Zoom**: Fluid zoom controls (25% to 100%) with automatic viewport fitting on image load.

---

## How the Application Works

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Browser (Client-Side)                                │
│                                                                                  │
│   [Template Image]          [Spreadsheet (.xlsx / .csv)]                         │
│          │                               │                                       │
│          ▼                               ▼                                       │
│   ┌─────────────────────────────────────────────────────────┐                    │
│   │               Interactive HTML5 Canvas                  │                    │
│   │   - Normalized relative coordinates (0.0 to 1.0)        │                    │
│   │   - Real-time typography rendering & drop shadows       │                    │
│   │   - Per-row manual adjustments stored in state          │                    │
│   └─────────────┬─────────────────────────────┬─────────────┘                    │
│                 │                             │                                  │
│                 ▼                             ▼                                  │
│        [Export Bulk ZIP]             [Render Offscreen PNG]                      │
│        (Client-side JSZip)                    │                                  │
│                                               ▼                                  │
│                                  [Interpolate Email & Vars]                      │
│                                  (Subject + HTML Body + Base64)                  │
└───────────────────────────────────────────────┬──────────────────────────────────┘
                                                │ HTTP POST
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         Backend Relay (Node.js / Express)                        │
│                                                                                  │
│   POST /api/send-email          POST /api/test-smtp                              │
│   - Validates payload format    - Verifies credentials                           │
│   - Enforces attachment limits  - Pools connection                               │
│   - Invokes Nodemailer          - Returns structured JSON                        │
└───────────────────────────────────────────────┬──────────────────────────────────┘
                                                │ SMTP (Port 587 TLS / 465 SSL)
                                                ▼
                                   ┌──────────────────────────┐
                                   │     Gmail SMTP Server    │
                                   │     (smtp.gmail.com)     │
                                   └────────────┬─────────────┘
                                                │
                                                ▼
                                   ┌──────────────────────────┐
                                   │     Recipient Inboxes    │
                                   └──────────────────────────┘
```

1. **Client Processing**: The browser parses the spreadsheet and renders the certificate using the HTML5 Canvas API. The certificate coordinates are stored as normalized percentages ($0.0 \le x, y \le 1.0$), ensuring consistent output regardless of display zoom.
2. **Offscreen Rendering**: For each recipient, an in-memory canvas paints the background image and participant text at full native resolution, converting the output to a high-quality PNG blob.
3. **Backend Relay**: The lightweight Node.js Express server acts as an authenticated bridge between the web interface and Gmail SMTP, receiving the Base64 image attachment and dispatching it securely through Nodemailer.

---

## Tech Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend UI** | HTML5, CSS3, Vanilla JavaScript (ES6+) | Clean, responsive single-page application without frontend framework bloat |
| **Canvas Engine** | HTML5 Canvas 2D Context | High-resolution dynamic certificate text rendering and hit-testing |
| **Spreadsheet Parser** | [SheetJS (xlsx)](https://sheetjs.com/) | Client-side spreadsheet reading (`.xlsx`, `.xls`, `.csv`) |
| **ZIP Packaging** | [JSZip](https://stuk.github.io/jszip/) | Client-side compressed archive creation for bulk downloads |
| **Backend Server** | [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/) | REST API server, static asset host, and SMTP relay proxy |
| **Email Delivery** | [Nodemailer](https://nodemailer.com/) | Secure SMTP client communicating with Gmail servers |

---

## Project Structure

```
EventCertificateMailer/
├── .env.example          # Safe template for environment variables
├── .gitignore            # Excludes node_modules, .env, OS artifacts
├── package.json          # Node dependencies and execution scripts
├── package-lock.json     # Dependency lockfile
├── server.js             # Express backend and Nodemailer SMTP endpoints
├── index.html            # Main single-page interface layout and modals
├── css/
│   └── style.css         # Dark theme styling, typography controls, and layouts
├── js/
│   └── app.js            # Core application state, canvas rendering, and mail logic
└── README.md             # Project documentation
```

---

## Prerequisites

Before running the application, ensure you have the following installed:

- **Node.js**: v16.0.0 or higher (verify via `node -v`)
- **npm**: v8.0.0 or higher (verify via `npm -v`)
- **Google Account**: An active Gmail or Google Workspace account with **2-Step Verification** enabled.

---

## Installation Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Prajvalinjar/EventCertificateMailer.git
   cd EventCertificateMailer
   ```

2. **Install backend dependencies**:
   ```bash
   npm install
   ```

---

## Environment Variables & Configuration

Create a local `.env` file for server-side defaults by copying the provided example:

```bash
cp .env.example .env
```

The configuration options are:

```ini
# Server Configuration
PORT=3001

# Gmail SMTP Configuration Example
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-official-email@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM_NAME=Event Certificate Team

# Allowed Client Origin (for CORS restriction)
ALLOWED_ORIGIN=http://localhost:3001
```

> **IMPORTANT SECURITY NOTE**: Never commit `.env` or any file containing real passwords to Git. The `.env` pattern is already registered in `.gitignore`.

---

## Gmail SMTP and Google App Password Setup

To send emails through Gmail, **you cannot use your normal Google account password**. Google requires third-party applications to authenticate using an **App Password**.

### Step-by-Step Instructions:

1. **Enable 2-Step Verification**:
   - Go to your [Google Account Security Settings](https://myaccount.google.com/security).
   - Under *"How you sign in to Google"*, select **2-Step Verification** and complete setup if not already enabled.

2. **Generate an App Password**:
   - Navigate to [Google App Passwords](https://myaccount.google.com/apppasswords).
   - Enter an app name (e.g., `EventCertificateMailer`).
   - Click **Create**.
   - Google will display a **16-character passcode** (e.g., `abcd efgh ijkl mnop`).

3. **Configure the Application**:
   - Copy the 16-character code (spaces can be removed or kept).
   - In EventCertificateMailer, click **Setup SMTP** and configure:
     - **SMTP Host**: `smtp.gmail.com`
     - **Port**: `587` (TLS) or `465` (SSL)
     - **Username**: Your full Gmail address (e.g., `your-official-email@gmail.com`)
     - **Password**: The 16-character App Password generated above
     - **From Name**: Your organization or event name (e.g., `Hackathon Organizing Team`)
   - Click **Test Connection** to verify that authentication succeeds before sending.

### Critical Rules for App Passwords:
- The App Password must be generated from the **same Google account** entered in the username field.
- **Never commit your App Password to GitHub.**
- If you suspect your App Password was exposed, visit [Google App Passwords](https://myaccount.google.com/apppasswords) immediately and click the **Delete** (trash can) icon to revoke it.

---

## How to Run the Project

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Open the application**:
   Open your browser and navigate to:
   ```
   http://localhost:3001
   ```
   *(or `http://localhost:3001/index.html`)*

---

## Production Deployment (Render)

EventCertificateMailer is built as a unified service (Node.js/Express backend serving client assets). You can deploy it directly as a single Web Service on **[Render](https://render.com/)**.

### Option A: 1-Click Blueprint Deploy (Recommended)
This repository includes a `render.yaml` file:
1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** ➔ **Blueprint**.
3. Select your repository: `https://github.com/Prajvalinjar/EventCertificateMailer`.
4. Render will read `render.yaml` and prompt you for:
   - `SMTP_USER`: Your Gmail address
   - `SMTP_PASS`: Your 16-character Google App Password
5. Click **Apply**. Render will deploy the application, run health checks at `/health`, and provision an SSL/HTTPS URL.

### Option B: Manual Web Service Setup
1. On [Render](https://dashboard.render.com/), click **New +** ➔ **Web Service**.
2. Connect your GitHub repository: `Prajvalinjar/EventCertificateMailer`.
3. Configure settings:
   - **Name**: `event-certificate-mailer`
   - **Region**: Nearest to your users (e.g. Frankfurt, Oregon, Singapore)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
4. Expand **Environment Variables** and configure:
   | Key | Recommended Value | Notes |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Production optimizations |
   | `SMTP_HOST` | `smtp.gmail.com` | Google SMTP server |
   | `SMTP_PORT` | `587` | Standard TLS port |
   | `SMTP_USER` | `your-email@gmail.com` | Authenticated Gmail address |
   | `SMTP_PASS` | `your-16-char-app-password` | Google App Password (never normal password) |
   | `SMTP_FROM_NAME` | `Event Certificate Team` | Sender name shown in inboxes |
5. Click **Deploy Web Service**. Render assigns a free `https://<service-name>.onrender.com` URL.

---

## How to Use the Application

### 1. Upload Certificate Template
Drag and drop your blank certificate design (PNG, JPG, or WebP) onto the initial canvas drop zone. The canvas automatically scales to match your certificate's native dimensions.

### 2. Import Recipient Data
Upload your participant list (`.xlsx`, `.xls`, or `.csv`) in the **Excel Import** section. 
The spreadsheet should contain at least:
- A name column (e.g., `Name`, `Full Name`, `Participant`)
- An email column (e.g., `Email`, `Recipient Email`)
- Any optional fields (e.g., `Course`, `Role`, `Date`, `Rank`)

### 3. Place Fields on the Canvas
Drag any column chip from the **Column Fields** panel onto the certificate. The field will appear at that exact location. Click on any placed field to select and reposition it.

### 4. Style Typography
With a field selected, use the sidebar to choose:
- Font family (Great Vibes, Cinzel, Playfair Display, Lato, etc.)
- Size (px), color (HEX picker)
- Bold, Italic, alignment (Left, Center, Right)
- Text casing (UPPERCASE, Title Case)
- Drop shadow (offset, blur, color, opacity)

### 5. Inspect and Custom-Tune Rows
Click on any row in the **Preview Table** to preview that participant's certificate. If someone has an unusually long name, enter **Row Edit Mode** to resize or adjust that specific field. These changes are saved as row overrides and will not affect other participants.

### 6. Compose Email
Click **Compose Email** to open the rich-text editor:
- Use placeholders like `{{firstName}}`, `{{name}}`, or custom column tags like `{{event}}`.
- Format your message with bold, italic, underline, or hyperlinks.
- Save templates for recurring use.

### 7. Send or Download
- **Download All as ZIP**: Compresses all customized certificates into a single `.zip` file for offline distribution.
- **Send Certificates by Email**: Sequentially delivers each personalized certificate directly to the recipient's inbox via Gmail SMTP, displaying a live progress and status log.

---

## Security Notes

1. **Zero Hardcoded Secrets**: This repository does not contain hardcoded credentials, API keys, or private tokens. All credentials must be provided via local environment variables or the application interface.
2. **Localhost First**: By default, the server runs locally on `localhost:3001`. Do not expose the server to the public Internet without adding authentication and reverse-proxy rate limiting.
3. **Encrypted Transport**: SMTP communication with Gmail uses standard TLS on port `587` or SSL on port `465`.

---

## Common Issues and Solutions

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| `Error: listen EADDRINUSE :::3001` | Another process is already running on port 3001. | Terminate the existing process via PowerShell: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess -Force` or change `PORT` in `.env`. |
| `Invalid login: 535-5.7.8 Username and Password not accepted` | Using standard account password instead of Google App Password, or typo in email. | Ensure 2-Step Verification is active, generate a new App Password at `myaccount.google.com/apppasswords`, and verify username matches. |
| Certificates render with default font | The Google Font had not finished downloading before generation started. | Allow fonts to load in the preview before starting bulk generation, or click on the font picker to trigger font preloading. |
| Missing recipient emails | Spreadsheet rows contain empty email cells. | The mailer will safely skip rows with empty email addresses and log a warning notice. Ensure your spreadsheet contains a valid `email` column. |

---

## Future Improvements

- [ ] **PDF Export Option**: Generate standard vector-wrapped PDF certificates in addition to PNG.
- [ ] **Explicit Column Mapping Interface**: Add explicit dropdown selectors for Name and Email mapping instead of heuristic detection.
- [ ] **Persistent Delivery History & Resumability**: Store dispatch state in local storage or SQLite to allow resuming interrupted jobs without duplicate sends.
- [ ] **Exportable CSV Delivery Reports**: Download a detailed CSV log of delivery timestamps and SMTP response codes.
- [ ] **Verification QR Codes**: Embed dynamic QR codes linking to an event credential validation endpoint.

---

## License & Attribution

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

### Attribution
EventCertificateMailer is built upon and inspired by the open-source project [WiMailer](https://github.com/devjitpanja/WiMailer) originally created by [Devjit Panja](https://www.linkedin.com/in/devjitpanja/). Enhanced and maintained as EventCertificateMailer for reliable event certificate production and distribution.
