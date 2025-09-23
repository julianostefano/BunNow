/**
 * DateFormatters - Safe Date Formatting Utilities
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Utilities for safe date formatting to avoid "Data inválida" errors
 * when working with ServiceNow date formats.
 */

/**
 * Safely format dates to avoid "Data inválida" errors
 * @param dateValue - Date value from ServiceNow (can be null/undefined/string/object)
 * @returns Formatted date string or fallback message
 */
export function formatSafeDate(dateValue: any): string {
  if (
    !dateValue ||
    dateValue === "null" ||
    dateValue === "" ||
    dateValue === "undefined"
  ) {
    return "Data não informada";
  }

  try {
    // Handle ServiceNow object format {display_value: "date", value: "date"}
    const dateToFormat =
      typeof dateValue === "object" && dateValue.display_value
        ? dateValue.display_value
        : dateValue;

    const date = new Date(dateToFormat);
    if (isNaN(date.getTime())) {
      return "Data não disponível";
    }

    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch (error: unknown) {
    console.warn("Date formatting error:", error, "for value:", dateValue);
    return "Data não disponível";
  }
}

/**
 * Format datetime with time information
 * @param dateValue - Date value from ServiceNow
 * @returns Formatted datetime string with time
 */
export function formatSafeDateTime(dateValue: any): string {
  if (
    !dateValue ||
    dateValue === "null" ||
    dateValue === "" ||
    dateValue === "undefined"
  ) {
    return "Data não informada";
  }

  try {
    const dateToFormat =
      typeof dateValue === "object" && dateValue.display_value
        ? dateValue.display_value
        : dateValue;

    const date = new Date(dateToFormat);
    if (isNaN(date.getTime())) {
      return "Data não disponível";
    }

    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error: unknown) {
    console.warn("DateTime formatting error:", error, "for value:", dateValue);
    return "Data não disponível";
  }
}

/**
 * Get relative time description (e.g., "2 days ago", "1 hour ago")
 * @param dateValue - Date value from ServiceNow
 * @returns Relative time string
 */
export function formatRelativeTime(dateValue: any): string {
  if (
    !dateValue ||
    dateValue === "null" ||
    dateValue === "" ||
    dateValue === "undefined"
  ) {
    return "Data não informada";
  }

  try {
    const dateToFormat =
      typeof dateValue === "object" && dateValue.display_value
        ? dateValue.display_value
        : dateValue;

    const date = new Date(dateToFormat);
    if (isNaN(date.getTime())) {
      return "Data não disponível";
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return "Agora mesmo";
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minuto${diffMinutes > 1 ? "s" : ""} atrás`;
    } else if (diffHours < 24) {
      return `${diffHours} hora${diffHours > 1 ? "s" : ""} atrás`;
    } else if (diffDays < 30) {
      return `${diffDays} dia${diffDays > 1 ? "s" : ""} atrás`;
    } else {
      return formatSafeDate(dateValue);
    }
  } catch (error: unknown) {
    console.warn(
      "Relative time formatting error:",
      error,
      "for value:",
      dateValue,
    );
    return "Data não disponível";
  }
}

/**
 * Check if a date is within a specified number of days
 * @param dateValue - Date value from ServiceNow
 * @param days - Number of days to check against
 * @returns Boolean indicating if date is within the specified days
 */
export function isWithinDays(dateValue: any, days: number): boolean {
  if (
    !dateValue ||
    dateValue === "null" ||
    dateValue === "" ||
    dateValue === "undefined"
  ) {
    return false;
  }

  try {
    const dateToCheck =
      typeof dateValue === "object" && dateValue.display_value
        ? dateValue.display_value
        : dateValue;

    const date = new Date(dateToCheck);
    if (isNaN(date.getTime())) {
      return false;
    }

    const now = new Date();
    const diffMs = Math.abs(now.getTime() - date.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays <= days;
  } catch (error: unknown) {
    console.warn("Date comparison error:", error, "for value:", dateValue);
    return false;
  }
}
