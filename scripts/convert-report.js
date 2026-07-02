// scripts/convert-report.js
// Convierte uno o más archivos Excel (.xlsx) o CSV a JSON limpio.
// Uso: node scripts/convert-report.js <archivo1.xlsx> [archivo2.xlsx] ...
// Salida: un .json por cada Excel en /data, listo para que la función lo lea.

import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: node scripts/convert-report.js <archivo.xlsx> [...]');
  console.error('Ejemplo: node scripts/convert-report.js ./ventas-tango.xlsx ./powerbi-export.xlsx');
  process.exit(1);
}

const outputDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

for (const inputPath of args) {
  if (!fs.existsSync(inputPath)) {
    console.error(`✗ No existe: ${inputPath}`);
    continue;
  }

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${baseName}.json`);

  console.log(`→ Procesando ${inputPath}...`);

  const workbook = XLSX.readFile(inputPath, { cellDates: true });
  const result = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    // defval: '' deja celdas vacías como string vacío (en lugar de undefined).
    // raw: false formatea fechas y números a string legible.
    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      raw: false
    });

    // Filtro filas completamente vacías (típicas de exports de Tango).
    const cleanRows = rows.filter(row =>
      Object.values(row).some(v => v !== '' && v !== null && v !== undefined)
    );

    if (cleanRows.length > 0) {
      result[sheetName] = cleanRows;
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

  const totalRows = Object.values(result).reduce((sum, rows) => sum + rows.length, 0);
  const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(1);
  console.log(`✓ ${outputPath} — ${Object.keys(result).length} hoja(s), ${totalRows} filas, ${sizeKB} KB`);
}

console.log('\nListo. Hacé "vercel --prod" para redeployar con los datos nuevos.');
