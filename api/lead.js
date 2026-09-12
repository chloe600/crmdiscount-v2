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
    const session = String((req.body && req.body.session) || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
    const hook = await fetch(hookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'lead', email: email, transcript: transcript, session: session, source: 'chat_early_save', ts: new Date().toISOString() })
    });
    const hookText = await hook.text().catch(function () { return ''; });
    // Apps Script answers 200 with its own JSON on success; anything else (or an HTML error page) means the row was NOT written
    const accepted = hook.ok && !/<html|exception|error/i.test(hookText.slice(0, 400));
    console.log('lead webhook', hook.status, hookText.slice(0, 200));
    if (!accepted) {
      return res.status(502).json({ error: 'webhook_rejected', status: hook.status, detail: hookText.slice(0, 200) });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('lead endpoint error', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
