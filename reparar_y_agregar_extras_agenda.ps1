$ErrorActionPreference = "Stop"

$path = ".\app\admin\agenda\page.js"
$backupBeforeExtras = ".\app\admin\agenda\page.backup-before-appointment-extras.js"
$backupNow = ".\app\admin\agenda\page.backup-corrupted-before-repair.js"

if (!(Test-Path $path)) {
  throw "No encontré $path. Ejecuta este script desde C:\Users\sabid\Proyectos\alexandra-ruiz-salon"
}

Copy-Item $path $backupNow -Force

if (Test-Path $backupBeforeExtras) {
  Copy-Item $backupBeforeExtras $path -Force
  Write-Host "Restauré el backup limpio previo a extras."
} else {
  Write-Warning "No encontré $backupBeforeExtras. Seguiré con el archivo actual."
}

$content = Get-Content $path -Raw -Encoding UTF8

function Insert-After-Once {
  param(
    [string]$Text,
    [string]$Find,
    [string]$Insert,
    [string]$Check
  )

  if ($Text -match [regex]::Escape($Check)) {
    return $Text
  }

  if (!$Text.Contains($Find)) {
    throw "No encontré el texto esperado: $Find"
  }

  return $Text.Replace($Find, $Find + $Insert)
}

# 1) Estados de extras
if ($content -notmatch "const \[extras, setExtras\] = useState\(\[\]\);") {
  $content = $content.Replace(
    '  const [services, setServices] = useState([]);',
    @'
  const [services, setServices] = useState([]);
  const [extras, setExtras] = useState([]);
  const [appointmentExtraLines, setAppointmentExtraLines] = useState([]);
'@
  )
}

# 2) Cargar catálogo service_extras
if ($content -notmatch "loadAppointmentExtrasCatalog") {
  $find = '  const [appointmentExtraLines, setAppointmentExtraLines] = useState([]);'
  $insert = @'

  useEffect(() => {
    const loadAppointmentExtrasCatalog = async () => {
      const { data, error } = await supabase
        .from("service_extras")
        .select("*")
        .eq("active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (!error) {
        setExtras(data || []);
      }
    };

    loadAppointmentExtrasCatalog();
  }, []);
'@
  $content = $content.Replace($find, $find + $insert)
}

# 3) Funciones de extras antes de estimatedTotal
if ($content -notmatch "const addAppointmentExtraLine = \(\) =>") {
  $extraFunctions = @'
  const addAppointmentExtraLine = () => {
    setAppointmentExtraLines((current) => [
      ...current,
      {
        extra_id: "",
        name: "",
        quantity: 1,
        unit_price: 0,
        total_price: 0,
        staff_id: "",
        notes: "",
      },
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

        if (field === "extra_id") {
          const selectedExtra = extras.find((extra) => extra.id === value);

          if (selectedExtra) {
            updatedLine.name = selectedExtra.name;
            updatedLine.unit_price = Number(selectedExtra.price || 0);
            updatedLine.quantity =
              selectedExtra.pricing_type === "fixed"
                ? 1
                : Number(updatedLine.quantity || 1);
          }
        }

        const quantity = Number(updatedLine.quantity || 0);
        const unitPrice = Number(updatedLine.unit_price || 0);
        updatedLine.total_price = quantity * unitPrice;

        return updatedLine;
      })
    );
  };

  const appointmentExtrasTotal = useMemo(() => {
    return appointmentExtraLines.reduce((sum, line) => {
      return sum + Number(line.total_price || 0);
    }, 0);
  }, [appointmentExtraLines]);

'@

  $content = $content.Replace(
    '  const estimatedTotal = useMemo(() => {',
    $extraFunctions + '  const estimatedTotal = useMemo(() => {'
  )
}

# 4) estimatedTotal = servicios + extras
$estimatedPattern = '(?s)  const estimatedTotal = useMemo\(\(\) => \{\s*return serviceLines\.reduce\(\(sum, line\) => \{\s*return sum \+ Number\(line\.price \|\| 0\) \* Number\(line\.quantity \|\| 1\);\s*\}, 0\);\s*\}, \[serviceLines\]\);'
$estimatedReplacement = @'
  const estimatedTotal = useMemo(() => {
    const servicesTotal = serviceLines.reduce((sum, line) => {
      return sum + Number(line.price || 0) * Number(line.quantity || 1);
    }, 0);

    return servicesTotal + appointmentExtrasTotal;
  }, [serviceLines, appointmentExtrasTotal]);
'@

$newContent = [regex]::Replace($content, $estimatedPattern, $estimatedReplacement, 1)

if ($newContent -eq $content -and $content -notmatch "appointmentExtrasTotal") {
  throw "No pude reemplazar estimatedTotal. Revisa si cambió el bloque."
}

$content = $newContent

# 5) Limpiar extras al resetear formulario
$content = $content.Replace(
  '    setServiceLines([{ ...emptyServiceLine }]);',
  "    setServiceLines([{ ...emptyServiceLine }]);`r`n    setAppointmentExtraLines([]);"
)

$content = $content.Replace(
  "    setAppointmentExtraLines([]);`r`n    setAppointmentExtraLines([]);",
  "    setAppointmentExtraLines([]);"
)

