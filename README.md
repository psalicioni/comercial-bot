# Bot Comercial

Bot interno que responde preguntas sobre reportes de venta (Tango, Power BI exports). Los reportes se cargan desde una página web protegida con contraseña — no hace falta CLI ni redeployar para actualizarlos.

**Arquitectura:**
```
[Usuarios] → SharePoint (index.html) → Vercel (/api/chat) → Gemini API
                                              ↑
              [Vos] → admin.html  →  Vercel (/api/admin/*) → Vercel Blob
```

---

## Setup inicial (una sola vez)

### 1. Obtener API key de Gemini

1. Andá a https://aistudio.google.com/
2. Iniciá sesión con tu cuenta de Google
3. Click en "Get API key" → "Create API key"
4. Copiá la clave (empieza con `AIza...`)

### 2. Instalar dependencias

Descomprimí el ZIP y desde la terminal:

```bash
cd comercial-bot
npm install
```

### 3. Crear el proyecto en Vercel

```bash
npm install -g vercel    # si no la tenés
vercel
```

Aceptá los defaults. Te va a dar una URL tipo `https://comercial-bot-xyz.vercel.app`. **Guardala.**

### 4. Crear un Blob Store

Andá al dashboard de Vercel → tu proyecto → tab **Storage** → **Create Database** → **Blob**.

Esto crea el storage y agrega automáticamente la variable `BLOB_READ_WRITE_TOKEN` al proyecto.

### 5. Configurar las variables de entorno

Desde el dashboard de Vercel → tu proyecto → **Settings** → **Environment Variables**, agregá:

| Variable | Valor | Para qué sirve |
|---|---|---|
| `GEMINI_API_KEY` | Tu clave de Google AI Studio | Llamar a Gemini |
| `ADMIN_PASSWORD` | Una contraseña fuerte (inventala vos) | Proteger /admin.html |

(`BLOB_READ_WRITE_TOKEN` ya debería estar; lo agrega Vercel solo cuando creás el Blob store.)

### 6. Deploy final

```bash
vercel --prod
```

### 7. Cargar los primeros reportes

1. Abrí en el navegador: `https://TU-PROYECTO.vercel.app/admin.html`
2. Ingresá la contraseña que configuraste en `ADMIN_PASSWORD`
3. Arrastrá los Excel de Tango y Power BI a la zona de carga
4. Click "Subir y reemplazar reportes"

Listo, el bot ya tiene los datos.

### 8. Configurar el HTML del chat y subirlo a SharePoint

Abrí `index.html` y editá esta línea (cerca del final):

```javascript
const API_URL = 'https://TU-PROYECTO.vercel.app/api/chat';
```

Reemplazá con tu URL real. Después subí `index.html` a SharePoint, en la carpeta donde quieras compartirlo con el equipo (igual que el bot de tu compañero).

---

## Cómo actualizar los reportes (lo vas a hacer seguido)

**El flujo entero, dos minutos:**

1. Bajá los nuevos exports de Tango y Power BI
2. Abrí `https://TU-PROYECTO.vercel.app/admin.html` (guardala en favoritos)
3. La sesión queda guardada en el navegador, no hace falta loguear de nuevo
4. Arrastrá los Excel nuevos
5. Click "Subir y reemplazar reportes"

**No hace falta:** terminal, scripts, redeploy, ni avisar a nadie. El bot empieza a usar los datos nuevos en menos de un minuto (hay un caché de 60 segundos).

---

## URLs del proyecto

Una vez deployado, vas a tener:

| URL | Para qué |
|---|---|
| `https://TU-PROYECTO.vercel.app/` | El bot (también accesible desde SharePoint) |
| `https://TU-PROYECTO.vercel.app/admin.html` | Página de administración (solo vos) |
| `https://TU-PROYECTO.vercel.app/api/chat` | Endpoint del bot (no se accede directo) |

---

## Costos esperados

| Componente | Costo |
|---|---|
| Vercel Hobby | $0 (pero ver nota abajo) |
| Vercel Blob | $0 (1GB free, vas a usar <1MB) |
| Gemini API free tier | $0 (1,500 requests/día gratis) |

**Notas importantes:**

- **Plan Hobby de Vercel:** técnicamente es para uso no-comercial. Una herramienta interna de empresa cae en zona gris. En la práctica nadie te va a decir nada con este volumen, pero si querés estar en regla son USD 20/mes por el plan Pro.
- **Privacidad en Gemini:** el free tier permite que Google use tus prompts para entrenar. Si los datos son sensibles, activá billing en Google AI Studio (no te van a cobrar nada con este uso) y eso desactiva el data sharing.

---

## Estructura del proyecto

```
comercial-bot/
├── api/
│   ├── chat.js              # Función que llama a Gemini
│   └── admin/
│       ├── upload.js        # Recibe Excel, guarda en Blob
│       └── status.js        # Devuelve qué hay cargado
├── scripts/
│   └── convert-report.js    # Conversión local (opcional, ya no es necesaria)
├── index.html               # El chat (subir a SharePoint)
├── admin.html               # Página de admin (servida por Vercel)
├── package.json
├── vercel.json
└── .env.example
```

---

## Personalización

- **Rol/instrucciones del bot:** editá `buildSystemPrompt()` en `api/chat.js`. Agregá glosario de productos, definiciones de KPIs, vocabulario interno, etc.
- **Preguntas sugeridas del welcome:** editá los `<button class="suggestion">` en `index.html`
- **Colores y estética:** los hex están en `:root` al inicio del `<style>` en ambos HTMLs
- **Modelo de Gemini:** cambiar `GEMINI_MODEL` en `api/chat.js` (`gemini-2.5-flash` recomendado, `gemini-2.5-pro` más potente pero free tier más restringido)
- **TTL del cache:** `CACHE_TTL_MS` en `api/chat.js` (default 60s, podés bajarlo si querés que las actualizaciones se vean instantáneo)

---

## Troubleshooting

**"GEMINI_API_KEY no configurada"**
Te falta la variable en Vercel Settings → Environment Variables. Después de agregarla, redeployá.

**"ADMIN_PASSWORD no configurada"**
Idem para el password. No hace falta que sea complicada, pero que sea difícil de adivinar.

**"Password incorrecto" al loguear en admin**
Verificá que estés usando el mismo valor que configuraste en Vercel. Si la cambiaste, hacé logout (devtools → Application → Session Storage → borrar `bot-admin-pw`).

**El bot dice "Sin reportes cargados"**
Significa que el Blob `reports.json` no existe o no se pudo leer. Andá a /admin.html y subí los reportes.

**Error CORS en la consola del navegador (al abrir desde SharePoint)**
El código ya acepta cualquier subdominio de `.sharepoint.com`. Si tu instancia es distinta, ajustá la función `setCors` en `api/chat.js`.

**"Quota exceeded" en Gemini**
Pasaste 1,500 requests/día o 15 RPM. Esperá un minuto o activá billing en Google AI Studio (sigue siendo prácticamente gratis a este volumen).
