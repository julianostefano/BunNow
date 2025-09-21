/**
 * Standard query condition with support for sub OR conditions
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { BaseCondition } from "./BaseCondition";
import { OrCondition } from "./OrCondition";

export class QueryCondition extends BaseCondition {
  private __subQuery: OrCondition[] = [];

  constructor(name: string, operator: string, value?: any) {
    super(name, operator, value);
  }

  /**
   * Add an OR condition to this query condition
   */
  addOrCondition(name: string, operator: string, value?: any): OrCondition {
    const subQuery = new OrCondition(name, operator, value);
    this.__subQuery.push(subQuery);
    return subQuery;
  }

  /**
   * Generate the ServiceNow encoded query string
   */
  generate(): string {
    let query = `${this._name}${this._operator}${this._value}`;

    for (const subQuery of this.__subQuery) {
      query = `${query}^${subQuery.generate()}`;
    }

    return query;
  }
}
