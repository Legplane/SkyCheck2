import nodemailer from 'nodemailer';

function cleanSecret(value: string | undefined): string | undefined {
  const cleaned = value?.trim().replace(/\s+/g, '');
  return cleaned || undefined;
}

function smtpUser(): string | undefined {
  return process.env.SMTP_USER?.trim() || process.env.EMAIL_USER?.trim() || undefined;
}

function smtpPass(): string | undefined {
  return cleanSecret(process.env.SMTP_PASS) || cleanSecret(process.env.EMAIL_PASS);
}

export function getEmailConfigStatus() {
  const host = process.env.SMTP_HOST?.trim();
  const user = smtpUser();
  const pass = smtpPass();

  return {
    configured: Boolean(user && pass),
    provider: host ? 'smtp' : 'gmail',
    hasUser: Boolean(user),
    hasPassword: Boolean(pass),
    from: process.env.EMAIL_FROM?.trim() || process.env.EMAIL_USER?.trim() || '',
    frontendUrl: frontendUrl(),
  };
}

function frontendUrl(): string {
  return (
    process.env.FRONTEND_URL?.trim()
    || process.env.CLIENT_URL?.trim()
    || process.env.APP_URL?.trim()
    || 'http://localhost:5173'
  ).replace(/\/+$/, '');
}

function getTransporter() {
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPort = Number(process.env.SMTP_PORT?.trim() || '587');
  const smtpSecure = (process.env.SMTP_SECURE?.trim().toLowerCase() || 'false') === 'true';
  const user = smtpUser();
  const pass = smtpPass();

  if (smtpHost && user && pass) {
    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 20_000,
    });
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  });
}

function emailBase(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(180deg,#1A56C4 0%,#0D2F6E 100%);padding:28px 32px;text-align:center;">
          <div style="font-size:32px;margin-bottom:8px;">☁️</div>
          <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">SkyCheck</h1>
          <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px;">Smart Weather & Transit</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="color:#111827;margin:0 0 16px;font-size:20px;">${title}</h2>
          ${body}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">
            This email was sent by SkyCheck — Code-B · BSCS-2C · Gordon College<br>
            If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
  const link    = `${frontendUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  const fromEmail = process.env.EMAIL_FROM?.trim() || process.env.EMAIL_USER;
  const status = getEmailConfigStatus();
  if (!status.configured) throw new Error('[Email] Missing EMAIL_USER/EMAIL_PASS or SMTP credentials.');

  const body = `
    <p style="color:#374151;font-size:15px;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    <p style="color:#374151;font-size:15px;line-height:1.6;">
      Click the button below to verify your SkyCheck account and start checking your commute risk.
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${link}" style="display:inline-block;background:#1A56C4;color:white;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
        Verify My Email
      </a>
    </div>
    <p style="color:#6b7280;font-size:13px;">
      This link expires in <strong>24 hours</strong>. If the button doesn't work, copy this URL:<br>
      <a href="${link}" style="color:#1A56C4;word-break:break-all;">${link}</a>
    </p>
  `;

  await getTransporter().sendMail({
    from:    `"SkyCheck" <${fromEmail}>`,
    to,
    subject: 'Verify your SkyCheck account',
    html:    emailBase('Verify Your Email', body),
  });
  console.info(`[Email] Verification email sent to ${to} via ${status.provider}.`);
}

export async function sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
  const link    = `${frontendUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;
  const fromEmail = process.env.EMAIL_FROM?.trim() || process.env.EMAIL_USER;
  const status = getEmailConfigStatus();
  if (!status.configured) throw new Error('[Email] Missing EMAIL_USER/EMAIL_PASS or SMTP credentials.');

  const body = `
    <p style="color:#374151;font-size:15px;line-height:1.6;">Hi <strong>${name}</strong>,</p>
    <p style="color:#374151;font-size:15px;line-height:1.6;">
      We received a request to reset your SkyCheck password. Click the button below to set a new password.
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${link}" style="display:inline-block;background:#1A56C4;color:white;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">
        Reset My Password
      </a>
    </div>
    <p style="color:#6b7280;font-size:13px;">
      This link expires in <strong>1 hour</strong> and can only be used once.<br>
      If you didn't request this, your account is safe — just ignore this email.
    </p>
  `;

  await getTransporter().sendMail({
    from:    `"SkyCheck" <${fromEmail}>`,
    to,
    subject: 'Reset your SkyCheck password',
    html:    emailBase('Password Reset Request', body),
  });
  console.info(`[Email] Password reset email sent to ${to} via ${status.provider}.`);
}
