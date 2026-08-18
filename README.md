# Alexandra Ruiz Salón

Aplicación web del salón Alexandra Ruiz Salón, construida con Next.js, React y Supabase.

Este repositorio debe ser la fuente principal del código. Para trabajar desde otra computadora o desde GitHub Codespaces no copies la carpeta completa del proyecto: clona el repositorio, instala dependencias desde el lockfile y crea tu propio archivo local de variables de entorno.

## Tecnologías detectadas

- Next.js 16.2.6
- React 19.2.4
- Supabase JS 2.107.0
- Tailwind CSS 4
- ESLint 9
- Node.js >= 20.9.0, recomendado Node 22
- npm con `package-lock.json`

## Primera instalación

```bash
git clone https://github.com/Alexandraruiz1989/alexandra-ruiz-salon.git
cd alexandra-ruiz-salon
npm ci
cp .env.example .env.local
npm run dev
```

Después de copiar `.env.example`, completa `.env.local` manualmente con tus propios valores. Nunca guardes valores reales, tokens, contraseñas o llaves privadas en Git.

En Windows PowerShell, el equivalente para crear el archivo local es:

```powershell
Copy-Item .env.example .env.local
```

## Comandos disponibles

```bash
npm run dev
npm run build
npm start
npm run lint
npm run test:bot
npm run test:payments
node --test tests/storeSupplierWorkflow.test.mjs
npm run test:payments:local
```

Notas:

- `npm run test:payments:local` requiere una configuración local de Supabase y variables locales.
- Los demás comandos pueden ejecutarse con las variables necesarias en `.env.local` o en el entorno.

## Variables de entorno

Usa `.env.example` como plantilla. El archivo contiene solo nombres y valores vacíos o ficticios.

Requeridas para desarrollo:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Públicas opcionales:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_META_APP_ID`
- `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`
- `NEXT_PUBLIC_META_SDK_VERSION`
- `NEXT_PUBLIC_APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED`
- `NEXT_PUBLIC_APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED`
- `NEXT_PUBLIC_APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED`

Privadas o server-side:

- `SUPABASE_SERVICE_ROLE_KEY`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_APP_SECRET`
- `OPENAI_API_KEY`
- `VAPID_PRIVATE_KEY`
- `LOCAL_SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

Bot y WhatsApp:

- `BOT_WEBHOOK_RECEIVE_ENABLED`
- `BOT_INBOUND_PROCESSING_ENABLED`
- `BOT_DRAFT_GENERATION_ENABLED`
- `BOT_OUTBOUND_SEND_ENABLED`
- `BOT_APPOINTMENT_WRITES_ENABLED`
- `BOT_AI_ENABLED`
- `BOT_WEBHOOK_MAX_BODY_BYTES`

Otras variables opcionales:

- `OPENAI_MODEL`
- `VAPID_PUBLIC_KEY`
- `VAPID_SUBJECT`
- `LOCAL_SALON_PORT`
- `LOCAL_SUPABASE_URL`
- `SUPABASE_URL`
- `BOT_TEST_SERVICE_CATALOG_PATH`

Las banderas de WhatsApp/bot deben permanecer en `false` salvo una prueba controlada y autorizada. La ausencia de estas variables no debe activar envíos ni procesamiento real.

## GitHub Codespaces

El repositorio incluye una configuración ligera en `.devcontainer/devcontainer.json`:

- usa Node 22;
- instala dependencias con `npm ci`;
- reenvía el puerto 3000;
- permite ejecutar desarrollo, pruebas, lint y build.

Para usar Codespaces:

1. Abre el repositorio en GitHub.
2. Entra a `Code` -> `Codespaces`.
3. Crea un Codespace nuevo.
4. Configura los secretos necesarios en GitHub Codespaces Secrets o crea un `.env.local` manual a partir de `.env.example`.
5. Ejecuta `npm run dev`.

No copies `.env.local` desde otra computadora. Configura los valores en cada entorno de forma manual y segura.

Secretos recomendados para GitHub Codespaces, si ese entorno necesita conectarse a servicios reales o de prueba:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_APP_SECRET`
- `OPENAI_API_KEY`
- `VAPID_PRIVATE_KEY`
- `LOCAL_SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

Variables públicas como `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`, `NEXT_PUBLIC_SITE_URL` o `NEXT_PUBLIC_APP_URL` no son contraseñas por sí mismas, pero no deben contener datos privados ni valores de producción sin autorización.

## Trabajar desde otra computadora

```bash
git clone https://github.com/Alexandraruiz1989/alexandra-ruiz-salon.git
cd alexandra-ruiz-salon
npm ci
cp .env.example .env.local
git switch -c nombre-de-tu-rama
npm run dev
```

Antes de comenzar una tarea:

```bash
git fetch origin
git status --short
```

Trabaja siempre en una rama, valida, crea commit y sube la rama. Integra a `main` solo después de revisión y validación. No uses `force push` en el flujo normal.

## No sincronizar la carpeta del repo con Drive

No uses OneDrive, Google Drive o Dropbox para sincronizar en vivo la carpeta completa del repositorio. Puede causar conflictos en `.git`, `node_modules`, `.next`, lockfiles y archivos temporales.

El código se sincroniza mediante Git/GitHub. Documentos personales o respaldos pueden guardarse aparte, fuera del repositorio.

## Seguridad mínima

- No subas `.env.local`.
- No subas tokens, contraseñas, llaves privadas, claves de Supabase o secretos de Meta.
- No subas `node_modules`, `.next`, logs, caches o respaldos locales.
- Mantén apagadas las banderas del bot/WhatsApp salvo pruebas controladas.
- No ejecutes SQL productivo desde un entorno nuevo sin procedimiento de respaldo y autorización explícita.
