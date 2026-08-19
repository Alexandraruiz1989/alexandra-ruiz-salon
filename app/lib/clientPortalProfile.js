import { cleanText } from "./bookingAvailability.js";

export function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

export function normalizePhoneDigits(value) {
  return cleanText(value).replace(/\D/g, "");
}

export function getClientDetailsFromUser(user, details = {}) {
  return {
    email: normalizeEmail(details.email || user?.email),
    fullName:
      cleanText(details.full_name) ||
      cleanText(details.fullName) ||
      cleanText(user?.user_metadata?.full_name) ||
      cleanText(user?.user_metadata?.name),
    phone:
      cleanText(details.phone) ||
      cleanText(user?.user_metadata?.phone) ||
      cleanText(user?.phone),
  };
}

export function isClientAuthUser(user) {
  const role = cleanText(
    user?.user_metadata?.role || user?.app_metadata?.role
  ).toLowerCase();
  const userType = cleanText(
    user?.user_metadata?.user_type || user?.app_metadata?.user_type
  ).toLowerCase();

  return role === "client" || userType === "client" || userType === "clienta";
}

export function isClientProfileComplete(client) {
  const fullName = cleanText(client?.full_name);
  return (
    Boolean(client?.id) &&
    Boolean(fullName) &&
    fullName.toLowerCase() !== "clienta" &&
    normalizePhoneDigits(client?.phone).length >= 8
  );
}
