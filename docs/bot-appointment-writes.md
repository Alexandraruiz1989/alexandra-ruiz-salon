# Creación transaccional de citas desde el bot

## Estado de esta fase

La creación real queda cerrada por defecto.

- `BOT_APPOINTMENT_WRITES_ENABLED` no se agrega ni se activa en este cambio.
- La migración `supabase_bot_appointment_transaction.sql` es solo para revisión.
- No se ejecutó SQL ni se aplicó ninguna migración.
- La autenticación interna del endpoint de producción está deliberadamente sin
  configurar y falla de forma cerrada.
- `/api/bot/test` continúa siendo un simulador obligatorio de solo lectura para
  citas. No importa ni llama al repositorio de producción.
- No existe conexión ni envío de WhatsApp en este flujo.
- La función transaccional no crea ni modifica `payments`.

## Auditoría del esquema

El esquema se revisó mediante el documento OpenAPI de Supabase, con solicitudes
de metadatos de solo lectura y sin consultar filas. También se comparó contra el
código vigente de agenda, portal de clientas y disponibilidad.

Columnas utilizadas por la migración:

- `clients`: `id`, `full_name`, `phone`, `created_at`, `updated_at`.
- `appointments`: `id`, `client_id`, `staff_id`, `appointment_date`,
  `start_time`, `end_time`, `status`, `confirmation_status`,
  `attendance_status`, `booking_source`, `estimated_total`, `deposit_amount`,
  `force_created`, `notes`, `client_visible_notes`, `updated_at`.
- `appointment_services`: `appointment_id`, `service_id`, `custom_name`,
  `quantity`, `unit_price`, `total_price`, `price`, `staff_id`,
  `service_date`, `start_time`, `end_time`, `duration_minutes`,
  `cleanup_minutes`, `status`, `notes`.
- `services`, `staff`, `staff_services`, `staff_schedules`,
  `staff_time_blocks`, `resources`, `service_resources`, `bot_settings` y
  `bot_conversations`: únicamente columnas confirmadas en el esquema y usadas
  por la disponibilidad vigente.

No se confirmó mediante OpenAPI si RLS está habilitado actualmente en
`clients`, `appointments` y `appointment_services`. La tabla nueva sí habilita
RLS explícitamente y revoca acceso a `public`, `anon` y `authenticated`.

## Archivos SQL

- `supabase_bot_appointment_transaction.sql`: crea la tabla técnica
  `bot_appointment_operations`, el índice normalizado de teléfono y la RPC
  `create_bot_appointment_transaction`.
- `supabase_bot_appointment_transaction_rollback.sql`: revoca y elimina la RPC,
  el índice y la tabla técnica. No elimina citas, clientas ni servicios.

La tabla técnica conserva una clave idempotente única, la identidad de
conversación/vista previa/confirmación, el hash canónico de la solicitud y un
resultado estructurado. Repetir exactamente la misma operación devuelve el
resultado previo; reutilizar la identidad con datos diferentes se rechaza.

## Garantías de la RPC

La RPC usa `SECURITY DEFINER`, fija `search_path`, se concede solo a
`service_role` y realiza en una sola transacción:

1. Verificación de identidad, vigencia e idempotencia.
2. Verificación de `bot_settings.active` y del estado de la conversación.
3. Verificación del estado de anticipo, sin crear pagos.
4. Relectura de servicios, precio, duración y capacidad de la colaboradora.
5. Revalidación de horario, descanso, anticipación, bloqueos, traslapes y
   recursos.
6. Búsqueda o creación mínima de la clienta sin sobrescribir datos existentes.
7. Creación de `appointments` y de todos los `appointment_services`.
8. Verificación del número de servicios creados antes de confirmar el resultado.

Una excepción durante la creación revierte clienta, cita y servicios creados
por ese intento. La operación técnica queda marcada como fallida con un mensaje
seguro.

## Limitación de concurrencia

Los bloqueos de transacción serializan llamadas de esta misma RPC por
confirmación, colaboradora/fecha, teléfono y recurso/fecha. Las rutas actuales
de agenda administrativa y portal de clientas no adquieren esos bloqueos.

