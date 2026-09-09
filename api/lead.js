// /api/lead.js — direct lead capture (works even when the chat model is unreachable)
// Forwards {email, transcript} to the same Google Sheet webhook as the chat bot.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const hookUrl = process.env.LEADS_WEBHOOK_URL;
  if (!hookUrl) {
    console.error('LEADS_WEBHOOK_URL is not set');
    return res.status(500).json({ error: 'not_configured' });
  }
  try {
    const email = String((req.body && req.body.email) || '').trim().slice(0, 200);
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'bad_email' });
    }
    const FREE_MAIL = ['gmail.com','yahoo.com','outlook.com','hotmail.com','aol.com','icloud.com','proton.me','protonmail.com','gmx.com','yandex.com','mail.com','live.com','msn.com','ymail.com'];
    if (FREE_MAIL.includes(email.split('@')[1].toLowerCase())) {
      return res.status(400).json({ error: 'personal_email' });
    }
    const transcript = String((req.body && req.body.transcript) || '').slice(0, 45000);
    await fetch(hookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email, transcript: transcript, ts: new Date().toISOString() })
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('lead endpoint error', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
