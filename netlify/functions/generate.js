const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
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

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  const prompt = `You are an expert resume writer and career coach. Generate a tailored resume and cover letter based on the user's experience and the target job.

USER'S RESUME/EXPERIENCE:
${resume}

TARGET JOB DESCRIPTION:
${job}

Generate a response in this EXACT JSON format (no markdown, no code blocks, pure JSON only):
{
  "name": "Full name extracted from resume or 'Your Name' if not found",
  "email": "email if found else 'your.email@example.com'",
  "phone": "phone if found else ''",
  "location": "location if found else ''",
  "linkedin": "linkedin if found else ''",
  "title": "Optimized professional title matching the target role",
  "summary": "3-4 sentence ATS-optimized professional summary tailored to this specific job",
  "skills": [{"name": "Skill Name", "level": 85}],
  "experience": [{"title": "Job Title", "company": "Company Name", "dates": "Month Year – Month Year", "bullets": ["Strong action verb + achievement with metric", "Another achievement", "Third achievement"]}],
  "education": [{"degree": "Degree Name", "school": "School Name", "year": "Year", "note": "GPA or honors if relevant"}],
  "coverLetter": "Full 4-paragraph cover letter. Paragraph 1: Hook + why this company. Paragraph 2: Top 2-3 relevant experiences matching job requirements. Paragraph 3: Why you specifically fit this role. Paragraph 4: Call to action closing. Make it personal, professional, and reference the specific company/role."
}

IMPORTANT RULES:
- Rewrite ALL experience bullets to be highly relevant to the target job
- Use strong action verbs: Led, Built, Engineered, Reduced, Increased, Delivered, etc.
- Include specific keywords from the job description throughout the resume
- Quantify achievements wherever possible (percentages, numbers, team sizes)
- Skills level is 0-100 integer (percentage bar width)
- Include 6-10 most relevant skills only
- Cover letter MUST mention the company name and specific role
- Return ONLY valid JSON, nothing else`;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
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
          const text = (parsed.content || []).map(b => b.text || '').join('');
          // Clean and parse JSON from response
          const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const result = JSON.parse(clean);
          resolve({ statusCode: 200, headers, body: JSON.stringify(result) });
        } catch (e) {
          resolve({ statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to parse AI response', raw: data.substring(0, 500) }) });
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
