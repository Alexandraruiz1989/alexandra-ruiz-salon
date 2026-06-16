$ErrorActionPreference = "Stop"

$routePath = ".\app\api\bot\test\route.js"
$pagePath = ".\app\admin\bot\page.js"

if (!(Test-Path $routePath)) {
  throw "No encontre $routePath. Ejecuta este script desde la carpeta raiz del proyecto."
}

if (!(Test-Path $pagePath)) {
  throw "No encontre $pagePath. Ejecuta este script desde la carpeta raiz del proyecto."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = ".\bot_recovery_backups_$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Copy-Item $routePath "$backupDir\route_broken_before_fix.js" -Force
Copy-Item $pagePath "$backupDir\page_before_fix.js" -Force

Write-Host "Backup creado en $backupDir"

Write-Host "Restaurando archivos del bot desde Git para partir de una base limpia..."
git checkout -- app/api/bot/test/route.js app/admin/bot/page.js

$route = Get-Content $routePath -Raw -Encoding UTF8
$page = Get-Content $pagePath -Raw -Encoding UTF8

# ============================================================
# PATCH ROUTE: helpers for IA-guided flow.
# ============================================================

if ($route -notmatch "function asksNearestAvailabilityBot") {
  $marker = "async function getAvailableSlots({"
  if (!$route.Contains($marker)) {
    throw "No encontre getAvailableSlots para insertar helpers."
  }

  $helpers = @'
function asksNearestAvailabilityBot(message) {
  const text = normalizeText(message);

  return (
    text.includes("cita mas proxima") ||
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

function addDaysFromTodayBot(daysToAdd) {
  return addDaysISO(todayISO(), daysToAdd);
}

async function findNextAvailableSlotsBot({
  supabase,
  selectedServices,
  preferredStaffMode = "available_priority",
  preferredStaffId = null,
  minimumStartMinutes = null,
  timeMode = "any",
  maxDays = 21,
}) {
  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset += 1) {
    const dateString = addDaysFromTodayBot(dayOffset);

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

function buildNearestSlotsMessageBot(result, selectedServices, preferredStaffName = "") {
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

function isFreshServiceRequestBot(message, ai) {
  const text = normalizeText(message);
  const hasServices = Array.isArray(ai.services_requested) && ai.services_requested.length > 0;

  if (!hasServices) return false;
  if (ai.add_to_existing_services) return false;

  const isContinuation =
    text.includes("tambien") ||
    text.includes("ademas") ||
    text.includes("agrega") ||
    text.includes("sumale") ||
    text.includes("y el ") ||
    text.includes("y la ");

  if (isContinuation) return false;

  return (
    text.includes("hola") ||
    text.includes("quiero") ||
    text.includes("quisiera") ||
    text.includes("me gustaria") ||
    text.includes("tienen cita") ||
    text.includes("tienes cita") ||
    text.includes("tienen espacio") ||
    text.includes("hay espacio") ||
    text.includes("cita para") ||
    text.includes("agendar")
  );
}

'@

  $route = $route.Replace($marker, $helpers + $marker)
}

if ($route -notmatch "function includesAnyKeyword") {
  $marker = "function getAcrylicOptions"
  if (!$route.Contains($marker)) {
    throw "No encontre getAcrylicOptions para insertar includesAnyKeyword."
  }

  $helper = @'
function includesAnyKeyword(value, keywords = []) {
  const text = normalizeText(value);

  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return normalizedKeyword && text.includes(normalizedKeyword);
  });
}

'@

  $route = $route.Replace($marker, $helper + $marker)
}

# Improve the AI instruction without changing JSON structure.
$route = $route.Replace(
  '- Si pregunta horario de trabajo, marca wants_business_hours.',
  '- Si pregunta horario de trabajo, marca wants_business_hours.' + "`r`n" +
  '- Si pregunta por la cita mas proxima, lo mas pronto, primer espacio o disponibilidad mas cercana, NO marques wants_business_hours; usa intent book_appointment y conserva los servicios previos si existen.' + "`r`n" +
  '- Si pide pedi y unas en el mismo mensaje, pon ambos en services_requested: ["pedicure", "unas"].'
)

# Reset API. Safe and independent of conversation context.
if ($route -notmatch "reset conversation final clean") {
  $phoneLine = '    const clientPhoneFromTest = String(body.clientPhone || "test").trim();'
  if (!$route.Contains($phoneLine)) {
    throw "No encontre clientPhoneFromTest para insertar reset API."
  }

  $resetBlock = @'

    // reset conversation final clean
    if (body.resetConversation === true || body.reset === true) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const rawPhone = String(clientPhoneFromTest || "test").trim();
      const digitsOnly = rawPhone.replace(/\D/g, "");
      const last10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

      const phoneVariants = Array.from(
        new Set(
          [
            rawPhone,
            digitsOnly,
            last10,
            digitsOnly ? `52${last10}` : "",
            digitsOnly ? `+52${last10}` : "",
            "test",
          ].filter(Boolean)
        )
      );

      const { error: conversationDeleteError } = await supabase
        .from("bot_conversations")
        .delete()
        .in("client_phone", phoneVariants);

      try {
        await supabase
          .from("bot_messages")
          .delete()
          .in("client_phone", phoneVariants);
      } catch (messageResetError) {
        // Ignore if bot_messages is not available in this project.
      }

      if (conversationDeleteError) {
        return NextResponse.json(
          { error: `No se pudo reiniciar la conversacion: ${conversationDeleteError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        reset: true,
        reply: "Conversacion reiniciada. Ya no tomare en cuenta el contexto anterior.",
        phoneVariants,
      });
    }
'@

  $route = $route.Replace($phoneLine, $phoneLine + $resetBlock)
}

# Do not let "cita mas proxima" be handled as business hours.
$route = $route.Replace(
  '    if (!reply && (ai.wants_business_hours || asksBusinessHours(incomingMessage))) {',
  '    if (!reply && !asksNearestAvailabilityBot(incomingMessage) && (ai.wants_business_hours || asksBusinessHours(incomingMessage))) {'
)

# Make new explicit service requests clear old selected services.
$oldContextBlock = @'
    const selectedServicesFromContext = Array.isArray(context.selected_services)
      ? context.selected_services
      : [];
'@

$newContextBlock = @'
    const selectedServicesFromContext = isFreshServiceRequestBot(incomingMessage, ai)
      ? []
      : Array.isArray(context.selected_services)
      ? context.selected_services
      : [];
'@

if ($route.Contains($oldContextBlock)) {
  $route = $route.Replace($oldContextBlock, $newContextBlock)
} else {
  Write-Warning "No encontre selectedServicesFromContext exacto. Continuo sin tocar esa parte."
}

# Keep pedi pending when client says "pedi y unas".
$oldNailBlock = @'
      if (!reply && serviceQueries.some((query) => isGeneralNailOnly(query))) {
        reply = buildNailClarifyingQuestion();
        matchedSource = "nail_clarifying_question";
        nextStep = "esperando_tipo_unas";
        nextContext.pending_service_options = [];
      }
'@

$newNailBlock = @'
      if (!reply && serviceQueries.some((query) => isGeneralNailOnly(query))) {
        const pendingAfterNailQueries = serviceQueries.filter(
          (query) => !isGeneralNailOnly(query)
        );

        if (pendingAfterNailQueries.length > 0) {
          nextContext.pending_after_nail_queries = pendingAfterNailQueries;
        }

        reply = buildNailClarifyingQuestion();
        matchedSource = "nail_clarifying_question";
        nextStep = "esperando_tipo_unas";
        nextContext.pending_service_options = [];
      }
'@

if ($route.Contains($oldNailBlock)) {
  $route = $route.Replace($oldNailBlock, $newNailBlock)
} else {
  Write-Warning "No encontre bloque exacto de nail_clarifying_question. Continuo."
}

# After selecting nails, continue automatically with pending pedi options.
$oldPendingSelection = @'
        nextContext.selected_services = merged;
        nextContext.pending_service_options = [];
        nextContext.adding_service_mode = false;

        reply = buildSelectedServicesMessage(merged, bookingNotes);
        matchedSource = "service_options_selected";
        nextStep = "esperando_tecnica";
'@

$newPendingSelection = @'
        nextContext.selected_services = merged;
        nextContext.pending_service_options = [];
        nextContext.adding_service_mode = false;

        const pendingAfterNailQueries = Array.isArray(nextContext.pending_after_nail_queries)
          ? nextContext.pending_after_nail_queries
          : [];

        if (pendingAfterNailQueries.length > 0) {
          const pendingResolved = resolveRequestedServices(pendingAfterNailQueries, services);
          nextContext.pending_after_nail_queries = [];

          if (pendingResolved.ambiguous.length > 0) {
            nextContext.pending_service_options = pendingResolved.ambiguous;
            nextContext.adding_service_mode = true;
            reply = buildServiceOptionsMessage(pendingResolved.ambiguous, merged);
            matchedSource = "pending_services_after_nail_options";
            nextStep = "esperando_seleccion_servicios";
          } else if (pendingResolved.selected.length > 0) {
            const mergedWithPending = mergeServices(merged, pendingResolved.selected);
            nextContext.selected_services = mergedWithPending;
            reply = buildSelectedServicesMessage(mergedWithPending, bookingNotes);
            matchedSource = "service_options_selected_with_pending";
            nextStep = "esperando_tecnica";
          } else {
            reply = buildSelectedServicesMessage(merged, bookingNotes);
            matchedSource = "service_options_selected";
            nextStep = "esperando_tecnica";
          }
        } else {
          reply = buildSelectedServicesMessage(merged, bookingNotes);
          matchedSource = "service_options_selected";
          nextStep = "esperando_tecnica";
        }
'@

if ($route.Contains($oldPendingSelection)) {
  $route = $route.Replace($oldPendingSelection, $newPendingSelection)
} else {
  Write-Warning "No encontre bloque exacto de seleccion de servicio. Continuo."
}

# Prevent generic ask_service from stealing "cita mas proxima".
$route = $route.Replace(
  '        serviceQueries.length === 0 &&',
  '        serviceQueries.length === 0 &&' + "`r`n" + '        !asksNearestAvailabilityBot(incomingMessage) &&'
)

# Add nearest-availability execution after selectedServicesNow is available.
if ($route -notmatch "nearest availability execution final clean") {
  $selectedNowBlock = @'
    const selectedServicesNow = Array.isArray(nextContext.selected_services)
      ? nextContext.selected_services
      : selectedServicesFromContext;
'@

  $nearestBlock = @'
    const selectedServicesNow = Array.isArray(nextContext.selected_services)
      ? nextContext.selected_services
      : selectedServicesFromContext;

    // nearest availability execution final clean
    if (!reply && asksNearestAvailabilityBot(incomingMessage)) {
      const servicesForNearest = selectedServicesNow;

      if (servicesForNearest.length > 0) {
        const preferredStaffMode =
          nextContext.preferred_staff_mode ||
          context.preferred_staff_mode ||
          "available_priority";

        const preferredStaffId =
          nextContext.preferred_staff_id || context.preferred_staff_id || null;

        const preferredStaffName =
          nextContext.preferred_staff_name || context.preferred_staff_name || "";

        const nearestResult = await findNextAvailableSlotsBot({
          supabase,
          selectedServices: servicesForNearest,
          preferredStaffMode,
          preferredStaffId,
          minimumStartMinutes: nextContext.minimum_start_minutes,
          timeMode: nextContext.time_mode,
        });

        nextContext.selected_services = servicesForNearest;
        nextContext.requested_date = nearestResult.dateString;
        nextContext.available_options = nearestResult.slots;

        reply = buildNearestSlotsMessageBot(
          nearestResult,
          servicesForNearest,
          preferredStaffMode === "specific" ? preferredStaffName : ""
        );

        matchedSource = "nearest_availability";
        nextStep = nearestResult.slots.length > 0 ? "esperando_opcion_horario" : "esperando_fecha";
      } else {
        reply = "Claro. Que servicio o servicios te gustaria agendar para buscarte la cita mas proxima?";
        matchedSource = "nearest_request_missing_service";
        nextStep = "esperando_servicios";
      }
    }
'@

  if ($route.Contains($selectedNowBlock)) {
    $route = $route.Replace($selectedNowBlock, $nearestBlock)
  } else {
    Write-Warning "No encontre selectedServicesNow exacto. Continuo sin cita proxima automatica."
  }
}

# ============================================================
# PATCH PAGE: reset button calls API.
# ============================================================

$newResetFunction = @'
  const resetTestChat = async () => {
    setTestMessage("");
    setTestResult(null);
    setTestChatMessages([]);
    setTestLoading(true);

    try {
      const response = await fetch("/api/bot/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resetConversation: true,
          clientName: testClientName.trim(),
          clientPhone: testClientPhone.trim() || "test",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "No se pudo reiniciar la conversacion.");
        return;
      }

      setMessage("Conversacion de prueba reiniciada correctamente.");
      await loadData();
    } catch (error) {
      setMessage(`No se pudo reiniciar la conversacion: ${error.message}`);
    } finally {
      setTestLoading(false);
    }
  };
'@

$pageResetPattern = '(?s)  const resetTestChat = (?:async )?\(\) => \{[\s\S]*?\n  \};'

if ([regex]::IsMatch($page, $pageResetPattern)) {
  $page = [regex]::Replace($page, $pageResetPattern, $newResetFunction, 1)
} else {
  Write-Warning "No encontre resetTestChat en page.js. Continuo."
}

$page = $page.Replace(
  '                onClick={resetTestChat}
                className="w-full rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"',
  '                onClick={resetTestChat}
                disabled={testLoading}
                className="w-full rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"'
)

Set-Content $routePath $route -Encoding UTF8
Set-Content $pagePath $page -Encoding UTF8

# Parser check. If JS syntax is broken, restore immediately.
Write-Host "Revisando sintaxis de route.js..."
$checkOutput = & node --check $routePath 2>&1
if ($LASTEXITCODE -ne 0) {
  Copy-Item "$backupDir\route_broken_before_fix.js" $routePath -Force
  Copy-Item "$backupDir\page_before_fix.js" $pagePath -Force
  Write-Host $checkOutput
  throw "La sintaxis no paso node --check. Restaure los archivos previos para no dejar el proyecto roto."
}

Write-Host "Sintaxis OK."

# Clean old bot patch files and old backups.
Write-Host "Limpiando archivos temporales anteriores..."
$oldFiles = @(
  ".\arreglar_bot_startsFreshBooking_y_reset.ps1",
  ".\arreglo_final_bot_contexto_reset.ps1",
  ".\bot_acrilico_nuevo_relleno_reset_api.ps1",
  ".\bot_cita_mas_proxima_y_pedi_unas.ps1",
  ".\bot_contexto_proxima_pedi_unas_final.ps1",
  ".\bot_reset_contexto_fresco_v2.ps1",
  ".\conectar_boton_reiniciar_bot.ps1",
  ".\estabilizar_bot_desde_git_y_reset.ps1",
  ".\fix_bot_ai_undefined_minimo.ps1",
  ".\fix_startsFreshBooking_reset_final.ps1",
  ".\fix_string_acrilico_build.ps1",
  ".\mejorar_contexto_bot_agenda.ps1",
  ".\route_actual_bot.js",
  ".\page_actual_bot.js"
)

foreach ($file in $oldFiles) {
  Remove-Item $file -Force -ErrorAction SilentlyContinue
}

Remove-Item ".\app\api\bot\test\route.backup*.js" -Force -ErrorAction SilentlyContinue
Remove-Item ".\app\admin\bot\page.backup*.js" -Force -ErrorAction SilentlyContinue

Write-Host "Listo. Bot reparado desde base limpia, sintaxis validada y temporales limpiados."
Write-Host "Backup de seguridad guardado en: $backupDir"
Write-Host "Ahora ejecuta: npm run build"
