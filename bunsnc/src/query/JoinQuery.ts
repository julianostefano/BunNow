/**
 * JOIN query implementation for ServiceNow
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { Query } from "./Query";

export class JoinQuery extends Query {
  private _joinTable: string;
  private _primaryField?: string;
  private _joinTableField?: string;

  constructor(
    table: string,
    joinTable: string,
    primaryField?: string,
    joinTableField?: string,
  ) {
    super(table);
    this._joinTable = joinTable;
    this._primaryField = primaryField;
    this._joinTableField = joinTableField;
  }

  /**
   * Generate ServiceNow JOIN query string
   */
  generateQuery(encodedQuery?: string, orderBy?: string): string {
    const query = super.generateQuery(encodedQuery, orderBy);
    const primary = this._primaryField || "sys_id";
    const secondary = this._joinTableField || "sys_id";

    const res = `JOIN${this._table}.${primary}=${this._joinTable}.${secondary}`;

    // The `!` is required even if query is empty
    return `${res}!${query}`;
  }
}