# 6) Cargar extras planeados al editar cita
if ($content -notmatch "appointment_extra_items") {
  $editExtrasBlock = @'

    supabase
      .from("appointment_extra_items")
      .select("*")
      .eq("appointment_id", appointment.id)
      .order("order_index", { ascending: true })
      .then(({ data }) => {
        setAppointmentExtraLines(
          (data || []).map((item) => ({
            extra_id: item.extra_id || "",
            name: item.name || "",
            quantity: Number(item.quantity || 1),
            unit_price: Number(item.unit_price || 0),
            total_price: Number(item.total_price || 0),
            staff_id: item.staff_id || "",
            notes: item.notes || "",
          }))
        );
      });
'@

  $content = $content.Replace(
    '    setServiceLines(lines.length > 0 ? lines : [{ ...emptyServiceLine }]);',
    '    setServiceLines(lines.length > 0 ? lines : [{ ...emptyServiceLine }]);' + $editExtrasBlock
  )
}

# 7) Guardar extras después de validar que servicios se insertaron bien
if ($content -notmatch "validAppointmentExtras") {
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

  $servicesErrorPattern = '(?s)(    if \(servicesError\) \{.*?setSaving\(false\);\s*return;\s*\}\s*)'
  $content = [regex]::Replace($content, $servicesErrorPattern, '$1' + $saveExtrasBlock, 1)
}

# 8) Pasar props al componente NewAppointmentSection
if ($content -notmatch "appointmentExtraLines=\{appointmentExtraLines\}") {
  $content = $content.Replace(
    '          serviceLines={serviceLines}',
    @'
          serviceLines={serviceLines}
          extras={extras}
          appointmentExtraLines={appointmentExtraLines}
          appointmentExtrasTotal={appointmentExtrasTotal}
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

# 9) Agregar props a firma NewAppointmentSection
$signatureStart = $content.IndexOf("function NewAppointmentSection({")
$signatureEnd = $content.IndexOf("}) {", $signatureStart)

if ($signatureStart -lt 0 -or $signatureEnd -lt 0) {
  throw "No encontré la firma de NewAppointmentSection."
}

$signature = $content.Substring($signatureStart, $signatureEnd - $signatureStart + 4)

if ($signature -notmatch "appointmentExtraLines") {
  $newSignature = $signature.Replace(
    "  serviceLines,",
    @'
  serviceLines,
  extras,
  appointmentExtraLines,
  appointmentExtrasTotal,
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

# 10) Reemplazar botón Agregar servicio con grupo Agregar servicio + Agregar extras
if ($content -notmatch "Agregar extras") {
  $buttonPattern = '(?s)(\s*)<button\s+type="button"\s+onClick=\{addServiceLine\}\s+className="([^"]*)"\s*>\s*Agregar servicio\s*</button>'
  $buttonReplacement = @'
$1<div className="flex flex-col gap-2 sm:flex-row">
$1  <button
$1    type="button"
$1    onClick={addServiceLine}
$1    className="$2"
$1  >
$1    Agregar servicio
$1  </button>
$1
$1  <button
$1    type="button"
$1    onClick={addAppointmentExtraLine}
$1    className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
$1  >
$1    Agregar extras
$1  </button>
$1</div>
'@

  $content = [regex]::Replace($content, $buttonPattern, $buttonReplacement, 1)
}

# 11) Insertar UI de extras antes del checkbox force_created
if ($content -notmatch "Extras planeados") {
  $extrasUi = @'
          {appointmentExtraLines.length > 0 && (
            <div className="rounded-[1.5rem] bg-[#f7f9fa] p-4">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                    Extras planeados
                  </p>
                  <p className="mt-1 text-sm text-[#68777c]">
                    Agrega decoraciones, retiros, largo extra o cargos adicionales desde la agenda.
                  </p>
                </div>

                <p className="text-lg font-light text-[#263238]">
                  ${Number(appointmentExtrasTotal || 0).toFixed(2)}
                </p>
              </div>

              <div className="space-y-4">
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

                    <div className="grid gap-4 lg:grid-cols-3">
                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Extra / Decoración
                        </label>
                        <select
                          value={line.extra_id}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "extra_id",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        >
                          <option value="">Seleccionar extra</option>
                          {extras.map((extra) => (
                            <option key={extra.id} value={extra.id}>
                              {extra.category} - {extra.name} (${Number(
                                extra.price || 0
                              ).toFixed(2)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          min="0"
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
                          value={line.unit_price}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "unit_price",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Técnica
                        </label>
                        <select
                          value={line.staff_id}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "staff_id",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        >
                          <option value="">Sin asignar</option>
                          {staff.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.full_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Total
                        </label>
                        <input
                          value={`$${Number(line.total_price || 0).toFixed(2)}`}
                          readOnly
                          className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Nota
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
                          placeholder="Ej. Largo #3, diseño enviado por WhatsApp..."
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

'@

  $forceIndex = $content.IndexOf('name="force_created"')
  if ($forceIndex -lt 0) {
    throw "No encontré name=`"force_created`" para insertar UI de extras."
  }

  $labelStart = $content.LastIndexOf("<label", $forceIndex)
  if ($labelStart -lt 0) {
    throw "No encontré label antes de force_created."
  }

  $content = $content.Substring(0, $labelStart) + $extrasUi + $content.Substring($labelStart)
}

Set-Content $path $content -Encoding UTF8

Write-Host "Listo. Reparé texto desde backup y agregué Extras en Agenda."
Write-Host "Backup del archivo corrupto: $backupNow"
Write-Host "Ahora ejecuta: npm run build"
