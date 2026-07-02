// api/chat.js — Función serverless que recibe preguntas del HTML, lee los reportes
// desde Vercel Blob, los manda como contexto a Gemini y devuelve la respuesta.

import { list } from '@vercel/blob';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const REPORT_BLOB_NAME = 'reports.json';
const CACHE_TTL_MS = 60_000; // 1 minuto

// Cache simple en memoria. Se rearma cuando la función vuelve a arrancar en frío,
// o cuando pasa el TTL.
let cache = { data: null, fetchedAt: 0 };

async function loadReports() {
  const now = Date.now();
  if (cache.data && (now - cache.fetchedAt) < CACHE_TTL_MS) {
    return cache.data;
  }
  try {
    const { blobs } = await list({ prefix: REPORT_BLOB_NAME });
    const blob = blobs.find(b => b.pathname === REPORT_BLOB_NAME);
    if (!blob) {
      cache = { data: '(Sin reportes cargados. Subí los Excel desde /admin.html)', fetchedAt: now };
      return cache.data;
    }
    const res = await fetch(blob.url);
    const text = await res.text();
    cache = { data: text, fetchedAt: now };
    return text;
  } catch (err) {
    console.error('Error cargando reportes desde Blob:', err);
    return '(Error cargando reportes)';
  }
}

function buildSystemPrompt(reportData) {
  return `Sos un asistente comercial interno de la empresa. Tu rol es responder preguntas sobre los datos de venta disponibles en los reportes adjuntos abajo.

REGLAS:
- Respondé en español, conciso y directo. Sin saludos largos ni cierres.
- Si una pregunta se puede responder con los datos, hacelo y mostrá los números puntuales.
- Si no tenés el dato, decilo claramente. No inventes.
- Cuando hagas cálculos (totales, comparaciones, porcentajes), mostrá brevemente cómo los obtuviste.
- Si el usuario pide algo ambiguo (ej: "ventas del mes"), aclará a qué período te referís según los datos.
- Formato: usá listas o tablas markdown solo cuando ayuden a la claridad.

DATOS DISPONIBLES:

${reportData}
`;
}

// CORS
function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (origin.endsWith('.sharepoint.com') || origin.startsWith('http://localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });
  }

  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages debe ser un array no vacío' });
    }

    const reportData = await loadReports();
    const systemPrompt = buildSystemPrompt(reportData);

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const body = {
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
    };

    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      return res.status(502).json({ error: `Gemini API error: ${geminiRes.status}` });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      return res.status(502).json({ error: 'Respuesta vacía de Gemini' });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Error interno', detail: String(err) });
  }
}
