$ErrorActionPreference = "Stop"

$path = ".\app\admin\agenda\page.js"

if (!(Test-Path $path)) {
  throw "No encontre $path. Ejecuta este script desde la carpeta raiz del proyecto."
}

$backupPath = ".\app\admin\agenda\page.backup-before-extra-add-button.js"
Copy-Item $path $backupPath -Force

$content = Get-Content $path -Raw -Encoding UTF8

if ($content -match "Agregar otro extra") {
  Write-Host "El boton Agregar otro extra ya existe. No hice cambios."
  exit
}

$oldBlock = @'
                ))}
              </div>
            </div>
          )}
'@

$newBlock = @'
                ))}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={addAppointmentExtraLine}
                  className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                >
                  + Agregar otro extra
                </button>
              </div>
            </div>
          )}
'@

$sectionIndex = $content.IndexOf("Extras de la cita")
if ($sectionIndex -lt 0) {
  throw "No encontre la seccion Extras de la cita."
}

$afterSection = $content.Substring($sectionIndex)
$relativeIndex = $afterSection.IndexOf($oldBlock)

if ($relativeIndex -lt 0) {
  throw "No encontre el cierre exacto de la seccion de extras para insertar el boton."
}

$absoluteIndex = $sectionIndex + $relativeIndex

$content =
  $content.Substring(0, $absoluteIndex) +
  $newBlock +
  $content.Substring($absoluteIndex + $oldBlock.Length)

Set-Content $path $content -Encoding UTF8

Write-Host "Listo. Agregue el boton + Agregar otro extra al final de la seccion."
Write-Host "Backup creado en: $backupPath"
Write-Host "Ahora ejecuta: npm run build"
