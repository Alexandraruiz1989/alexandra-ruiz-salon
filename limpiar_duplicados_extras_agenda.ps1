$ErrorActionPreference = "Stop"

$path = ".\app\admin\agenda\page.js"

if (!(Test-Path $path)) {
  throw "No encontré $path. Ejecuta este script desde la carpeta raíz del proyecto."
}

$backupPath = ".\app\admin\agenda\page.backup-before-fix-duplicate-extras.js"
Copy-Item $path $backupPath -Force

$content = Get-Content $path -Raw -Encoding UTF8

# Bloque correcto que debe existir una sola vez, después de validar servicesError.
$saveExtrasBlock = @'

    await supabase
      .from("appointment_extra_items")
      .delete()
      .eq("appointment_id", appointment.id);

    const validAppointmentExtras = appointmentExtraLines.filter(
      (line) => line.name && Number(line.total_price || 0) > 0
    );

    if (validAppointmentExtras.length > 0) {
      const extraRows = validAppointmentExtras.map((line, index) => ({
        appointment_id: appointment.id,
        extra_id: line.extra_id || null,
        name: line.name,
        quantity: Number(line.quantity || 0),
        unit_price: Number(line.unit_price || 0),
        total_price: Number(line.total_price || 0),
        staff_id: line.staff_id || null,
        notes: line.notes?.trim() || null,
        order_index: index,
        updated_at: new Date().toISOString(),
      }));

      const { error: extrasError } = await supabase
        .from("appointment_extra_items")
        .insert(extraRows);

      if (extrasError) {
        setMessage(
          `La cita se guardó, pero no se pudieron guardar los extras: ${extrasError.message}`
        );
        setSaving(false);
        return;
      }
    }
'@

# 1) Quitar TODOS los bloques previos de guardado de appointment_extra_items
#    para eliminar duplicados y evitar "validAppointmentExtras is defined multiple times".
$removePattern = '(?s)\r?\n\s*await supabase\s*\r?\n\s*\.from\("appointment_extra_items"\)\s*\r?\n\s*\.delete\(\)\s*\r?\n\s*\.eq\("appointment_id", appointment\.id\);\s*\r?\n\s*const validAppointmentExtras = appointmentExtraLines\.filter\(\s*\r?\n\s*\(line\) => line\.name && Number\(line\.total_price \|\| 0\) > 0\s*\r?\n\s*\);\s*\r?\n\s*if \(validAppointmentExtras\.length > 0\) \{\s*\r?\n\s*const extraRows = validAppointmentExtras\.map\(\(line, index\) => \(\{[\s\S]*?setSaving\(false\);\s*\r?\n\s*return;\s*\r?\n\s*\}\s*\r?\n\s*\}\s*\r?\n'
$content = [regex]::Replace($content, $removePattern, "`r`n")

# 2) Insertar el bloque correcto después del if (servicesError) completo.
$servicesErrorPattern = '(?s)(    if \(servicesError\) \{\s*setMessage\([\s\S]*?\);\s*setSaving\(false\);\s*return;\s*\}\s*)'

$match = [regex]::Match($content, $servicesErrorPattern)
if (!$match.Success) {
  throw "No encontré el bloque if (servicesError). No hice cambios finales."
}

$content = $content.Substring(0, $match.Index) + $match.Value + $saveExtrasBlock + $content.Substring($match.Index + $match.Length)

# 3) Verificar que solo exista una definición de validAppointmentExtras.
$count = ([regex]::Matches($content, "const validAppointmentExtras")).Count
if ($count -ne 1) {
  Set-Content $path $content -Encoding UTF8
  throw "Intenté reparar, pero todavía hay $count ocurrencias de validAppointmentExtras. Revisa el archivo."
}

Set-Content $path $content -Encoding UTF8

Write-Host "Listo. Eliminé duplicados de validAppointmentExtras."
Write-Host "Backup creado en: $backupPath"
Write-Host "Ahora ejecuta: npm run build"
