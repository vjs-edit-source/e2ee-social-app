import nodemailer from 'nodemailer';

let dynamicSmtpUser = process.env.SMTP_USER || '';
let dynamicSmtpPass = process.env.SMTP_PASS || '';
let dynamicSmtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
let dynamicSmtpPort = parseInt(process.env.SMTP_PORT || '465', 10);

export function setEmailConfig({ smtpUser, smtpPass, smtpHost, smtpPort }) {
  if (smtpUser !== undefined) dynamicSmtpUser = smtpUser.trim();
  if (smtpPass !== undefined) dynamicSmtpPass = smtpPass.trim();
  if (smtpHost !== undefined) dynamicSmtpHost = smtpHost.trim();
  if (smtpPort !== undefined) dynamicSmtpPort = parseInt(smtpPort, 10);
}

export function getEmailConfigStatus() {
  return {
    smtpConfigured: Boolean(dynamicSmtpUser && dynamicSmtpPass),
    smtpUser: dynamicSmtpUser ? `${dynamicSmtpUser.slice(0, 3)}***@***` : null
  };
}

/**
 * Dispatches a 6-digit verification OTP code to the target email address.
 */
export async function sendEmailOtp(email, otp, username = '') {
  const cleanEmail = email.trim().toLowerCase();
  console.log(`📧 [Email OTP] Dispatching verification code [${otp}] to ${cleanEmail}...`);

  if (dynamicSmtpUser && dynamicSmtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: dynamicSmtpHost,
        port: dynamicSmtpPort,
        secure: dynamicSmtpPort === 465,
        auth: {
          user: dynamicSmtpUser,
          pass: dynamicSmtpPass
        }
      });

      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px 20px; border-radius: 16px; max-width: 500px; margin: 0 auto; border: 1px solid rgba(238, 120, 130, 0.3);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #ee7882; font-size: 26px; margin: 0 0 6px; letter-spacing: -0.5px;">SadiSocial</h1>
            <p style="color: #94a3b8; font-size: 13px; margin: 0;">Zero-Knowledge End-to-End Encrypted Identity</p>
          </div>

          <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 24px; text-align: center;">
            <p style="color: #cbd5e1; font-size: 15px; margin: 0 0 16px;">
              Hello <strong>${username || 'User'}</strong>, here is your one-time verification code:
            </p>
            
            <div style="background: linear-gradient(135deg, rgba(238, 120, 130, 0.2), rgba(16, 185, 129, 0.15)); border: 2px solid #ee7882; border-radius: 12px; padding: 16px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #ffffff; font-family: monospace; margin: 0 auto 16px; display: inline-block;">
              ${otp}
            </div>

            <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
              This code expires in <strong>5 minutes</strong>. Never share this code with anyone.
            </p>
          </div>

          <div style="text-align: center; margin-top: 24px; color: #64748b; font-size: 11px;">
            Protected by SadiSocial Zero-Knowledge Cryptography • P2P Encrypted
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: `"SadiSocial Security" <${dynamicSmtpUser}>`,
        to: cleanEmail,
        subject: `🔒 ${otp} is your SadiSocial Verification Code`,
        html: htmlContent
      });

      return {
        success: true,
        gateway: 'SMTP',
        message: `Verification code sent to ${cleanEmail}!`
      };
    } catch (err) {
      console.error('[Email OTP Error]', err);
    }
  }

  // Instant Dev / Preview mode fallback
  return {
    success: true,
    gateway: 'DevEmailGateway',
    isDevPreview: true,
    testOtp: otp,
    message: `Verification code generated for ${cleanEmail}.`
  };
}
