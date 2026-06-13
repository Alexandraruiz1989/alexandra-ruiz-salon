$ErrorActionPreference = "Stop"

$path = ".\app\admin\agenda\page.js"

if (!(Test-Path $path)) {
  throw "No encontre $path. Ejecuta este script desde la carpeta raiz del proyecto."
}

$backupPath = ".\app\admin\agenda\page.backup-before-extras-catalog.js"
Copy-Item $path $backupPath -Force

$content = Get-Content $path -Raw -Encoding UTF8

# 1) Add extras catalog state
if ($content -notmatch "const \[extras, setExtras\] = useState\(\[\]\);") {
  $needle = '  const [services, setServices] = useState([]);'
  if (!$content.Contains($needle)) {
    throw "No encontre el state de services."
  }

  $content = $content.Replace(
    $needle,
    @'
  const [services, setServices] = useState([]);
  const [extras, setExtras] = useState([]);
'@
  )
}

# 2) Load service_extras catalog
if ($content -notmatch "loadAppointmentExtrasCatalog") {
  $needle = '  useEffect(() => {'
  $insert = @'
  useEffect(() => {
    const loadAppointmentExtrasCatalog = async () => {
      const { data, error } = await supabase
        .from("service_extras")
        .select("*")
        .eq("active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("No se pudieron cargar extras:", error.message);
        return;
      }

      setExtras(data || []);
    };

    loadAppointmentExtrasCatalog();
  }, []);

'@

  $index = $content.IndexOf($needle)
  if ($index -lt 0) {
    throw "No encontre el primer useEffect."
  }

  $content = $content.Substring(0, $index) + $insert + $content.Substring($index)
}

# 3) Add extra_id to emptyAppointmentExtraLine
if ($content -match "const emptyAppointmentExtraLine = \{") {
  if ($content -notmatch "extra_id: """"") {
    $content = $content.Replace(
      'const emptyAppointmentExtraLine = {
  name: "",',
      'const emptyAppointmentExtraLine = {
  extra_id: "",
  name: "",'
    )
  }
}

# 4) Update handler to autofill name and price from service_extras
if ($content -notmatch 'field === "extra_id"') {
  $needle = @'
        const updatedLine = {
          ...line,
          [field]: value,
        };

'@

  $insert = @'
        if (field === "extra_id") {
          const selectedExtra = extras.find((extra) => extra.id === value);

          if (selectedExtra) {
            updatedLine.name = selectedExtra.name || "";
            updatedLine.unit_price = Number(selectedExtra.price || 0);
            updatedLine.quantity =
              selectedExtra.pricing_type === "fixed"
                ? 1
                : Number(updatedLine.quantity || 1);
          }
        }

'@

  if (!$content.Contains($needle)) {
    throw "No encontre el bloque updatedLine dentro de handleAppointmentExtraLineChange."
  }

  $content = $content.Replace($needle, $needle + $insert)
}

# 5) Save extra_id in appointment_extra_items
if ($content -match "extrasToInsert = validAppointmentExtras.map") {
  if ($content -notmatch "extra_id: line.extra_id") {
    $content = $content.Replace(
      '        appointment_id: appointment.id,
        name: line.name.trim(),',
      '        appointment_id: appointment.id,
        extra_id: line.extra_id || null,
        name: line.name.trim(),'
    )
  }
}

# 6) Pass extras prop to NewAppointmentSection
if ($content -notmatch "extras=\{extras\}") {
  $needle = '          services={services}'
  if (!$content.Contains($needle)) {
    throw "No encontre services={services} en NewAppointmentSection."
  }

  $content = $content.Replace(
    $needle,
    @'
          services={services}
          extras={extras}
'@
  )
}

# 7) Receive extras prop in NewAppointmentSection signature
$signatureStart = $content.IndexOf("function NewAppointmentSection({")
$signatureEnd = $content.IndexOf("}) {", $signatureStart)

if ($signatureStart -lt 0 -or $signatureEnd -lt 0) {
  throw "No encontre function NewAppointmentSection."
}

$signature = $content.Substring($signatureStart, $signatureEnd - $signatureStart + 4)

if ($signature -notmatch "\s+extras,") {
  $newSignature = $signature.Replace(
    "  services,",
    @'
  services,
  extras,
'@
  )

  $content = $content.Substring(0, $signatureStart) + $newSignature + $content.Substring($signatureEnd + 4)
}

# 8) Replace the free-text extra name input with catalog select
$oldBlock = @'
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
'@

$newBlock = @'
                      <div className="lg:col-span-2">
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Extra / decoracion *
                        </label>
                        <select
                          value={line.extra_id || ""}
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

                        {extras.length === 0 && (
                          <p className="mt-2 text-xs text-[#bd7b83]">
                            Aun no hay extras activos cargados.
                          </p>
                        )}
                      </div>
'@

if ($content.Contains($oldBlock)) {
  $content = $content.Replace($oldBlock, $newBlock)
} else {
  Write-Warning "No encontre el bloque exacto del input Nombre del extra. Tal vez ya fue modificado."
}

Set-Content $path $content -Encoding UTF8

Write-Host "Listo. Extras ahora cargan desde service_extras y autollenan precio."
Write-Host "Backup creado en: $backupPath"
Write-Host "Ahora ejecuta: npm run build"
