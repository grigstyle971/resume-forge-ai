const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: ''
    };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { resume, job } = body;
  if (!resume || !job) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing resume or job' }) };
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  const prompt = `You are an expert resume writer and career coach. Generate a tailored resume and cover letter.

USER RESUME/EXPERIENCE:
${resume}

TARGET JOB DESCRIPTION:
${job}

Respond ONLY with valid JSON, no markdown, no code blocks, pure JSON:
{
  "name": "Full name from resume or 'Your Name'",
  "email": "email if found else 'your.email@example.com'",
  "phone": "phone if found else ''",
  "location": "location if found else ''",
  "linkedin": "linkedin if found else ''",
  "title": "Optimized job title matching the target role",
  "summary": "3-4 sentence ATS-optimized professional summary tailored to this job",
  "skills": [{"name": "Skill Name", "level": 85}],
  "experience": [{"title": "Job Title", "company": "Company", "dates": "Date range", "bullets": ["Achievement 1 with metric", "Achievement 2", "Achievement 3"]}],
  "education": [{"degree": "Degree", "school": "School", "year": "Year", "note": "honors if relevant"}],
  "coverLetter": "Full 4-paragraph cover letter mentioning company name and specific role requirements"
}

Rules:
- Rewrite bullets to match job keywords using strong action verbs (Led, Built, Reduced, Increased)
- Quantify achievements with numbers where possible
- Skills level 0-100 integer
- Include 6-10 most relevant skills
- Cover letter must mention company name and specific requirements
- Return ONLY valid JSON`;

  const requestBody = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 4000,
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: 'You are an expert resume writer. Always respond with valid JSON only, no markdown or code blocks.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            resolve({ statusCode: 500, headers, body: JSON.stringify({ error: parsed.error.message }) });
            return;
          }
          const text = parsed.choices?.[0]?.message?.content || '';
          const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const result = JSON.parse(clean);
          resolve({ statusCode: 200, headers, body: JSON.stringify(result) });
        } catch (e) {
          resolve({ statusCode: 500, headers, body: JSON.stringify({ error: 'Parse error: ' + e.message }) });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ statusCode: 500, headers, body: JSON.stringify({ error: e.message }) });
    });
    req.write(requestBody);
    req.end();
  });
};
