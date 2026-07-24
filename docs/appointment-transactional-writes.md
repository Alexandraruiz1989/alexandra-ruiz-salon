# Escritura transaccional compartida de citas

## Estado

Esta fase prepara una transición; no activa escrituras transaccionales ni
ejecuta SQL. Agenda administrativa y portal conservan su escritor actual
cuando las banderas están apagadas. El bot permanece sin escritura.

La migración preparada se llama `supabase_appointment_transaction.sql` y el
rollback `supabase_appointment_transaction_rollback.sql`. Ninguno se ejecutó.

## Mapa de escritores

| Origen | Ruta o componente | Tablas | Orden actual | Disponibilidad | Duplicados/compensación | RPC | Riesgo actual |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Agenda administrativa | `app/admin/agenda/page.js`, `handleSubmit` usado por vistas diaria, semanal y mensual, disponibilidad y formulario | `appointments`, `appointment_services`, `appointment_extra_items`; después seguimientos y notificaciones | Cita; en edición borra servicios; servicios; extras; imagen; seguimientos; notificaciones | Valida restricciones técnica-servicio, jornada, descanso, bloqueos, traslapes y recursos antes de guardar; admite `force_created` por rol | Botón `saving` evita doble clic local. No hay idempotencia durable ni rollback completo. Una edición puede quedar sin servicios | No | Fallos parciales y carreras con otros procesos |
| Portal de clientas | `app/cliente/agenda/page.js` y `POST /api/client/appointments` | `appointments`, `appointment_services`; después notificaciones | Reconsulta; cita; servicios; notificaciones | Usa `bookingAvailability.js`: técnica, jornada, descanso, bloqueos, traslapes, recursos y duración acumulada | Vista previa versionada, confirmación final, deduplicación compatible y compensación de la cita si fallan servicios. La garantía entre procesos requiere RPC | Preparado por bandera | El modo compatible aún no es una transacción de base de datos |
| Bot histórico | `app/api/bot/test/route.backup-before-nearest-early-20260614-172635.js` | Implementación histórica con escrituras directas | Secuencial | Obsoleta | Sin uso activo; no se publica ni importa | No | Archivo histórico con lógica peligrosa; se conserva por restricción de esta fase |
| Probador del bot | `POST /api/bot/test` | Solo conversación y mensajes de prueba | No escribe agenda | Simulada | No puede habilitar escrituras | No | Ningún riesgo de cita real con la implementación actual |
| Bot productivo futuro | `POST /api/bot/appointments/confirm` | Por RPC: clienta si hace falta, cita, servicios y operación idempotente | Una transacción | Revalida todo dentro del RPC | Idempotencia y bloqueos transaccionales | Sí, detrás de dos banderas | Falta autenticador interno real y prueba de staging |
| Cobros | `app/admin/cobros/page.js` | `payments`, relaciones de pago, totales/caja | No crea citas | No aplica | No aplica | No | No es escritor de citas |
| Importaciones | No se encontró importador activo de citas | Ninguna | No aplica | No aplica | No aplica | No | Ninguno identificado |

## Auditoría del portal

