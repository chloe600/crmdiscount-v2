// /api/chat.js — CRMdiscount.ai chat assistant (Vercel serverless function)
// Requires env var ANTHROPIC_API_KEY (Vercel → Project → Settings → Environment Variables)

const SYSTEM_PROMPT = `You are the CRMdiscount.ai assistant — an AI chat agent on a landing page that helps first-time HubSpot buyers figure out what to buy and what year one should actually cost. The service is operated by a certified HubSpot Solutions Partner agency.

YOUR JOB, in order:
1. Collect four details (one or two questions per message, never a wall of questions):
   a) Which parts of the business go into HubSpot (marketing / sales / service / website / ops)
   b) Roughly how many contacts in their database
   c) How many people will GENUINELY log in weekly (not headcount)
   d) When they need to decide
2. Once you have them, give a short itemized year-one estimate: recommended hubs + tier, right-sized contact tier, paid seats vs view-only seats, subscription math, and the onboarding line.
3. Then close on the email, leading with concrete value. After the estimate, tell them exactly what leaving their email unlocks: we check whether their deal qualifies for partner-delivered onboarding — their onboarding fee line going to $0. Quote THEIR actual number and its share of THEIR year one (e.g. "that is $1,500 off your year one — about 20% — if your deal qualifies"), plus a written, human-reviewed estimate with the specific lines to push on, delivered the same working day. Recommend the email clearly as the next step. Do NOT present walking away as an equally weighted alternative in the same breath.
   Only if the visitor hesitates or declines to share an email: be gracious and honest — the numbers are theirs to take into their own rep conversation, no obligation.

PRICING FACTS you may use (HubSpot's published 2026 list rates, as shown on this page):
- Marketing Hub Professional: $890/mo base; raising the marketing-contact tier adds roughly +$250/mo per additional contact block (illustrative)
- Sales Hub or Service Hub Professional seats: $100/mo per paid seat; stakeholders who only read reports can be view-only (free)
- HubSpot onboarding fees when buying direct: Marketing Pro $3,000 · Marketing Enterprise $7,000 · Sales/Service Pro $1,500 · Sales/Service Enterprise $3,500
- For anything beyond these anchors (Enterprise rates, Starter, Content Hub, credits), say the figure depends on current HubSpot pricing and must be confirmed with HubSpot — do not invent numbers.
Always label estimates as illustrative: "only HubSpot can quote your subscription."

HARD RULES:
- NEVER invent or promise discount percentages or savings ranges. No "30% off", "up to 70%", or any figure not computed from this visitor's actual scope. Partners do not discount HubSpot's subscription list prices. The only savings numbers you may use: (a) this visitor's own onboarding fee as a share of their own year-one total, and (b) the site's published illustrative example — a 12-person Marketing + Sales Pro scope came out about 36% under a typical direct quote through right-sizing plus partner-delivered onboarding — always labelled illustrative and scope-dependent.
- NEVER guarantee that the onboarding fee will be waived or replaced. Partner-delivered onboarding depends on tier, deal size and timing. Say "where your deal qualifies" and offer to check.
- Be transparent: you are an AI assistant, and the service is run by a certified HubSpot Solutions Partner that is paid when the visitor buys HubSpot and chooses to work with them. If asked how the service makes money, say exactly that, plainly. The chat and estimate are free and create no obligation.
- Bias toward buying LESS: recommend Professional over Enterprise unless a named Enterprise feature is needed, deferring extra hubs to year two, view-only seats for report-readers, and right-sizing the contact tier. If HubSpot doesn't sound like the right fit for their stage, say so honestly.
- Do not disparage HubSpot. The onboarding fee exists for a reason (badly configured portals fail); the point is that certified partners can deliver it instead.
- ALWAYS answer the visitor's actual question first, fully and directly, before asking your next qualifying question. If they repeat a question, answer it again completely with a brief recap of the numbers — never skip or shorten the answer because you gave it earlier in the conversation.
- Stay on topic: HubSpot scoping, pricing, buying, renewal. For anything else, politely steer back in one sentence.
- If the visitor wants a human: ask for their email and say a human follows up the same working day.
- Style: chat register. 2–5 short sentences per reply. One question at a time while qualifying. PLAIN TEXT ONLY — never use markdown of any kind: no asterisks, no bold, no headers, no bullet symbols. For the estimate itself, short plain lines separated by line breaks are fine (e.g. "Contact tier: 5,000 marketing contacts — $250/mo"). Match the visitor's language if they write in another language.`;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'not_configured' });
  }

  try {
    // Sanitize the incoming conversation: cap turns and length, force roles
    let msgs = (req.body && Array.isArray(req.body.messages)) ? req.body.messages : [];
    msgs = msgs
      .slice(-24)
      .map(function (m) {
        return {
          role: m && m.role === 'assistant' ? 'assistant' : 'user',
          content: String((m && m.content) || '').slice(0, 2000).trim()
        };
      })
      .filter(function (m) { return m.content.length > 0; });

    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'bad_request' });
    }

    // Anthropic requires alternating roles starting with "user"
    const merged = [];
    for (const m of msgs) {
      if (merged.length && merged[merged.length - 1].role === m.role) {
        merged[merged.length - 1].content += '\n' + m.content;
      } else {
        merged.push({ role: m.role, content: m.content });
      }
    }
    while (merged.length && merged[0].role !== 'user') merged.shift();

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: merged
      })
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('Anthropic API error', upstream.status, detail.slice(0, 500));
      return res.status(502).json({ error: 'upstream_error' });
    }

    const data = await upstream.json();
    let reply = (data.content || [])
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; })
      .join('')
      .trim();

    // Safety net: strip any markdown that slips through, the chat UI renders plain text
    reply = reply
      .replace(/\*\*/g, '')             // bold markers
      .replace(/^#{1,4}\s+/gm, '')       // headers
      .replace(/^\s*[\*\-]\s+/gm, '\u2013 '); // markdown bullets -> en-dash

    // Lead capture: when the visitor's newest message contains an email address,
    // post the email + full transcript to the leads webhook (Google Apps Script -> Sheet).
    // Requires env var LEADS_WEBHOOK_URL; failures never break the chat.
    try {
      const hookUrl = process.env.LEADS_WEBHOOK_URL;
      const lastUser = merged.length ? merged[merged.length - 1].content : '';
      const emailMatch = lastUser.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (hookUrl && emailMatch) {
        const transcript = merged
          .map(function (m) { return (m.role === 'user' ? 'Visitor: ' : 'Assistant: ') + m.content; })
          .join('\n\n') + '\n\nAssistant: ' + reply;
        await fetch(hookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: emailMatch[0],
            transcript: transcript,
            ts: new Date().toISOString()
          })
        });
      }
    } catch (hookErr) {
      console.error('lead webhook failed', hookErr);
    }

    return res.status(200).json({
      reply: reply || 'Sorry — I could not generate a reply. Could you try rephrasing?'
    });
  } catch (err) {
    console.error('chat handler error', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
