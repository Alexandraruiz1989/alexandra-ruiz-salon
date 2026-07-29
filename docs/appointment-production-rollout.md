# Despliegue revisable: citas transaccionales

Este documento prepara el despliegue de escrituras transaccionales de citas para Alexandra Ruiz Salón. No ejecuta nada por sí solo.

## Estado actual

- Producción debe permanecer intacta hasta autorización humana.
- El bot y WhatsApp deben seguir sin escrituras reales.
- El flujo legacy debe permanecer disponible.
- Las banderas deben iniciar apagadas en producción.

## Migraciones locales vs producción

Las migraciones reconstruidas del entorno local no deben aplicarse ciegamente sobre una base productiva existente.

- `supabase/migrations/202607260001_rebuild_schema.sql` a `202607260008_*`: reconstruyen o completan estructura para Supabase Local.
- `supabase/migrations/202607260009_appointment_transaction_rpc.sql`: contiene los objetos transaccionales validados localmente.
- `supabase/migrations/202607260010_api_role_grants.sql`: es amplio para pruebas locales y no debe copiarse tal cual a producción.

Para producción se preparó un archivo incremental independiente:

- `supabase_production_appointment_transaction_incremental.sql`

Ese archivo contiene únicamente:

- `appointment_write_operations`;
- índices nuevos;
- índice auxiliar `clients_phone_digits_idx`;
- RPC `create_appointment_transaction`;
- grants mínimos al `service_role`;
- `notify pgrst, 'reload schema';`.

No contiene seed, filas exportadas, datos reales ni reconstrucción completa del esquema.

## Respaldo previo obligatorio

Antes de ejecutar cualquier SQL en producción:

1. Crear respaldo completo desde Supabase Dashboard o herramienta autorizada.
2. Descargar y etiquetar el respaldo con fecha/hora.
3. Verificar que el respaldo sea restaurable en un proyecto de staging o local aislado.
4. Confirmar que incluye esquema, funciones, RLS y datos.

No avanzar si no existe respaldo verificado.

## Revisión de diferencias de esquema

Antes de aplicar:

1. Comparar producción actual contra el esquema local validado.
2. Confirmar existencia de estas tablas y columnas usadas por el RPC:
   - `clients`;
   - `staff`;
   - `services`;
   - `service_extras`;
   - `staff_schedules`;
   - `appointments`;
   - `appointment_services`;
   - `appointment_extra_items`;
   - `bot_conversations`.
3. Confirmar que los nombres de columnas coinciden con los usados por el RPC.
4. Confirmar que no existe una tabla `appointment_write_operations` con significado distinto.

## Aplicación incremental propuesta

Solo después de respaldo y revisión:

1. Abrir Supabase SQL Editor del proyecto productivo correcto.
2. Confirmar manualmente que no es el proyecto local ni otro negocio.
3. Pegar el contenido de `supabase_production_appointment_transaction_incremental.sql`.
4. Ejecutar en una ventana de bajo tráfico.
5. Confirmar que termina con éxito.
6. Mantener las banderas de escritura transaccional apagadas.

## Variables / banderas de activación

Mantener apagadas inicialmente:

```text
APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED=false
APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED=false
APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED=false
BOT_APPOINTMENT_WRITES_ENABLED=false
```

Activar solo un canal por vez cuando se autorice:

1. Portal de clientas.
2. Agenda admin.
3. Bot, en una fase posterior separada.

## Prueba de humo con banderas apagadas

Después de aplicar SQL pero antes de activar:

1. Abrir panel admin.
2. Confirmar que Agenda sigue usando legacy.
3. Confirmar que portal sigue en modo anterior o deshabilitado.
4. Confirmar que no se crean filas nuevas en `appointment_write_operations`.
5. Confirmar que Bot no escribe citas.

## Prueba de humo al activar un canal

Activar primero en una ventana controlada:

1. Activar bandera compartida.
2. Activar solo la bandera del canal elegido.
3. Crear una cita ficticia controlada.
4. Confirmar:
   - una sola fila en `appointments`;
   - servicios esperados en `appointment_services`;
   - fila correspondiente en `appointment_write_operations`;
   - `status = created`;
   - no se crea pago automáticamente;
   - no se envía WhatsApp.
5. Repetir doble clic y confirmar idempotencia.

## Limpieza de pruebas ficticias

Si se crean citas ficticias durante humo:

1. Cancelarlas desde el sistema si es posible.
2. Documentar IDs internamente fuera del repositorio.
3. No borrar datos reales.
4. No borrar clientes reales.
5. Si se necesita limpieza SQL, prepararla y revisarla por separado.

## Rollback

Archivo preparado:

- `supabase_production_appointment_transaction_rollback.sql`

Antes de rollback:

1. Apagar todas las banderas transaccionales.
2. Confirmar que no hay operaciones en curso.
3. Ejecutar rollback solo si se autorizó.

El rollback:

- revoca execute del RPC;
- elimina el RPC;
- elimina `appointment_write_operations`;
- elimina el índice auxiliar nuevo;
- recarga schema cache.

No elimina:

- citas;
- clientas;
- servicios;
- pagos;
- cobros;
- staff;
- historiales.

## Deshabilitar inmediatamente ante error

Ante errores en producción:

1. Cambiar banderas a:

```text
APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED=false
APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED=false
APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED=false
BOT_APPOINTMENT_WRITES_ENABLED=false
```

2. Confirmar que el flujo legacy vuelve a operar.
3. Revisar `appointment_write_operations`.
4. No ejecutar rollback destructivo sin autorización.

## Pendientes antes del bot / WhatsApp

No activar escrituras del bot ni WhatsApp todavía. Falta:

- autenticación interna del webhook;
- firma de proveedor;
- idempotencia por mensaje externo;
- cola de reintentos;
- handoff humano;
- consentimiento de la clienta;
- plantillas aprobadas;
- observabilidad;
- monitoreo de errores;
- pruebas de pago/anticipo separadas.

## Checklist de autorización humana

Antes de aplicar SQL:

- [ ] Respaldo creado.
- [ ] Respaldo restaurado/verificado.
- [ ] SQL incremental revisado.
- [ ] Rollback revisado.
- [ ] Ventana de mantenimiento aprobada.
- [ ] Proyecto Supabase correcto confirmado.
- [ ] Banderas apagadas confirmadas.
- [ ] Canal inicial decidido.
- [ ] Prueba de humo definida.
- [ ] Persona responsable asignada.
- [ ] Criterio de detener definido.
- [ ] Monitoreo preparado.

