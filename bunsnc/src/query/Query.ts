/**
 * Main Query builder class for ServiceNow
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { QueryCondition } from "./QueryCondition";

export class Query {
  protected _table?: string;
  private __subQuery: any[] = [];
  private __conditions: QueryCondition[] = [];

  constructor(table?: string) {
    this._table = table;
  }

  /**
   * Add an active=true query condition
   */
  addActiveQuery(): QueryCondition {
    return this.addQuery("active", "true");
  }

  /**
   * Add a standard query condition
   *
   * @param name Field name
   * @param operator Operator or value (if no value provided)
   * @param value Value (optional)
   *
   * Supported operators:
   * Numbers: =, !=, >, >=, <, <=
   * Strings: =, !=, IN, NOT IN, STARTSWITH, ENDSWITH, CONTAINS, DOES NOT CONTAIN, INSTANCEOF
   * Special: ISEMPTY, ISNOTEMPTY
   */
  addQuery(name: string, operator: string, value?: any): QueryCondition {
    const qc = new QueryCondition(name, operator, value);
    this._addQueryCondition(qc);
    return qc;
  }

  /**
   * Add a JOIN query
   */
  addJoinQuery(
    joinTable: string,
    primaryField?: string,
    joinTableField?: string,
  ): any {
    if (!this._table) {
      throw new Error(
        "Cannot execute join query as Query object was not instantiated with a table name",
      );
    }

    // Import dynamically to avoid circular dependency
    const { JoinQuery } = require("./JoinQuery");
    const joinQuery = new JoinQuery(
      this._table,
      joinTable,
      primaryField,
      joinTableField,
    );
    this.__subQuery.push(joinQuery);
    return joinQuery;
  }

  /**
   * Add a Related List query
   */
  addRLQuery(
    relatedTable: string,
    relatedField: string,
    operatorCondition: string,
    stopAtRelationship: boolean = false,
  ): any {
    if (!this._table) {
      throw new Error(
        "Cannot execute RL query as Query object was not instantiated with a table name",
      );
    }

    // Import dynamically to avoid circular dependency
    const { RLQuery } = require("./RLQuery");
    const rlQuery = new RLQuery(
      this._table,
      relatedTable,
      relatedField,
      operatorCondition,
      stopAtRelationship,
    );
    this.__subQuery.push(rlQuery);
    return rlQuery;
  }

  /**
   * Add a null query condition (ISEMPTY)
   */
  addNullQuery(field: string): QueryCondition {
    return this.addQuery(field, "", "ISEMPTY");
  }

  /**
   * Add a not null query condition (ISNOTEMPTY)
   */
  addNotNullQuery(field: string): QueryCondition {
    return this.addQuery(field, "", "ISNOTEMPTY");
  }

  /**
   * Add a query condition to the conditions array
   */
  private _addQueryCondition(qc: QueryCondition): void {
    if (!(qc instanceof QueryCondition)) {
      throw new Error("Expected QueryCondition instance");
    }
    this.__conditions.push(qc);
  }

  /**
   * Generate the complete ServiceNow encoded query string
   */
  generateQuery(encodedQuery?: string, orderBy?: string): string {
    let query = this.__conditions.map((c) => c.generate()).join("^");

    // Add sub queries
    for (const subQuery of this.__subQuery) {
      if (query === "") {
        return subQuery.generateQuery();
      }
      query = `${query}^${subQuery.generateQuery()}`;
    }

    // Add encoded query if provided
    if (encodedQuery) {
      query = [query, encodedQuery].filter(Boolean).join("^");
    }

    // Add order by if provided
    if (orderBy) {
      query = `${query}^${orderBy}`;
    }

    // Remove leading ^ if present
    if (query.startsWith("^")) {
      query = query.substring(1);
    }

    return query;
  }
}
