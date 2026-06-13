$ErrorActionPreference = "Stop"

$path = ".\app\admin\agenda\page.js"

if (!(Test-Path $path)) {
  throw "No encontre $path. Ejecuta este script desde la carpeta raiz del proyecto."
}

$backupPath = ".\app\admin\agenda\page.backup-before-extras-ascii-safe.js"
Copy-Item $path $backupPath -Force

$content = Get-Content $path -Raw -Encoding UTF8

function S {
  param([int[]]$Codes)
  $result = ""
  foreach ($code in $Codes) {
    $result += [string][char]$code
  }
  return $result
}

# ------------------------------------------------------------
# 1) Fix mojibake / caracteres raros without non-ascii literals
# ------------------------------------------------------------
$pairs = @(
  @((S 0x00C3,0x00A1), (S 0x00E1)), # a acute
  @((S 0x00C3,0x00A9), (S 0x00E9)), # e acute
  @((S 0x00C3,0x00AD), (S 0x00ED)), # i acute
  @((S 0x00C3,0x00B3), (S 0x00F3)), # o acute
  @((S 0x00C3,0x00BA), (S 0x00FA)), # u acute
  @((S 0x00C3,0x00B1), (S 0x00F1)), # n tilde
  @((S 0x00C3,0x0081), (S 0x00C1)), # A acute
  @((S 0x00C3,0x0089), (S 0x00C9)), # E acute
  @((S 0x00C3,0x008D), (S 0x00CD)), # I acute
  @((S 0x00C3,0x0093), (S 0x00D3)), # O acute
  @((S 0x00C3,0x009A), (S 0x00DA)), # U acute
  @((S 0x00C3,0x0091), (S 0x00D1)), # N tilde
  @((S 0x00C2,0x00B7), (S 0x00B7)), # middle dot
  @((S 0x00C2,0x00BF), (S 0x00BF)), # inverted ?
  @((S 0x00C2,0x00A1), (S 0x00A1)), # inverted !
  @((S 0x00E2,0x0086,0x0091), (S 0x2191)), # up arrow latin1
  @((S 0x00E2,0x2020,0x2018), (S 0x2191)), # up arrow cp1252
  @((S 0x00E2,0x0086,0x0093), (S 0x2193)), # down arrow latin1
  @((S 0x00E2,0x2020,0x201C), (S 0x2193)), # down arrow cp1252
  @((S 0x00E2,0x009C,0x00A8), (S 0x2728)), # sparkle latin1
  @((S 0x00E2,0x0153,0x00A8), (S 0x2728))  # sparkle cp1252
)

foreach ($pair in $pairs) {
  $content = $content.Replace($pair[0], $pair[1])
}

# ------------------------------------------------------------
# 2) Add empty extra line template after emptyServiceLine
# ------------------------------------------------------------
if ($content -notmatch "emptyAppointmentExtraLine") {
  $content = [regex]::Replace(
    $content,
    '(const emptyServiceLine = \{[\s\S]*?\};)',
    @'
$1

const emptyAppointmentExtraLine = {
  name: "",
  quantity: 1,
  unit_price: "",
  total_price: 0,
  notes: "",
};
'@,
    1
  )
}

# ------------------------------------------------------------
# 3) Add state
# ------------------------------------------------------------
if ($content -notmatch "const \[appointmentExtraLines, setAppointmentExtraLines\]") {
  $needle = '  const [serviceLines, setServiceLines] = useState([{ ...emptyServiceLine }]);'
  if (!$content.Contains($needle)) {
    throw "No encontre el state de serviceLines."
  }

  $content = $content.Replace(
    $needle,
    @'
  const [serviceLines, setServiceLines] = useState([{ ...emptyServiceLine }]);
  const [appointmentExtraLines, setAppointmentExtraLines] = useState([]);
'@
  )
}

