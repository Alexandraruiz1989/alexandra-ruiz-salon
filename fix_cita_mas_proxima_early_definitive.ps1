$ErrorActionPreference = "Stop"

$routePath = ".\app\api\bot\test\route.js"

if (!(Test-Path $routePath)) {
  throw "No encontre $routePath. Ejecuta este script desde la carpeta raiz del proyecto."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = ".\app\api\bot\test\route.backup-before-nearest-early-$stamp.js"
Copy-Item $routePath $backupPath -Force

$route = Get-Content $routePath -Raw -Encoding UTF8

# ------------------------------------------------------------
# 1) Add a stable nearest-availability helper.
# ------------------------------------------------------------
if ($route -notmatch "function asksNearestAvailabilityFinal") {
  $marker = "async function getAvailableSlots({"
  if (!$route.Contains($marker)) {
    throw "No encontre getAvailableSlots para insertar helpers."
  }

  $helpers = @'
function asksNearestAvailabilityFinal(message) {
  const text = normalizeText(message);

  return (
    text.includes("cita mas proxima") ||
    text.includes("la mas proxima") ||
    text.includes("mas proxima") ||
    text.includes("mas pronto") ||
    text.includes("lo mas pronto") ||
    text.includes("lo antes posible") ||
    text.includes("primer espacio") ||
    text.includes("proximo espacio") ||
    text.includes("siguiente espacio") ||
    text.includes("cita mas cercana") ||
    text.includes("mas cercana")
  );
}

async function findNearestAvailabilityFinal({
  supabase,
  selectedServices,
  preferredStaffMode = "available_priority",
  preferredStaffId = null,
  minimumStartMinutes = null,
  timeMode = "any",
  maxDays = 21,
}) {
  for (let offset = 0; offset <= maxDays; offset += 1) {
    const dateString = addDaysISO(todayISO(), offset);

    const slots = await getAvailableSlots({
      supabase,
      selectedServices,
      dateString,
      preferredStaffMode,
      preferredStaffId,
      minimumStartMinutes,
      timeMode,
    });

    if (Array.isArray(slots) && slots.length > 0) {
      return { dateString, slots };
    }
  }

  return { dateString: null, slots: [] };
}

function buildNearestAvailabilityMessageFinal(result, selectedServices, preferredStaffName = "") {
  const servicesText = selectedServices.map((service) => service.name).join(" + ");
  const staffText = preferredStaffName ? ` con ${preferredStaffName}` : "";

  if (!result || !Array.isArray(result.slots) || result.slots.length === 0) {
    return `Por el momento no encontre espacios proximos para ${servicesText}${staffText}. Puedes decirme otro dia u otro horario para revisar mas opciones.`;
  }

  const optionsText = result.slots
    .slice(0, 8)
    .map(
      (slot, index) =>
        `${index + 1}. ${formatDate(result.dateString)} a las ${formatTime12(slot.start_time)} con ${slot.staff_name}`
    )
    .join("\n");

  return `El espacio mas proximo que encontre para ${servicesText}${staffText} es:\n\n${optionsText}\n\nResponde con el numero de la opcion que prefieras.`;
}

'@

  $route = $route.Replace($marker, $helpers + $marker)
}

# ------------------------------------------------------------
# 2) Do not let business hours catch "la cita mas proxima".
# ------------------------------------------------------------
$route = $route.Replace(
  'if (!reply && (ai.wants_business_hours || asksBusinessHours(incomingMessage)))',
  'if (!reply && !asksNearestAvailabilityFinal(incomingMessage) && (ai.wants_business_hours || asksBusinessHours(incomingMessage)))'
)

$route = $route.Replace(
  'if (!reply && !asksNearestAvailabilityBot(incomingMessage) && (ai.wants_business_hours || asksBusinessHours(incomingMessage)))',
  'if (!reply && !asksNearestAvailabilityFinal(incomingMessage) && (ai.wants_business_hours || asksBusinessHours(incomingMessage)))'
)

# ------------------------------------------------------------
# 3) Put nearest availability BEFORE generic service handling.
#    This is the important fix.
# ------------------------------------------------------------
if ($route -notmatch "nearest availability early definitive") {
  $marker = @'
    if (
      !reply &&
      (ai.intent === "book_appointment" ||
'@

  if (!$route.Contains($marker)) {
    throw "No encontre el bloque principal de book_appointment para insertar la cita mas proxima."
  }

  $earlyBlock = @'
    // nearest availability early definitive
    if (!reply && asksNearestAvailabilityFinal(incomingMessage)) {
      const servicesForNearest =
        Array.isArray(nextContext.selected_services) && nextContext.selected_services.length > 0
          ? nextContext.selected_services
          : selectedServicesFromContext;

      if (servicesForNearest.length > 0) {
        const preferredStaffMode =
          nextContext.preferred_staff_mode ||
          context.preferred_staff_mode ||
          "available_priority";

        const preferredStaffId =
          nextContext.preferred_staff_id || context.preferred_staff_id || null;

        const preferredStaffName =
          nextContext.preferred_staff_name || context.preferred_staff_name || "";

        const nearestResult = await findNearestAvailabilityFinal({
          supabase,
          selectedServices: servicesForNearest,
          preferredStaffMode,
          preferredStaffId,
          minimumStartMinutes: nextContext.minimum_start_minutes,
          timeMode: nextContext.time_mode,
        });

        nextContext.selected_services = servicesForNearest;
        nextContext.preferred_staff_mode = preferredStaffMode;
        nextContext.preferred_staff_id = preferredStaffId;
        nextContext.preferred_staff_name =
          preferredStaffMode === "specific" ? preferredStaffName : "la colaboradora disponible";
        nextContext.requested_date = nearestResult.dateString;
        nextContext.available_options = nearestResult.slots;

        reply = buildNearestAvailabilityMessageFinal(
          nearestResult,
          servicesForNearest,
          preferredStaffMode === "specific" ? preferredStaffName : ""
        );

        matchedSource = "nearest_availability";
        nextStep =
          nearestResult.slots.length > 0 ? "esperando_opcion_horario" : "esperando_fecha";
      } else {
        reply = "Claro. Que servicio o servicios te gustaria agendar para buscarte la cita mas proxima?";
        matchedSource = "nearest_missing_service";
        nextStep = "esperando_servicios";
      }
    }

    if (
      !reply &&
      (ai.intent === "book_appointment" ||
'@

  $route = $route.Replace($marker, $earlyBlock)
}

# ------------------------------------------------------------
# 4) Extra guard: generic ask_service should never run for nearest request.
# ------------------------------------------------------------
$route = $route.Replace(
  'serviceQueries.length === 0 &&
        (ai.intent === "book_appointment" || nextStep === "esperando_servicios")',
  'serviceQueries.length === 0 &&
        !asksNearestAvailabilityFinal(incomingMessage) &&
        (ai.intent === "book_appointment" || nextStep === "esperando_servicios")'
)

$route = $route.Replace(
  'serviceQueries.length === 0 &&
        !asksNearestAvailabilityBot(incomingMessage) &&
        (ai.intent === "book_appointment" || nextStep === "esperando_servicios")',
  'serviceQueries.length === 0 &&
        !asksNearestAvailabilityFinal(incomingMessage) &&
        (ai.intent === "book_appointment" || nextStep === "esperando_servicios")'
)

Set-Content $routePath $route -Encoding UTF8

# ------------------------------------------------------------
# 5) Validate syntax before letting the user build.
# ------------------------------------------------------------
$checkOutput = & node --check $routePath 2>&1
if ($LASTEXITCODE -ne 0) {
  Copy-Item $backupPath $routePath -Force
  Write-Host $checkOutput
  throw "La sintaxis no paso node --check. Restaure el archivo anterior."
}

Write-Host "Listo. Cita mas proxima corregida antes del flujo generico."
Write-Host "Sintaxis OK."
Write-Host "Backup creado en: $backupPath"
Write-Host "Ahora ejecuta: npm run build"
