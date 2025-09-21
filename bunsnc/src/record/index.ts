/**
 * Record module exports
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export { GlideElement, type IGlideElement } from "./GlideElement";
export { GlideRecord, type IGlideRecord } from "./GlideRecord";

// Convenience factory functions
export const createGlideElement = (
  name: string,
  value?: any,
  displayValue?: any,
) => new GlideElement(name, value, displayValue);

export const createGlideRecord = (
  client: any,
  table: string,
  batchSize?: number,
  rewindable?: boolean,
) => new GlideRecord(client, table, batchSize, rewindable);