# ------------------------------------------------------------
# 4) Add extra handlers before validServiceLines
# ------------------------------------------------------------
if ($content -notmatch "const addAppointmentExtraLine = \(\) =>") {
  $extraFunctions = @'
  const addAppointmentExtraLine = () => {
    setAppointmentExtraLines((current) => [
      ...current,
      { ...emptyAppointmentExtraLine },
    ]);
  };

  const removeAppointmentExtraLine = (index) => {
    setAppointmentExtraLines((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const handleAppointmentExtraLineChange = (index, field, value) => {
    setAppointmentExtraLines((current) =>
      current.map((line, itemIndex) => {
        if (itemIndex !== index) return line;

        const updatedLine = {
          ...line,
          [field]: value,
        };

        const quantity = Number(
          field === "quantity" ? value : updatedLine.quantity || 0
        );
        const unitPrice = Number(
          field === "unit_price" ? value : updatedLine.unit_price || 0
        );

        updatedLine.total_price = quantity * unitPrice;

        return updatedLine;
      })
    );
  };

  const validAppointmentExtras = useMemo(() => {
    return appointmentExtraLines.filter(
      (line) => line.name.trim() && Number(line.total_price || 0) > 0
    );
  }, [appointmentExtraLines]);

'@

  $needle = '  const validServiceLines = useMemo(() => {'
  if (!$content.Contains($needle)) {
    throw "No encontre validServiceLines."
  }

  $content = $content.Replace($needle, $extraFunctions + $needle)
}

# ------------------------------------------------------------
# 5) estimatedTotal includes extras
# ------------------------------------------------------------
if ($content -notmatch "const extrasTotal = appointmentExtraLines.reduce") {
  $estimatedPattern = '(?s)  const estimatedTotal = useMemo\(\(\) => \{\s*return serviceLines\.reduce\(\(sum, line\) => \{\s*return sum \+ Number\(line\.price \|\| 0\) \* Number\(line\.quantity \|\| 1\);\s*\}, 0\);\s*\}, \[serviceLines\]\);'
  $estimatedReplacement = @'
  const estimatedTotal = useMemo(() => {
    const servicesTotal = serviceLines.reduce((sum, line) => {
      return sum + Number(line.price || 0) * Number(line.quantity || 1);
    }, 0);

    const extrasTotal = appointmentExtraLines.reduce((sum, line) => {
      return sum + Number(line.total_price || 0);
    }, 0);

    return servicesTotal + extrasTotal;
  }, [serviceLines, appointmentExtraLines]);
'@

  $newContent = [regex]::Replace($content, $estimatedPattern, $estimatedReplacement, 1)

  if ($newContent -eq $content) {
    throw "No pude reemplazar estimatedTotal."
  }

  $content = $newContent
}

# ------------------------------------------------------------
# 6) Clear extras when resetting/opening appointment
# ------------------------------------------------------------
if ($content -notmatch "setAppointmentExtraLines\(\[\]\);") {
  $needle = '    setServiceLines([{ ...emptyServiceLine }]);'
  if ($content.Contains($needle)) {
    $content = $content.Replace($needle, "    setServiceLines([{ ...emptyServiceLine }]);`r`n    setAppointmentExtraLines([]);")
  }
}

# Clear when opening from agenda grid too
$openNeedle = '    setServiceLines(() => {'
if ($content.Contains($openNeedle) -and $content -notmatch "setAppointmentExtraLines\(\[\]\);\s*[\r\n]+\s*setServiceLines\(\(\) => \{") {
  $content = $content.Replace($openNeedle, "    setAppointmentExtraLines([]);`r`n`r`n" + $openNeedle)
}

# ------------------------------------------------------------
# 7) Save extras before followups
# ------------------------------------------------------------
if ($content -notmatch "extrasToInsert = validAppointmentExtras.map") {
  $saveExtrasBlock = @'

    await supabase
      .from("appointment_extra_items")
      .delete()
      .eq("appointment_id", appointment.id);

    if (validAppointmentExtras.length > 0) {
      const extrasToInsert = validAppointmentExtras.map((line) => ({
        appointment_id: appointment.id,
        name: line.name.trim(),
        quantity: Number(line.quantity || 1),
        unit_price: Number(line.unit_price || 0),
        total_price: Number(line.total_price || 0),
        notes: line.notes?.trim() || null,
      }));

      const { error: extrasError } = await supabase
        .from("appointment_extra_items")
        .insert(extrasToInsert);

      if (extrasError) {
        setMessage(
          `La cita se guardo, pero no se pudieron guardar los extras: ${extrasError.message}`
        );
        setSaving(false);
        return;
      }
    }
'@

  $marker = 'await createAppointmentFollowups(appointment);'
  if (!$content.Contains($marker)) {
    throw "No encontre createAppointmentFollowups."
  }

  $content = $content.Replace($marker, $saveExtrasBlock + "`r`n" + $marker)
}

# ------------------------------------------------------------
# 8) Pass props to NewAppointmentSection
# ------------------------------------------------------------
if ($content -notmatch "appointmentExtraLines=\{appointmentExtraLines\}") {
  $content = $content.Replace(
    '          serviceLines={serviceLines}',
    @'
          serviceLines={serviceLines}
          appointmentExtraLines={appointmentExtraLines}
'@
  )
}

if ($content -notmatch "addAppointmentExtraLine=\{addAppointmentExtraLine\}") {
  $content = $content.Replace(
    '          removeServiceLine={removeServiceLine}',
    @'
          removeServiceLine={removeServiceLine}
          addAppointmentExtraLine={addAppointmentExtraLine}
          removeAppointmentExtraLine={removeAppointmentExtraLine}
          handleAppointmentExtraLineChange={handleAppointmentExtraLineChange}
'@
  )
}

# ------------------------------------------------------------
# 9) Receive props in NewAppointmentSection signature
# ------------------------------------------------------------
$signatureStart = $content.IndexOf("function NewAppointmentSection({")
$signatureEnd = $content.IndexOf("}) {", $signatureStart)

if ($signatureStart -lt 0 -or $signatureEnd -lt 0) {
  throw "No encontre NewAppointmentSection."
}

$signature = $content.Substring($signatureStart, $signatureEnd - $signatureStart + 4)

if ($signature -notmatch "appointmentExtraLines") {
  $newSignature = $signature.Replace(
    "  serviceLines,",
    @'
  serviceLines,
  appointmentExtraLines,
'@
  )

  $newSignature = $newSignature.Replace(
    "  removeServiceLine,",
    @'
  removeServiceLine,
  addAppointmentExtraLine,
  removeAppointmentExtraLine,
  handleAppointmentExtraLineChange,
'@
  )

  $content = $content.Substring(0, $signatureStart) + $newSignature + $content.Substring($signatureEnd + 4)
}

# ------------------------------------------------------------
# 10) Add Extras button beside Agregar servicio
# ------------------------------------------------------------
if ($content -notmatch ">\s*Extras\s*</button>") {
  $buttonPattern = '(?s)(\s*)<button\s+type="button"\s+onClick=\{addServiceLine\}\s+className="rounded-full bg-\[#bd7b83\] px-5 py-3 text-sm text-white transition hover:opacity-90"\s*>\s*Agregar servicio\s*</button>'

  $buttonReplacement = @'
$1<div className="flex flex-col gap-2 sm:flex-row">
$1  <button
$1    type="button"
$1    onClick={addAppointmentExtraLine}
$1    className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
$1  >
$1    Extras
$1  </button>
$1
$1  <button
$1    type="button"
$1    onClick={addServiceLine}
$1    className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
$1  >
$1    Agregar servicio
$1  </button>
$1</div>
'@

  $newContent = [regex]::Replace($content, $buttonPattern, $buttonReplacement, 1)

  if ($newContent -eq $content) {
    throw "No pude reemplazar el boton Agregar servicio."
  }

  $content = $newContent
}

# ------------------------------------------------------------
# 11) Add extras UI before Total estimado
# ------------------------------------------------------------
if ($content -notmatch "Extras de la cita") {
  $extrasUi = @'
          {appointmentExtraLines.length > 0 && (
            <div className="rounded-[1.5rem] bg-[#fff6fb] p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                  Extras de la cita
                </p>
                <p className="mt-1 text-sm text-[#68777c]">
                  Agrega decoraciones, retiros, largo extra u otros cargos.
                </p>
              </div>

              <div className="mt-4 space-y-4">
                {appointmentExtraLines.map((line, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-[#dde3e6] bg-white p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="font-medium text-[#263238]">
                        Extra {index + 1}
                      </h3>

                      <button
                        type="button"
                        onClick={() => removeAppointmentExtraLine(index)}
                        className="text-sm text-[#bd7b83]"
                      >
                        Quitar
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="lg:col-span-2">
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Nombre del extra *
                        </label>
                        <input
                          value={line.name}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "name",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                          placeholder="Ej. Frances, retiro, largo extra, cristales..."
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "quantity",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Precio unitario
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "unit_price",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Total
                        </label>
                        <input
                          value={line.total_price}
                          readOnly
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#edf0f2] px-4 py-3 outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Notas
                        </label>
                        <input
                          value={line.notes}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "notes",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                          placeholder="Detalle opcional"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

'@

  $newSectionStart = $content.IndexOf("function NewAppointmentSection({")
  $totalMarker = '          <div className="grid gap-4 sm:grid-cols-3">'
  $totalIndex = $content.IndexOf($totalMarker, $newSectionStart)

  if ($totalIndex -lt 0) {
    throw "No encontre el bloque de Total estimado para insertar Extras."
  }

  $content = $content.Substring(0, $totalIndex) + $extrasUi + $content.Substring($totalIndex)
}

Set-Content $path $content -Encoding UTF8

Write-Host "Listo. Agregue Extras en Agenda y corregi caracteres raros."
Write-Host "Backup creado en: $backupPath"
Write-Host "Ahora ejecuta: npm run build"
