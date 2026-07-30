# Bot / WhatsApp: recepción segura inicial

Esta fase prepara únicamente la recepción del webhook de Meta/WhatsApp. No envía
mensajes, no consulta disponibilidad, no llama al motor conversacional y no crea
citas.

## URL futura

Cuando se despliegue y se autorice conectar Meta, la URL canónica será:

```txt
https://www.alexandraruizsalon.com/api/bot/whatsapp/webhook
```

No crear rutas alternativas para el mismo webhook.

## Variables privadas requeridas

Todas estas variables deben guardarse solo en el servidor, por ejemplo en Vercel
Production/Preview según la fase autorizada:

```txt
META_WEBHOOK_VERIFY_TOKEN=
META_APP_SECRET=
BOT_WEBHOOK_RECEIVE_ENABLED=false
BOT_WEBHOOK_MAX_BODY_BYTES=524288
```

No crear versiones `NEXT_PUBLIC_` de estas variables.

En esta fase no se usan todavía:

```txt
META_WHATSAPP_ACCESS_TOKEN
META_WHATSAPP_PHONE_NUMBER_ID
META_WHATSAPP_BUSINESS_ACCOUNT_ID
```

Esas variables pertenecen a la fase posterior de envío.

## Token de verificación privado

Generar un token largo, aleatorio y no adivinable. Ejemplo local:

```txt
openssl rand -hex 32
```

El valor generado debe copiarse manualmente a Vercel como
`META_WEBHOOK_VERIFY_TOKEN`. No debe guardarse en Git, capturas, chats ni
archivos rastreados.

## META_APP_SECRET

`META_APP_SECRET` debe copiarse manualmente desde la app de Meta hacia Vercel.
No debe imprimirse en consola ni exponerse al cliente. El webhook valida
`X-Hub-Signature-256` con HMAC SHA-256 sobre el cuerpo crudo recibido.

## Comportamiento de seguridad

### GET

La verificación GET:

- lee `hub.mode`;
- lee `hub.verify_token`;
- lee `hub.challenge`;
- acepta únicamente `hub.mode=subscribe`;
- compara el token recibido contra `META_WEBHOOK_VERIFY_TOKEN`;
- responde el `challenge` solo si el token es correcto;
- responde `403` si el token no coincide;
- no registra ni devuelve secretos.

### POST

La recepción POST:

- lee el cuerpo original antes de parsear JSON;
- valida `BOT_WEBHOOK_MAX_BODY_BYTES`;
- valida `X-Hub-Signature-256`;
- rechaza firma ausente, malformada o inválida;
- rechaza JSON inválido;
- no imprime payloads, teléfonos, wa_id, texto, tokens ni firmas;
- no guarda payload crudo;
- no llama al bot;
- no crea citas;
- no envía mensajes.

Si la firma es válida pero `BOT_WEBHOOK_RECEIVE_ENABLED` no es exactamente
`true`, responde `200` con estado técnico `receive_disabled`. Esto evita
reintentos innecesarios de Meta sin guardar ni procesar eventos.

## Activar recepción sin responder

Solo después de desplegar el código y aplicar la migración:

1. Agregar variables privadas en Vercel.
2. Mantener:

```txt
BOT_WEBHOOK_RECEIVE_ENABLED=false
BOT_APPOINTMENT_WRITES_ENABLED=false
```

3. Configurar la URL en Meta únicamente cuando se autorice.
4. Confirmar que la verificación GET responde el challenge.
5. Activar recepción controlada cambiando:

```txt
BOT_WEBHOOK_RECEIVE_ENABLED=true
```

6. Redeploy.
7. Enviar eventos desde el número de prueba.
8. Verificar que se creen filas en `public.bot_webhook_events`.

## Comprobar eventos recibidos

Consultar únicamente metadatos no sensibles:

```sql
select
  provider,
  event_type,
  status,
  count(*) as total
from public.bot_webhook_events
group by provider, event_type, status
order by provider, event_type, status;
```

No consultar ni copiar payloads crudos. Esta implementación no guarda payload
crudo completo.

## Apagar recepción

En Vercel:

```txt
BOT_WEBHOOK_RECEIVE_ENABLED=false
```

Después hacer redeploy. Con la bandera apagada, el endpoint sigue validando la
firma y responde `200 receive_disabled`, pero no guarda eventos.

## Banderas que deben permanecer apagadas

Hasta autorización explícita:

```txt
BOT_APPOINTMENT_WRITES_ENABLED=false
```

También debe permanecer apagada cualquier bandera de respuestas automáticas o
envío real que se agregue en fases posteriores.

## Número real

No configurar todavía el número real del salón. Primero usar número de prueba
de Meta, validar recepción, deduplicación, logs seguros y apagado controlado.

## Siguiente fase

La siguiente fase debería agregar, en otro commit separado:

- cliente servidor de WhatsApp Cloud API;
- envío controlado de respuestas;
- registro de mensajes salientes;
- estados de entrega/lectura;
- cola de reintentos;
- revisión humana;
- pruebas con número de prueba.

