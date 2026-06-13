$ErrorActionPreference = "Stop"

$path = ".\app\admin\agenda\page.js"

if (!(Test-Path $path)) {
  throw "No encontre $path. Ejecuta este script desde la carpeta raiz del proyecto."
}

$backupPath = ".\app\admin\agenda\page.backup-before-extra-search.js"
Copy-Item $path $backupPath -Force

$content = Get-Content $path -Raw -Encoding UTF8

# 1) Add extra_search to emptyAppointmentExtraLine
if ($content -match "const emptyAppointmentExtraLine = \{" -and $content -notmatch "extra_search:") {
  $content = $content.Replace(
    'const emptyAppointmentExtraLine = {
  extra_id: "",
  name: "",',
    'const emptyAppointmentExtraLine = {
  extra_id: "",
  extra_search: "",
  name: "",'
  )
}

if ($content -match "const emptyAppointmentExtraLine = \{" -and $content -notmatch "extra_id:") {
  $content = $content.Replace(
    'const emptyAppointmentExtraLine = {
  name: "",',
    'const emptyAppointmentExtraLine = {
  extra_id: "",
  extra_search: "",
  name: "",'
  )
}

# 2) Improve handler
if ($content -notmatch 'field === "extra_search"') {
  $needle = @'
        const updatedLine = {
          ...line,
          [field]: value,
        };

'@

  $insert = @'
        if (field === "extra_search") {
          updatedLine.extra_id = "";
          updatedLine.name = value;
        }

'@

  if (!$content.Contains($needle)) {
    throw "No encontre el bloque updatedLine en handleAppointmentExtraLineChange."
  }

  $content = $content.Replace($needle, $needle + $insert)
}

$oldExtraIdBlock = @'
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

$newExtraIdBlock = @'
        if (field === "extra_id") {
          const selectedExtra = extras.find((extra) => extra.id === value);

          if (selectedExtra) {
            updatedLine.name = selectedExtra.name || "";
            updatedLine.extra_search = `${selectedExtra.category || "Extra"} - ${
              selectedExtra.name || ""
            }`;
            updatedLine.unit_price = Number(selectedExtra.price || 0);
            updatedLine.quantity =
              selectedExtra.pricing_type === "fixed"
                ? 1
                : Number(updatedLine.quantity || 1);
          }
        }

'@

if ($content.Contains($oldExtraIdBlock)) {
  $content = $content.Replace($oldExtraIdBlock, $newExtraIdBlock)
} elseif ($content -match 'field === "extra_id"' -and $content -notmatch "updatedLine\.extra_search") {
  Write-Warning "Encontre un bloque extra_id distinto. Revisa manualmente si no autocompleta el texto."
}

# 3) Add helper functions inside NewAppointmentSection after selectClient
if ($content -notmatch "const getExtraMatches = \(query\) =>") {
  $needle = @'
  const selectClient = (client) => {
    handleFormChange({
      target: {
        name: "client_id",
        value: client.id,
        type: "text",
        checked: false,
      },
    });

    setClientSearch(
      `${client.full_name || "Sin nombre"}${
        client.phone ? ` - ${client.phone}` : ""
      }`
    );

    setShowClientResults(false);
  };

'@

  $insert = @'
  const getExtraMatches = (query) => {
    const term = String(query || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    if (!term) {
      return extras.slice(0, 8);
    }

    return extras
      .filter((extra) => {
        const text = `${extra.category || ""} ${extra.name || ""} ${
          extra.price || ""
        }`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        return text.includes(term);
      })
      .slice(0, 8);
  };

  const selectAppointmentExtra = (index, extra) => {
    handleAppointmentExtraLineChange(index, "extra_id", extra.id);
  };

'@

  if (!$content.Contains($needle)) {
    throw "No encontre el bloque selectClient para insertar getExtraMatches."
  }

  $content = $content.Replace($needle, $needle + $insert)
}

# 4) Replace the extras select UI with search input + suggestions
$oldBlock = @'
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

$newBlock = @'
                      <div className="relative lg:col-span-2">
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Extra / decoracion *
                        </label>
                        <input
                          value={line.extra_search || line.name || ""}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "extra_search",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                          placeholder="Escribe frances, retiro, largo extra, cristales..."
                        />

                        {(line.extra_search || "").trim() &&
                          !line.extra_id &&
                          getExtraMatches(line.extra_search).length > 0 && (
                            <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-[#dde3e6] bg-white p-2 shadow-xl">
                              {getExtraMatches(line.extra_search).map((extra) => (
                                <button
                                  key={extra.id}
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() =>
                                    selectAppointmentExtra(index, extra)
                                  }
                                  className="block w-full rounded-xl px-4 py-3 text-left text-sm transition hover:bg-[#f7eeee]"
                                >
                                  <span className="block font-medium text-[#263238]">
                                    {extra.category} - {extra.name}
                                  </span>
                                  <span className="text-xs text-[#68777c]">
                                    ${Number(extra.price || 0).toFixed(2)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                        {(line.extra_search || "").trim() &&
                          !line.extra_id &&
                          getExtraMatches(line.extra_search).length === 0 && (
                            <p className="mt-2 text-xs text-[#bd7b83]">
                              No encontre extras con esa busqueda.
                            </p>
                          )}

                        {line.extra_id && (
                          <p className="mt-2 text-xs text-[#68777c]">
                            Seleccionado: {line.name} · $
                            {Number(line.unit_price || 0).toFixed(2)}
                          </p>
                        )}

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
  throw "No encontre el bloque de select de extras. Quizas ya fue modificado."
}

Set-Content $path $content -Encoding UTF8

Write-Host "Listo. Extras ahora se buscan escribiendo letras."
Write-Host "Backup creado en: $backupPath"
Write-Host "Ahora ejecuta: npm run build"
