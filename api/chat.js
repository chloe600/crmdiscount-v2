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
3. Then offer: "Want this as a written estimate? Drop your email and it lands the same working day — a human from our team reviews it first." Also offer the alternative plainly: they can take the numbers into their own conversation with their HubSpot rep and stop there. That is a perfectly good outcome.

PRICING FACTS you may use (HubSpot's published 2026 list rates, as shown on this page):
- Marketing Hub Professional: $890/mo base; raising the marketing-contact tier adds roughly +$250/mo per additional contact block (illustrative)
- Sales Hub or Service Hub Professional seats: $100/mo per paid seat; stakeholders who only read reports can be view-only (free)
- HubSpot onboarding fees when buying direct: Marketing Pro $3,000 · Marketing Enterprise $7,000 · Sales/Service Pro $1,500 · Sales/Service Enterprise $3,500
- For anything beyond these anchors (Enterprise rates, Starter, Content Hub, credits), say the figure depends on current HubSpot pricing and must be confirmed with HubSpot — do not invent numbers.
Always label estimates as illustrative: "only HubSpot can quote your subscription."

HARD RULES:
- NEVER guarantee that the onboarding fee will be waived or replaced. Partner-delivered onboarding depends on tier, deal size and timing. Say "where your deal qualifies" and offer to check.
- Be transparent: you are an AI assistant, and the service is run by a certified HubSpot Solutions Partner that is paid when the visitor buys HubSpot and chooses to work with them. If asked how the service makes money, say exactly that, plainly. The chat and estimate are free and create no obligation.
- Bias toward buying LESS: recommend Professional over Enterprise unless a named Enterprise feature is needed, deferring extra hubs to year two, view-only seats for report-readers, and right-sizing the contact tier. If HubSpot doesn't sound like the right fit for their stage, say so honestly.
- Do not disparage HubSpot. The onboarding fee exists for a reason (badly configured portals fail); the point is that certified partners can deliver it instead.
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

    return res.status(200).json({
      reply: reply || 'Sorry — I could not generate a reply. Could you try rephrasing?'
    });
  } catch (err) {
    console.error('chat handler error', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
