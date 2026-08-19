import { isPortalBookableService } from "./appointmentWriteContracts.js";

export const CLIENT_PORTAL_UNCATEGORIZED_CATEGORY = "Otros servicios";

export function getClientPortalServiceCategory(service) {
  return (
    String(service?.category || "").trim() ||
    CLIENT_PORTAL_UNCATEGORIZED_CATEGORY
  );
}

export function groupClientPortalServicesByCategory(services = []) {
  return (services || []).reduce((groups, service) => {
    const category = getClientPortalServiceCategory(service);
    if (!groups[category]) groups[category] = [];
    groups[category].push(service);
    return groups;
  }, {});
}

export function buildStaffIdsByService(staffServices = []) {
  return (staffServices || []).reduce((result, item) => {
    if (item?.active === false) return result;
    if (!item?.service_id || !item?.staff_id) return result;
    if (!result[item.service_id]) result[item.service_id] = [];
    result[item.service_id].push(item.staff_id);
    return result;
  }, {});
}

export function mapClientPortalCatalog({
  services = [],
  staff = [],
  staffServices = [],
} = {}) {
  const staffIdsByService = buildStaffIdsByService(staffServices);

  return {
    services: (services || [])
      .filter(isPortalBookableService)
      .map((service) => ({
        id: service.id,
        name: service.name,
        category: getClientPortalServiceCategory(service),
        description: service.description || "",
        base_price: Number(service.base_price || 0),
        duration_minutes: Number(service.duration_minutes || 0),
        cleanup_minutes: Number(service.cleanup_minutes || 0),
        bookable_staff_ids: staffIdsByService[service.id] || [],
      })),
    staff: (staff || []).map((person) => ({
      id: person.id,
      full_name: person.full_name,
      photo_url: person.photo_url || person.image_url || null,
    })),
  };
}

export function staffCanDoService(personId, service) {
  const staffIds = Array.isArray(service?.bookable_staff_ids)
    ? service.bookable_staff_ids
    : [];

  return staffIds.length === 0 || staffIds.includes(personId);
}

export function staffCanDoSelectedServices(personId, selectedServices) {
  if (!personId) return true;
  return (selectedServices || []).every((service) =>
    staffCanDoService(personId, service)
  );
}

export function getCompatibleStaffForSelectedServices(staff, selectedServices) {
  if ((selectedServices || []).length === 0) return [];
  return (staff || []).filter((person) =>
    staffCanDoSelectedServices(person.id, selectedServices)
  );
}
