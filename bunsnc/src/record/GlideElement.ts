/**
 * GlideElement - Object backing the value/display values of a record entry
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface IGlideElement {
  getName(): string;
  getValue(): any;
  getDisplayValue(): any;
  getLink(): any;
  setValue(value: any): void;
  setDisplayValue(value: any): void;
  setLink(link: any): void;
  changes(): boolean;
  nil(): boolean;
  serialize(): object;
  dateValue(): Date;
  dateNumericValue(): number;
  setDateNumericValue(ms: number): void;
}

export class GlideElement implements IGlideElement {
  private _name: string;
  private _value: any;
  private _displayValue: any;
  private _changed: boolean = false;
  private _link: any;
  private _parentRecord: any;

  constructor(name: string, value?: any, displayValue?: any, parentRecord?: any, link?: any) {
    this._name = name;
    this._value = null;
    this._displayValue = null;
    this._link = null;
    this._parentRecord = parentRecord;

    // Handle dict/object values from ServiceNow API
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      if ('value' in value) {
        this._value = value.value;
      }
      // Only set display value if it's different from value
      if ('display_value' in value && this._value !== value.display_value) {
        this._displayValue = value.display_value;
      }
      if ('link' in value) {
        this._link = value.link;
      }
    } else {
      this._value = value;
    }

    if (displayValue !== undefined) {
      this._displayValue = displayValue;
    }
    if (link !== undefined) {
      this._link = link;
    }
  }

  /**
   * Get the name of the field
   */
  getName(): string {
    return this._name;
  }

  /**
   * Get the value of the field
   */
  getValue(): any {
    if (this._value !== null && this._value !== undefined) {
      return this._value;
    }
    return this._displayValue; // if we are display only
  }

  /**
   * Get the display value of the field, if it has one, else just the value
   */
  getDisplayValue(): any {
    if (this._displayValue !== null && this._displayValue !== undefined) {
      return this._displayValue;
    }
    return this._value;
  }

  /**
   * Get the link of a field, if it has one, else null
   */
  getLink(): any {
    return this._link;
  }

  /**
   * Set the value for the field. Will also set the display_value to null
   */
  setValue(value: any): void {
    if (value instanceof GlideElement) {
      value = value.getValue();
    }

    if (this._value !== value) {
      this._changed = true;
      this._value = value;
      this._displayValue = null;
    }
  }

  /**
   * Set the display value for the field -- generally speaking does not have any affect upstream (to the server)
   */
  setDisplayValue(value: any): void {
    if (value instanceof GlideElement) {
      value = value.getDisplayValue();
    }
    if (this._displayValue !== value) {
      this._changed = true;
      this._displayValue = value;
    }
  }

  /**
   * Set the reference link for the field -- generally speaking does not have any affect upstream (to the server)
   */
  setLink(link: any): void {
    if (link instanceof GlideElement) {
      link = link.getLink();
    }
    if (this._link !== link) {
      this._changed = true;
      this._link = link;
    }
  }

  /**
   * Check if we have changed this value
   */
  changes(): boolean {
    return this._changed;
  }

  /**
   * Returns true if the value is null, undefined, or zero length
   */
  nil(): boolean {
    const value = this._value;
    return value === null || value === undefined || 
           (typeof value === 'string' && value.length === 0) ||
           (Array.isArray(value) && value.length === 0);
  }

  /**
   * Returns a dict with the value, display_value, link keys
   */
  serialize(): object {
    const result: any = {
      value: this.getValue(),
      display_value: this.getDisplayValue()
    };

    if (this.getLink() !== null && this.getLink() !== undefined) {
      result.link = this.getLink();
    }

    return result;
  }

  /**
   * Returns the current value as a Date object
   */
  dateValue(): Date {
    const value = this.getValue();
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error(`Cannot convert '${value}' to Date`);
      }
      return date;
    }
    if (typeof value === 'number') {
      return new Date(value);
    }
    throw new Error(`Cannot convert '${typeof value}' to Date`);
  }

  /**
   * Returns the number of milliseconds since January 1, 1970, 00:00:00 GMT for a duration field
   */
  dateNumericValue(): number {
    return this.dateValue().getTime();
  }

  /**
   * Set date value from numeric milliseconds
   */
  setDateNumericValue(ms: number): void {
    this.setValue(new Date(ms));
  }

  /**
   * String representation returns the value
   */
  toString(): string {
    const value = this.getValue();
    return value !== null && value !== undefined ? String(value) : '';
  }

  /**
   * JSON serialization
   */
  toJSON(): any {
    return this.serialize();
  }

  /**
   * Value conversion for comparisons
   */
  valueOf(): any {
    return this.getValue();
  }
}