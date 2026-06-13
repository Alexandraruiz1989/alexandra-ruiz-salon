$ErrorActionPreference = "Stop"

$path = ".\app\admin\cobros\page.js"

if (!(Test-Path $path)) {
  throw "No encontre $path. Ejecuta este script desde la carpeta raiz del proyecto."
}

$backupPath = ".\app\admin\cobros\page.backup-before-load-appointment-extras.js"
Copy-Item $path $backupPath -Force

$content = Get-Content $path -Raw -Encoding UTF8

# ------------------------------------------------------------
# 1) Cargar extras planeados de appointment_extra_items al abrir Cobrar
# ------------------------------------------------------------
$openStart = $content.IndexOf("const openPaymentModal = (appointment) => {")
$closeStart = $content.IndexOf("const closePaymentModal", $openStart)

if ($openStart -lt 0 -or $closeStart -lt 0) {
  throw "No encontre openPaymentModal o closePaymentModal."
}

$openBlock = $content.Substring($openStart, $closeStart - $openStart)

if ($openBlock -notmatch "appointment_extra_items") {
  $oldLine = '    setExtraLines([]);'

  $newBlock = @'
    setExtraLines([]);

    supabase
      .from("appointment_extra_items")
      .select("*")
      .eq("appointment_id", appointment.id)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setPaymentMessage(
            `No se pudieron cargar los extras planeados de la cita: ${error.message}`
          );
          return;
        }

        const plannedExtras = (data || []).map((item) => ({
          extra_id: item.extra_id || "",
          name: item.name || "",
          quantity: Number(item.quantity || 1),
          unit_price: Number(item.unit_price || 0),
          total_price: Number(item.total_price || 0),
          staff_id: item.staff_id || "",
        }));

        if (plannedExtras.length > 0) {
          setExtraLines(plannedExtras);
        }
      });
'@

  $lineIndex = $openBlock.IndexOf($oldLine)
  if ($lineIndex -lt 0) {
    throw "No encontre setExtraLines([]) dentro de openPaymentModal."
  }

  $openBlock =
    $openBlock.Substring(0, $lineIndex) +
    $newBlock +
    $openBlock.Substring($lineIndex + $oldLine.Length)

  $content =
    $content.Substring(0, $openStart) +
    $openBlock +
    $content.Substring($closeStart)
}

# ------------------------------------------------------------
# 2) Permitir guardar extras aunque sean planeados y no manuales
#    Tambien evitar enviar "" como uuid en extra_id
# ------------------------------------------------------------
$content = $content.Replace(
  '    const validExtras = extraLines.filter(
      (line) => line.extra_id && Number(line.total_price || 0) > 0
    );',
  '    const validExtras = extraLines.filter(
      (line) =>
        (line.extra_id || line.name) && Number(line.total_price || 0) > 0
    );'
)

$content = $content.Replace(
  '        extra_id: line.extra_id,',
  '        extra_id: line.extra_id || null,'
)

Set-Content $path $content -Encoding UTF8

Write-Host "Listo. Cobros ahora carga extras planeados desde appointment_extra_items."
Write-Host "Backup creado en: $backupPath"
Write-Host "Ahora ejecuta: npm run build"
