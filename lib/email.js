// Transactional email via Resend's HTTP API (https://resend.com) — a
// single fetch, no SDK dependency. If RESEND_API_KEY isn't set (local
// dev, or before it's configured in production), the code is logged to
// the server console instead of failing the request, so signup/email
// change flows stay usable while wiring up a real provider.

const RESEND_URL = "https://api.resend.com/emails";

export async function sendEmail({ to, subject, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Splitline <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[email:dev-fallback] To: ${to}\nSubject: ${subject}\n\n${text}`);
    return { delivered: false, devFallback: true };
  }

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Email send failed (${res.status}): ${await res.text()}`);
  }
  return { delivered: true, devFallback: false };
}

export function verificationEmailText(code, { purpose, newEmail } = {}) {
  if (purpose === "change_email") {
    return (
      `Your Splitline verification code is ${code}.\n\n` +
      `Enter this code to confirm ${newEmail} as your new email address. ` +
      `It expires in 10 minutes. If you didn't request this change, you can ignore this email.`
    );
  }
  return (
    `Your Splitline verification code is ${code}.\n\n` +
    `Enter this code to confirm your email address. It expires in 10 minutes. ` +
    `If you didn't create a Splitline account, you can ignore this email.`
  );
}
