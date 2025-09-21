/**
 * Query Builder module exports
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export { BaseCondition } from "./BaseCondition";
export { QueryCondition } from "./QueryCondition";
export { OrCondition } from "./OrCondition";
export { JoinQuery } from "./JoinQuery";
export { RLQuery } from "./RLQuery";
export { Query } from "./Query";
export { QueryBuilder, type IQueryBuilder } from "./QueryBuilder";

// Convenience factory functions
export const createQuery = (table?: string) => new Query(table);
export const createQueryBuilder = (table?: string) => new QueryBuilder(table);