| Función | Existe | Estado | Responsable / fuente | Escritura y validaciones | Pendiente |
| --- | --- | --- | --- | --- | --- |
| Autenticación | Sí | Completa para el flujo actual | Supabase Auth y `clientPortalServer.js` | Token bearer validado en servidor | Revisar recuperación y observabilidad en staging |
| Reconocer/crear clienta | Sí | Funciona, pero hoy ocurre fuera de la transacción de cita | `ensureClientForUser`; `clients` por auth, email o teléfono normalizado | No sobrescribe campos existentes con vacíos | Mover resolución final de duplicados al RPC |
| Servicios públicos | Sí | Endurecido | `GET /api/client/services`; `services` | Solo activo, tipo `servicio`, precio fijo positivo, duración válida, no interno y bookable | Confirmar con negocio si `bot_active/bot_bookable` será también la regla pública definitiva |
| Uno o varios servicios | Sí | Completo para una persona y una técnica | UI y `bookingAvailability.js` | Conserva orden, suma precio y duración | Casos con técnicas diferentes pasan a revisión; no se dividen |
| Técnica o cualquiera | Sí | Completo | Disponibilidad del servidor | “Cualquiera” se resuelve a una técnica concreta apta antes de la vista previa | Ninguno para el alcance seguro |
| Fecha/horario real | Sí | Completo para el motor actual | Horarios, descansos, citas, `staff_time_blocks`, recursos | Se vuelve a consultar al confirmar y aplica 60 min para Alexandra, 20 min para Laura/Tania y 20 min por defecto | Confirmar en staging que la política nominal coincide con los registros de personal |
| Bloqueos/vacaciones | Sí, por bloques | Parcial | `staff_time_blocks` | Evita intervalos bloqueados | Depende de que vacaciones/incidencias estén sincronizadas a bloques |
| Vista previa y resumen | Sí | Añadido | Servidor devuelve preview, versión, hash y vencimiento | Vincula clienta, servicios, técnica, fecha, horas, precio y duración | Probar visualmente en staging |
| Confirmación final | Sí | Añadida | Botón “Confirmar y enviar solicitud” | Cualquier cambio de selección invalida el horario y obliga a consultar de nuevo | Ninguno |
| Crear cita | Sí | Compatible por defecto, RPC futuro | `POST /api/client/appointments` y capa compartida | Solo responde éxito si existe ID y al menos un servicio | Aplicar/probar RPC antes de activar |
| Doble clic/duplicado | Sí | Mejorado, no garantía total entre servidores | Capa compartida en vuelo y búsqueda compatible | Replay para misma identidad; RPC será durable | No afirmar exclusión real hasta staging |
| Cancelar | Sí | Funciona con reglas actuales | `PATCH /api/client/appointments` | Solo citas de la clienta y estados/plazos permitidos | No es transaccional en esta fase |
| Reagendar | No | Incompleto | Se dirige a contacto manual | No escribe | Diseñar en fase posterior |
| Anticipo | Parcial | Seguro | Solo estado pendiente/mensaje informativo | No crea pagos ni verifica comprobantes | Definir política y verificador antes de automatizar |

Flujo actual del portal:

```text
sesión → catálogo público → selección → disponibilidad real
→ horario concreto → vista previa versionada → confirmación final
→ relectura servidor → escritor compatible o RPC (nunca ambos)
→ ID real verificado → notificación administrativa
```

Si la notificación falla después de crear la cita, la respuesta sigue
reconociendo la cita creada para evitar que la clienta reenvíe y duplique.

## Agenda administrativa

Las vistas diaria, semanal, mensual y el buscador de disponibilidad abren el
mismo formulario y terminan en un solo `handleSubmit`; no son escritores
independientes. La página escribe directamente con el cliente Supabase del
navegador. El adaptador `prepareAdminAppointmentContract` ya puede producir el
contrato compartido y `createAppointmentFromAdmin` selecciona un único escritor.

No se sustituyó todavía el `handleSubmit` productivo. Antes de activar el canal
administrativo hay que mover su creación a una ruta de servidor autenticada,
conservar extras, imágenes, edición y `force_created`, y después envolverla con
el adaptador. La bandera apagada mantiene intacto el flujo actual.

## Contrato común

`app/lib/appointmentWriteContracts.js` normaliza:

```js
{
  source: "admin" | "client_portal" | "bot",
  actorId,
  eventId,
  conversationId,
  client,
  participant,
  services,
  date,
  startTime,
  endTime,
  staffId,
  previewId,
  previewVersion,
  previewExpiresAt,
  confirmationId,
  requestHash,
  expectedPrice,
  depositStatus,
  forceCreated,
  notes
}
```

