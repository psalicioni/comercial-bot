
// api/admin/upload.js — Emite tokens de subida para que el navegador suba
// los Excel DIRECTAMENTE a Vercel Blob (sin pasar por esta función).
// Esto evita el límite de 4.5MB de payload de las funciones serverless.
 
import { handleUpload } from '@vercel/blob/client';
 
export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  if (origin.endsWith('.sharepoint.com') || origin.startsWith('http://localhost') || origin.includes('vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
 
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD no configurada' });
  }
 
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Validar password enviado por el cliente
        let payload;
        try {
          payload = JSON.parse(clientPayload || '{}');
        } catch {
          throw new Error('clientPayload invalido');
        }
        if (payload.password !== adminPassword) {
          throw new Error('Password incorrecto');
        }
        return {
          allowedContentTypes: [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'application/x-excel',
            'text/csv',
            'application/csv',
            'application/octet-stream'
          ],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB por archivo
          addRandomSuffix: false,
          allowOverwrite: true,
          tokenPayload: JSON.stringify({ uploadedAt: new Date().toISOString() })
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Se ejecuta despues de que el navegador termino la subida.
        // No hacemos nada aca porque el navegador va a llamar a /consolidate
        // manualmente cuando todos los archivos terminen.
        console.log('Upload OK:', blob.pathname);
      }
    });
 
    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('handleUpload error:', err);
    return res.status(400).json({ error: err.message || 'Error generando token' });
  }
}
 
