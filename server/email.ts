import nodemailer from "nodemailer";

const ADMIN_EMAIL = "claimsignal1@gmail.com";
const APP_NAME = "ClaimSignal";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || ADMIN_EMAIL,
    pass: process.env.SMTP_PASS || "",
  },
});

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<void> {
  if (!process.env.SMTP_PASS) {
    console.warn("[email] SMTP_PASS not set — skipping email send");
    return;
  }
  await transporter.sendMail({
    from: `"${APP_NAME}" <${ADMIN_EMAIL}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

export async function sendFounderInvitationEmail(opts: {
  to: string;
  fullName: string;
  companyName: string;
  setupToken: string;
  expiresAt: Date;
}): Promise<void> {
  const appUrl = process.env.APP_URL || `https://claimsignal1.com`;
  const setupUrl = `${appUrl}/founder-access?token=${opts.setupToken}`;
  const expiresDate = opts.expiresAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your ClaimSignal Founder Access is Approved</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 32px 24px; }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo h1 { color: #f59e0b; font-size: 24px; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; }
    .heading { font-size: 20px; font-weight: 600; color: #f8fafc; margin: 0 0 16px; }
    .subheading { color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    .cta { display: inline-block; background: #f59e0b; color: #0f172a; text-decoration: none; font-weight: 600; padding: 14px 28px; border-radius: 8px; margin: 16px 0; font-size: 15px; }
    .cta:hover { background: #fbbf24; }
    .footer { text-align: center; color: #64748b; font-size: 12px; margin-top: 32px; }
    .footer a { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>CLAIMSIGNAL</h1>
    </div>
    <div class="card">
      <p class="heading">Welcome, ${opts.fullName}</p>
      <p class="subheading">
        Your Founding Partner application has been <strong>approved</strong>. You now have access to ClaimSignal at a lifetime locked rate of $79/month with a 14-day free trial.
      </p>
      <p class="subheading" style="text-align: center;">
        <a href="${setupUrl}" class="cta">Set Up Your Account</a>
      </p>
      <p class="subheading" style="font-size: 13px; margin-top: 16px;">
        <strong>Important:</strong> This link expires on <strong>${expiresDate}</strong> and is limited to one use. Click the button above to create your password and activate your account.
      </p>
      <p class="subheading" style="font-size: 13px; margin-top: 16px;">
        If you have any questions, reply to this email or contact us at <a href="mailto:${ADMIN_EMAIL}" style="color: #94a3b8;">${ADMIN_EMAIL}</a>.
      </p>
    </div>
    <div class="footer">
      <p>ClaimSignal — Operational Intelligence Platform</p>
    </div>
  </div>
</body>
</html>
`;

  const text = `
Welcome to ClaimSignal, ${opts.fullName}!

Your Founding Partner application has been approved.
You now have access to ClaimSignal at a lifetime locked rate of $79/month with a 14-day free trial.

Set up your account here:
${setupUrl}

This link expires on ${expiresDate} and is limited to one use.

Questions? Reply to this email or contact us at ${ADMIN_EMAIL}.

— ClaimSignal
`;

  await sendEmail({
    to: opts.to,
    subject: `Your ClaimSignal Founder Access is Approved — Set Up Your Account`,
    html,
    text,
  });
}

export async function sendAdminNotificationEmail(opts: {
  subject: string;
  body: string;
}): Promise<void> {
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: opts.subject,
    text: opts.body,
  });
}
