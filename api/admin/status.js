// api/admin/status.js — Devuelve metadata del reporte actualmente cargado.

import { list } from '@vercel/blob';

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (origin.endsWith('.sharepoint.com') || origin.startsWith('http://localhost') || origin.includes('vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD no configurada' });
  }
  if (req.headers['x-admin-password'] !== adminPassword) {
    return res.status(401).json({ error: 'Password incorrecto' });
  }

  try {
    const { blobs } = await list({ prefix: 'reports.json' });
    const blob = blobs.find(b => b.pathname === 'reports.json');
    if (!blob) {
      return res.status(200).json({ loaded: false });
    }

    // Bajamos el JSON para extraer metadata
    const r = await fetch(blob.url);
    const data = await r.json();

    return res.status(200).json({
      loaded: true,
      updatedAt: data.updatedAt,
      sources: (data.sources || []).map(s => ({
        filename: s.filename,
        sheets: Object.entries(s.sheets || {}).map(([name, rows]) => ({
          name,
          rows: rows.length
        }))
      })),
      size: blob.size,
      uploadedAt: blob.uploadedAt
    });
  } catch (err) {
    console.error('Status error:', err);
    return res.status(500).json({ error: 'Error consultando el reporte', detail: String(err) });
  }
}
