// api/admin/upload.js — Recibe archivos Excel/CSV desde la página de admin,
// los procesa y los guarda como un único reports.json en Vercel Blob.

import { put } from '@vercel/blob';
import XLSX from 'xlsx';

// Vercel necesita esto para que el body llegue como buffer sin parsear.
export const config = {
  api: { bodyParser: false }
};

// Lee el stream del request a un buffer.
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Parser muy básico de multipart/form-data sin libs externas.
// Soporta múltiples archivos en el campo "files" y un campo "filenames" en JSON.
function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;
  while (start < buffer.length) {
    const idx = buffer.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    const next = buffer.indexOf(boundaryBuf, idx + boundaryBuf.length);
    if (next === -1) break;
    const partBuf = buffer.subarray(idx + boundaryBuf.length, next);
    // Quito \r\n inicial
    const partTrimmed = partBuf.subarray(2);
    // Split headers/body por \r\n\r\n
    const headerEnd = partTrimmed.indexOf('\r\n\r\n');
    if (headerEnd === -1) { start = next; continue; }
    const headersStr = partTrimmed.subarray(0, headerEnd).toString('utf8');
    const body = partTrimmed.subarray(headerEnd + 4, partTrimmed.length - 2); // -2 quita \r\n final

    const nameMatch = headersStr.match(/name="([^"]+)"/);
    const filenameMatch = headersStr.match(/filename="([^"]+)"/);
    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch ? filenameMatch[1] : null,
        data: body
      });
    }
    start = next;
  }
  return parts;
}

// Convierte un buffer Excel/CSV a un objeto JSON limpio.
function excelBufferToJson(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const result = {};
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    const cleanRows = rows.filter(row =>
      Object.values(row).some(v => v !== '' && v !== null && v !== undefined)
    );
    if (cleanRows.length > 0) {
      result[sheetName] = cleanRows;
    }
  }
  return { filename, sheets: result };
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  if (origin.endsWith('.sharepoint.com') || origin.startsWith('http://localhost') || origin.includes('vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Validación de password
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD no configurada en Vercel' });
  }
  if (req.headers['x-admin-password'] !== adminPassword) {
    return res.status(401).json({ error: 'Password incorrecto' });
  }

  try {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) {
      return res.status(400).json({ error: 'Content-Type debe ser multipart/form-data' });
    }
    const boundary = boundaryMatch[1];
    const body = await readBody(req);
    const parts = parseMultipart(body, boundary);
    const fileParts = parts.filter(p => p.filename && p.data.length > 0);

    if (fileParts.length === 0) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    // Procesamos cada archivo
    const allReports = fileParts.map(p => excelBufferToJson(p.data, p.filename));

    // Armamos un solo JSON consolidado
    const consolidated = {
      updatedAt: new Date().toISOString(),
      sources: allReports
    };

    const jsonContent = JSON.stringify(consolidated, null, 2);

    // Guardamos en Vercel Blob
    const blob = await put('reports.json', jsonContent, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true
    });

    // Calcular un resumen para devolver al frontend
    const summary = allReports.map(r => ({
      filename: r.filename,
      sheets: Object.entries(r.sheets).map(([name, rows]) => ({
        name,
        rows: rows.length
      }))
    }));

    return res.status(200).json({
      ok: true,
      url: blob.url,
      size: jsonContent.length,
      summary
    });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Error procesando los archivos', detail: String(err) });
  }
}
