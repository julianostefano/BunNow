/**
 * OR condition for ServiceNow queries
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { BaseCondition } from "./BaseCondition";

export class OrCondition extends BaseCondition {
  constructor(name: string, operator: string, value?: any) {
    super(name, operator, value);
  }

  /**
   * Generate the ServiceNow encoded OR query string
   */
  generate(): string {
    return `OR${this._name}${this._operator}${this._value}`;
  }
}
