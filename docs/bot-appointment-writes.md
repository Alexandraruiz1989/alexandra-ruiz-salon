# Escrituras de citas del bot

La implementación específica del bot ahora utiliza la arquitectura compartida
descrita en `docs/appointment-transactional-writes.md`.

El bot sigue cerrado por defecto. Para que pueda llamar el RPC deben valer
exactamente `"true"` las dos banderas del servidor:

```text
APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED
BOT_APPOINTMENT_WRITES_ENABLED
```

`TRUE`, `1`, una bandera ausente o una sola de las dos mantienen la escritura
desactivada. El bot nunca usa el escritor secuencial del portal o de agenda
como respaldo.

El endpoint futuro continúa siendo `POST /api/bot/appointments/confirm`. Exige
autenticación interna, `bot_settings.active`, conversación apta, vista previa
persistida vigente y confirmación exacta. El probador `/api/bot/test` continúa
en simulación y no importa el repositorio transaccional.

El SQL preparado y no ejecutado se generalizó antes de aplicarlo:

- RPC: `create_appointment_transaction`.
- Tabla técnica: `appointment_write_operations`.
- Migración: `supabase_appointment_transaction.sql`.
- Rollback: `supabase_appointment_transaction_rollback.sql`.

No crea pagos, no verifica anticipos, no envía WhatsApp y solo concede ejecución
al rol de servidor `service_role`.