Por lo tanto, esta fase evita carreras entre operaciones del bot, pero no puede
garantizar por sí sola exclusión absoluta frente a una creación simultánea
hecha por las rutas heredadas. Antes de habilitar producción se debe validar en
staging y decidir entre:

- migrar las demás rutas de creación a la misma RPC o al mismo protocolo de
  bloqueo; o
- agregar una restricción de base de datos que cubra todos los escritores.

Las vacaciones/incidencias se reflejan en disponibilidad mediante
`staff_time_blocks`, igual que en la agenda actual. Si la sincronización que
crea esos bloqueos falla, la RPC no consulta `staff_vacations` directamente.

## Repositorio y endpoint de producción

`app/lib/botAppointmentProductionRepository.js` solo puede llamar a
`create_bot_appointment_transaction`. No contiene inserciones directas ni usa
las tablas de citas, clientas o pagos.

El endpoint futuro es:

`POST /api/bot/appointments/confirm`

Solo acepta:

```json
{
  "conversationId": "uuid",
  "previewId": "preview_...",
  "confirmationId": "confirmation_...",
  "requestHash": "fp_..."
}
```

Ignora la intención del navegador de habilitar escrituras: cualquier campo como
`allowRealWrite`, `writesEnabled`, `bypass`, `confirmed` o un borrador enviado
por el cliente causa rechazo. El borrador se carga únicamente desde
`bot_conversations.conversation_context`.

El endpoint exige, en este orden:

1. `BOT_APPOINTMENT_WRITES_ENABLED=true` exactamente en el servidor.
2. Autenticación interna válida.
3. `bot_settings.active=true`.
4. Conversación apta para bot.
5. Coincidencia exacta de conversación, preview, confirmación y fingerprint.
6. Vista previa vigente y confirmación explícita.
7. Respuesta completa y verificable de la RPC.

La interfaz de autenticación no inventa una llave ni reutiliza credenciales del
navegador. Hasta integrar un verificador interno real, siempre responde como no
configurada.

## Plan de despliegue seguro

1. Revisar el SQL y confirmar constraints/valores permitidos en staging,
   especialmente `booking_source = 'bot'`.
2. Tomar respaldo de las tablas involucradas.
3. Ejecutar la migración únicamente en staging.
4. Verificar permisos de la tabla técnica y de la RPC con roles `anon`,
   `authenticated` y `service_role`.
5. Ejecutar pruebas transaccionales con datos desechables en staging, incluidos
   replay, payload distinto, traslapes y fallo a mitad de servicios.
6. Resolver la limitación de concurrencia con los escritores heredados.
7. Implementar y probar un verificador de autenticación interna.
8. Mantener la bandera desactivada y desplegar el código.
9. Habilitar la bandera solo en staging y observar resultados/idempotencia.
10. Aplicar la migración en producción mediante una ventana aprobada.
11. Habilitar producción gradualmente y con monitoreo.

## Rollback

1. Desactivar `BOT_APPOINTMENT_WRITES_ENABLED`.
2. Confirmar que no haya operaciones del bot en curso.
3. Conservar/exportar `bot_appointment_operations` si se requiere auditoría.
4. Revisar y ejecutar `supabase_bot_appointment_transaction_rollback.sql`.
5. Verificar que el endpoint vuelva a responder `write_disabled`.

El rollback elimina el registro técnico de idempotencia. No revierte citas que
ya hubieran sido creadas correctamente; esas citas deben conservarse o
gestionarse manualmente según la operación del salón.

## Riesgo de mantenimiento detectado

Existe un respaldo histórico rastreado por Git:

`app/api/bot/test/route.backup-before-nearest-early-20260614-172635.js`

Next.js no lo publica como ruta y no se encontró ningún import activo, pero
contiene la implementación antigua de escritura directa y referencias a
variables sensibles. No se modificó ni eliminó en esta fase. Conviene retirarlo
en una tarea de limpieza aprobada después de conservar el historial necesario.
