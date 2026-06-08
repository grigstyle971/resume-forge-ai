const https = require('https');

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'no key' }) };

  const billText = `ST. MARY'S REGIONAL MEDICAL CENTER - Itemized Statement
Patient: John A. Patient, Account #88291043, DOS: 03/14/2025, ER Visit
Insurance: BlueCross PPO
99285 ER Visit - Level 5 (High Complexity) x1 $2,450.00
99285 ER Visit - Level 5 (High Complexity) x1 $2,450.00
80053 Comprehensive Metabolic Panel x1 $385.00
85025 Complete Blood Count (CBC) x1 $295.00
71046 Chest X-Ray, 2 views x1 $890.00
J1885 Ketorolac injection 30mg x1 $175.00
Q9967 Contrast material x1 $640.00
Ibuprofen 200mg tablet x1 $30.00
Sterile gauze pad x4 $48.00
Facility Fee x1 $1,800.00
TOTAL: $9,153.00
EOB: Billed $9,153, Insurance Paid $3,200, Discount $1,953, Patient Responsibility $4,000`;

  const prompt = `You are a medical billing advocate expert. Analyze the medical bill and identify SPECIFIC, FACTUAL problems.

CRITICAL RULES:
- ONLY report issues verifiable from the actual text. NEVER invent charges, codes, or amounts not present.
- Quote the exact line item. Mark uncertain findings as "POSSIBLE".
- Do not fabricate exact Medicare rates.

Look for: duplicate charges, upcoding (ER levels 99281-99285), routine items billed separately (gauze, single pills), facility fees, services that may not match visit type, balance billing.

Return pure JSON (no markdown):
{"summary":"...","total_billed":"...","patient_responsibility":"...","issues":[{"severity":"high|medium|low","type":"...","line_item":"exact quote","problem":"...","action":"...","potential_savings":"..."}],"estimated_total_savings":"range","next_steps":["..."]}

MEDICAL BILL:
${billText}`;

  const reqBody = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 3000,
    temperature: 0.3,
    messages: [
      { role: 'system', content: 'You are a precise medical billing analyst. Respond only with valid JSON. Never fabricate data.' },
      { role: 'user', content: prompt }
    ]
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY, 'Content-Length': Buffer.byteLength(reqBody) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) { resolve({ statusCode: 500, headers, body: JSON.stringify({ error: parsed.error.message }) }); return; }
          const text = parsed.choices[0].message.content.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
          resolve({ statusCode: 200, headers, body: text });
        } catch (e) { resolve({ statusCode: 500, headers, body: JSON.stringify({ error: e.message, raw: data.substring(0,300) }) }); }
      });
    });
    req.on('error', e => resolve({ statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }));
    req.write(reqBody); req.end();
  });
};
