$ErrorActionPreference = "Stop"

$path = ".\app\admin\agenda\page.js"

if (!(Test-Path $path)) {
  throw "No encontré $path. Asegúrate de correr este script desde la carpeta raíz del proyecto."
}

$backupPath = ".\app\admin\agenda\page.backup-before-appointment-extras.js"
Copy-Item $path $backupPath -Force

$content = Get-Content $path -Raw

# 1) Agregar estados para catálogo de extras y extras de cita
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

# 2) Cargar service_extras desde Supabase
if ($content -notmatch "loadAppointmentExtrasCatalog") {
  $insertAfter = '  const [appointmentExtraLines, setAppointmentExtraLines] = useState([]);'
  $extrasLoader = @'

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

  $content = $content.Replace($insertAfter, $insertAfter + $extrasLoader)
}

# 3) Agregar funciones para extras de cita antes de estimatedTotal
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

# 4) Modificar estimatedTotal para sumar servicios + extras
$estimatedPattern = '(?s)  const estimatedTotal = useMemo\(\(\) => \{\s*return serviceLines\.reduce\(\(sum, line\) => \{\s*return sum \+ Number\(line\.price \|\| 0\) \* Number\(line\.quantity \|\| 1\);\s*\}, 0\);\s*\}, \[serviceLines\]\);'
$estimatedReplacement = @'
  const estimatedTotal = useMemo(() => {
    const servicesTotal = serviceLines.reduce((sum, line) => {
      return sum + Number(line.price || 0) * Number(line.quantity || 1);
    }, 0);

    return servicesTotal + appointmentExtrasTotal;
  }, [serviceLines, appointmentExtrasTotal]);
'@
$content = [regex]::Replace($content, $estimatedPattern, $estimatedReplacement, 1)

# 5) Limpiar extras al resetear formulario o abrir nueva cita
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

# 7) Guardar extras después de guardar servicios
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

  $content = $content.Replace(
    '    if (servicesError) {',
    $saveExtrasBlock + "`r`n" + '    if (servicesError) {'
  )
}

# 8) Pasar props a NewAppointmentSection
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

# 9) Agregar props en firma de NewAppointmentSection
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

# 10) Agregar botón "Agregar extras" junto a "Agregar servicio"
if ($content -notmatch "Agregar extras") {
  $oldButton = @'
              <button
                type="button"
                onClick={addServiceLine}
                className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
              >
                Agregar servicio
              </button>
'@

  $newButtons = @'
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={addServiceLine}
                  className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
                >
                  Agregar servicio
                </button>

                <button
                  type="button"
                  onClick={addAppointmentExtraLine}
                  className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                >
                  Agregar extras
                </button>
              </div>
'@

  if ($content.Contains($oldButton)) {
    $content = $content.Replace($oldButton, $newButtons)
  } else {
    Write-Warning "No encontré el botón Agregar servicio exacto. Tal vez ya fue modificado."
  }
}

# 11) Insertar bloque visual de extras antes de Forzar cita
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

  $labelText = '          <label className="flex items-center gap-3 text-sm text-[#68777c]">'
  if ($content.Contains($labelText)) {
    $content = $content.Replace($labelText, $extrasUi + $labelText)
  } else {
    Write-Warning "No encontré el bloque de Forzar cita para insertar extras visuales."
  }
}

Set-Content $path $content -Encoding UTF8

Write-Host "Listo. Archivo modificado y backup creado en $backupPath"
Write-Host "Ahora corre: npm run build"