La huella no contiene datos personales en la clave idempotente. La clave lleva
el origen y una identidad de evento/preview/confirmación. La capa rechaza
`writesEnabled`, `allowRealWrite`, `allow_real_write` y `bypass`.

## Selección de escritor y banderas

Todas son variables exclusivas del servidor y solo aceptan exactamente
`"true"`:

```text
APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED
APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED
APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED
BOT_APPOINTMENT_WRITES_ENABLED
```

- Admin: compartida + admin → RPC; en otro caso, solo escritor actual.
- Portal: compartida + portal → RPC; en otro caso, solo escritor actual.
- Bot: compartida + bot → RPC; en otro caso, escritura desactivada.
- Nunca se ejecutan ambos escritores en una solicitud.
- El navegador no puede activar ninguna bandera.

## RPC general

Se eligió `create_appointment_transaction` porque la migración aún no ha sido
aplicada y los tres canales la compartirán. La tabla
`appointment_write_operations` registra `source`, actor cuando corresponda,
identidad idempotente, confirmación, resultado y cita.

La función:

- valida `source` contra `admin`, `client_portal` y `bot`;
- usa `SECURITY DEFINER` y `search_path = public, pg_temp`;
- revoca a `public`, `anon` y `authenticated`;
- concede solo a `service_role`;
- no confía en roles enviados como parámetro;
- revalida servicios, precio, duración, técnica, jornada, descanso,
  anticipación, bloqueos, traslapes y recursos;
- resuelve la clienta dentro de la transacción;
- crea cita y todos sus servicios o revierte;
- no crea ni consulta pagos;
- para bot, además valida conversación persistida y `bot_settings.active`.

`source` se fija en adaptadores de servidor; no se copia de la solicitud del
navegador.

## Idempotencia y concurrencia

La capa JS deduplica llamadas idénticas en vuelo dentro del proceso. El modo
compatible del portal busca una cita idéntica y compensa la cita si falla la
inserción de servicios. Estas medidas reducen errores, pero no sustituyen una
garantía de base de datos entre procesos.

El RPC usa la operación idempotente y bloqueos por confirmación,
colaboradora/día, teléfono y recurso/día. Las pruebas simuladas cubren:

- portal contra bot;
- agenda contra bot;
- agenda contra portal;
- dos pestañas del portal;
- dos administradoras.

Solo staging puede confirmar la protección real del motor PostgreSQL.

## Activación en staging

1. Revisar el SQL contra el esquema de staging y confirmar valores de
   `booking_source`, estados y columnas.
2. Tomar respaldo.
3. Aplicar solo en staging.
4. Verificar que `anon` y `authenticated` no pueden ejecutar la función ni leer
   la tabla técnica.
5. Ejecutar pruebas desechables de creación, replay, conflicto, traslape,
   recursos, cambio de precio/duración y fallo a mitad.
6. Crear la ruta administrativa de servidor y validar extras/edición antes de
   activar admin.
7. Activar primero la bandera compartida y un solo canal en staging.
8. Observar operaciones e idempotencia; después probar carreras entre canales.
9. Mantener producción apagada hasta aprobación explícita.

## Rollback

Desactivar primero todas las banderas de canal y la compartida. El archivo
`supabase_appointment_transaction_rollback.sql` elimina la función, índice y
tabla técnica; no elimina clientas, citas, servicios ni pagos. Las citas ya
creadas se conservan.

## Límites pendientes

- No se ha ejecutado ni validado el RPC contra una base de datos de staging.
- El escritor administrativo aún vive en el navegador y soporta edición,
  extras e imágenes fuera del contrato seguro.
- El modo compatible del portal no puede garantizar atomicidad entre procesos.
- La política de anticipos sigue pendiente; la anticipación por técnica debe
  confirmarse contra los nombres reales de staging.
- La autenticación interna productiva del bot sigue sin configurar.
- No existe conexión ni envío de WhatsApp.
