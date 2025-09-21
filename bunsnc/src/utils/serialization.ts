/**
 * Safe Serialization Utilities for BunSNC
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

/**
 * Safely stringify any value to avoid [object Object] issues
 * @param value - Value to stringify
 * @param replacer - JSON.stringify replacer function
 * @param space - JSON.stringify space parameter
 * @returns Safe string representation
 */
export function safeStringify(
  value: any,
  replacer?: (key: string, value: any) => any,
  space?: string | number,
): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value.toString();
  if (typeof value === "function") return "[Function]";
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "bigint") return value.toString();

  try {
    // Handle Date objects
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Handle Error objects
    if (value instanceof Error) {
      return JSON.stringify(
        {
          name: value.name,
          message: value.message,
          stack: value.stack,
        },
        replacer,
        space,
      );
    }

    // Handle circular references and other objects
    const seen = new WeakSet();
    return JSON.stringify(
      value,
      (key, val) => {
        if (val != null && typeof val === "object") {
          if (seen.has(val)) {
            return "[Circular Reference]";
          }
          seen.add(val);
        }

        // Apply custom replacer if provided
        if (replacer) {
          return replacer(key, val);
        }

        return val;
      },
      space,
    );
  } catch (error) {
    // Fallback for non-serializable objects
    return `[Non-serializable ${typeof value}]`;
  }
}

/**
 * Safe object to string conversion for template literals
 * @param value - Value to convert for display
 * @returns Display-safe string
 */
export function safeDisplay(value: any): string {
  if (value === null) return "";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value.toString();

  // For objects, try to get a meaningful display value
  if (typeof value === "object") {
    // Check for common display properties
    if (value.display_value) return value.display_value;
    if (value.label) return value.label;
    if (value.name) return value.name;
    if (value.title) return value.title;
    if (value.value) return safeDisplay(value.value);

    // Last resort: stringify
    return safeStringify(value);
  }

  return String(value);
}

/**
 * Safe property access with fallback
 * @param obj - Object to access
 * @param path - Property path (e.g., 'user.name' or ['user', 'name'])
 * @param fallback - Fallback value if property doesn't exist
 * @returns Property value or fallback
 */
export function safeGet(
  obj: any,
  path: string | string[],
  fallback: any = "",
): any {
  if (!obj || typeof obj !== "object") return fallback;

  const keys = Array.isArray(path) ? path : path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current == null || typeof current !== "object" || !(key in current)) {
      return fallback;
    }
    current = current[key];
  }

  return current;
}

/**
 * Format object for logging with safe serialization
 * @param obj - Object to format
 * @param maxDepth - Maximum nesting depth
 * @returns Formatted string for logging
 */
/**
 * Safe date formatting
 * @param dateValue - Date value to format
 * @returns Formatted date string
 */
export function safeFormatDate(dateValue: any): string {
  if (!dateValue) return "Data não disponível";

  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "Data inválida";

    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return "Data não disponível";
  }
}

/**
 * Format object for logging with safe serialization
 * @param obj - Object to format
 * @param maxDepth - Maximum nesting depth
 * @returns Formatted string for logging
 */
export function formatForLogging(obj: any, maxDepth: number = 3): string {
  if (maxDepth <= 0) return "[Max Depth Reached]";

  if (obj === null) return "null";
  if (obj === undefined) return "undefined";
  if (typeof obj !== "object") return safeStringify(obj);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    if (obj.length > 10) return `[Array(${obj.length})]`;
    return `[${obj.map((item) => formatForLogging(item, maxDepth - 1)).join(", ")}]`;
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) return "{}";
  if (keys.length > 20) return `{Object with ${keys.length} keys}`;

  const formatted = keys
    .slice(0, 10) // Limit to first 10 keys
    .map((key) => `${key}: ${formatForLogging(obj[key], maxDepth - 1)}`)
    .join(", ");

  return `{${formatted}${keys.length > 10 ? ", ..." : ""}}`;
}
