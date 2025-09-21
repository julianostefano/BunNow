/**
 * Base class for all query conditions
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
export abstract class BaseCondition {
  protected _name: string;
  protected _operator: string;
  protected _value: any;

  constructor(name: string, operator: string, value?: any) {
    if (value !== undefined) {
      // Three parameters: name, operator, value
      this._name = name;
      this._operator = operator;
      this._value = value;
    } else {
      // Two parameters: name, value (operator defaults to '=')
      this._name = name;
      this._operator = "=";
      this._value = operator;
    }
  }

  abstract generate(): string;
}
