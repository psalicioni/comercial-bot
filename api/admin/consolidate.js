// api/admin/consolidate.js — Se llama despues de que el navegador termino
// de subir todos los Excel al Blob (a la carpeta 'raw/').
// Los lee, los convierte a JSON, arma un solo 'reports.json' y borra los raw.

import { list, put, del } from '@vercel/blob';
import XLSX from 'xlsx';

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

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return res.status(500).json({ error: 'ADMIN_PASSWORD no configurada' });
  if (req.headers['x-admin-password'] !== adminPassword) {
    return res.status(401).json({ error: 'Password incorrecto' });
  }

  try {
    // Listar los raw uploads
    const { blobs } = await list({ prefix: 'raw/' });
    const files = blobs.filter(b => !b.pathname.endsWith('/'));
    if (files.length === 0) {
      return res.status(400).json({ error: 'No hay archivos para procesar' });
    }

    // Procesar cada uno
    const allReports = [];
    for (const blob of files) {
      const fileRes = await fetch(blob.url);
      const arrayBuf = await fileRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const filename = blob.pathname.replace(/^raw\//, '');
      const sheets = {};
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        const cleanRows = rows.filter(row =>
          Object.values(row).some(v => v !== '' && v !== null && v !== undefined)
        );
        if (cleanRows.length > 0) sheets[sheetName] = cleanRows;
      }
      allReports.push({ filename, sheets });
    }

    // Consolidar
    const consolidated = {
      updatedAt: new Date().toISOString(),
      sources: allReports
    };
    const jsonContent = JSON.stringify(consolidated, null, 2);

    // Guardar como reports.json (sobrescribir el anterior si existia)
    await put('reports.json', jsonContent, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true
    });

    // Borrar los raw uploads (ya no los necesitamos)
    await del(files.map(b => b.url));

    // Armar resumen
    const summary = allReports.map(r => ({
      filename: r.filename,
      sheets: Object.entries(r.sheets).map(([name, rows]) => ({
        name,
        rows: rows.length
      }))
    }));

    return res.status(200).json({
      ok: true,
      summary,
      size: jsonContent.length
    });
  } catch (err) {
    console.error('Consolidate error:', err);
    return res.status(500).json({ error: 'Error consolidando', detail: String(err) });
  }
}
