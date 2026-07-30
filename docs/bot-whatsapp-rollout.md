# Bot / WhatsApp: recepción segura inicial

Esta fase prepara la recepción del webhook de Meta/WhatsApp y el procesamiento
interno mínimo de mensajes entrantes verificados. No envía mensajes, no consulta
disponibilidad, no llama al motor conversacional y no crea citas.

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
BOT_INBOUND_PROCESSING_ENABLED=false
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

Si `BOT_WEBHOOK_RECEIVE_ENABLED=true` pero
`BOT_INBOUND_PROCESSING_ENABLED=false`, el webhook guarda únicamente el evento
técnico redaccionado en `public.bot_webhook_events`. No crea conversaciones, no
crea mensajes internos y no responde.

El procesamiento interno de mensajes solo puede ocurrir cuando ambas banderas
privadas están exactamente en `true`:

```txt
BOT_WEBHOOK_RECEIVE_ENABLED=true
BOT_INBOUND_PROCESSING_ENABLED=true
```

No existe ni debe crearse una variante `NEXT_PUBLIC_` de
`BOT_INBOUND_PROCESSING_ENABLED`.

## Procesamiento entrante sin respuesta

Cuando ambas banderas están encendidas y Meta envía un mensaje de texto válido:

1. se deduplica el evento técnico en `public.bot_webhook_events`;
2. se localiza una conversación existente por proveedor o teléfono normalizado;
3. si no existe, se crea una sola conversación interna;
4. se guarda exactamente un `bot_message` entrante;
5. se marca el evento técnico como `processed`;
6. no se llama al motor conversacional;
7. no se envía respuesta;
8. no se consulta disponibilidad;
9. no se llama a `create_appointment_transaction`;
10. no se crean citas ni pagos.

La idempotencia se sostiene con:

- una fila lógica única en `public.bot_webhook_events`;
- índice único parcial por `provider + provider_message_id` en
  `public.bot_messages`;
- búsqueda de conversación por proveedor y por teléfono normalizado.

Si Meta reenvía el mismo mensaje, el endpoint debe responder `200` sin duplicar
conversación ni mensaje.

## Privacidad y datos guardados

El texto de la clienta puede guardarse en `public.bot_messages.body` porque será
necesario para fases posteriores de atención humana o motor conversacional.

No se guardan en conversaciones ni mensajes:

- payload crudo de Meta;
- firma;
- token;
- App Secret;
- nombre de contacto;
- identificadores técnicos innecesarios;
- datos de pago;
- metadatos completos del dispositivo.

Los datos técnicos sensibles se guardan como hashes cuando son necesarios para
deduplicación o trazabilidad segura.

## Atención humana y Bot OFF

La recepción de un mensaje nunca reactiva el bot por sí sola.

Si una conversación ya tiene:

- `bot_enabled=false`;
- `handoff_to_human=true`;
- atención manual en curso;

esos estados se conservan. En esta fase ningún estado produce respuesta
automática.

Los mensajes no textuales —imagen, audio, video, documento, ubicación,
contacto, sticker o interactivo no reconocido— se registran como mensaje
interno seguro, sin descargar archivos, con `requires_human_review=true`.

## Activar recepción sin responder

Solo después de desplegar el código y aplicar el SQL incremental:

```txt
supabase_production_bot_whatsapp_webhook_incremental.sql
```

1. Agregar variables privadas en Vercel.
2. Mantener:

```txt
BOT_WEBHOOK_RECEIVE_ENABLED=false
BOT_INBOUND_PROCESSING_ENABLED=false
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
9. Mantener `BOT_INBOUND_PROCESSING_ENABLED=false` hasta validar la fase de
   recepción técnica.
10. Cuando se autorice, activar `BOT_INBOUND_PROCESSING_ENABLED=true` para
    guardar conversaciones y mensajes entrantes sin respuesta automática.

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
BOT_INBOUND_PROCESSING_ENABLED=false
```

Después hacer redeploy. Con la bandera apagada, el endpoint sigue validando la
firma y responde `200 receive_disabled`, pero no guarda eventos.

Para apagar únicamente el procesamiento interno y seguir guardando eventos
técnicos:

```txt
BOT_WEBHOOK_RECEIVE_ENABLED=true
BOT_INBOUND_PROCESSING_ENABLED=false
```

## Rollback preparado

Si se autoriza revertir únicamente la infraestructura de recepción del webhook,
usar:

```txt
supabase_production_bot_whatsapp_webhook_rollback.sql
```

Ese rollback elimina solo `public.bot_webhook_events` y sus objetos dependientes.
No toca citas, pagos, clientas, servicios, conversaciones ni configuración de
Meta.

## Banderas que deben permanecer apagadas

Hasta autorización explícita:

```txt
BOT_APPOINTMENT_WRITES_ENABLED=false
```

También debe permanecer apagada cualquier bandera de respuestas automáticas o
envío real que se agregue en fases posteriores.

En particular, esta fase no habilita citas del bot y no debe activar
`BOT_APPOINTMENT_WRITES_ENABLED`.

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
