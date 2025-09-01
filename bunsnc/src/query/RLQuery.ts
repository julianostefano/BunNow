/**
 * Related List Query implementation for ServiceNow
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { Query } from './Query';

export class RLQuery extends Query {
  private _relatedTable: string;
  private _relatedField: string;
  private operatorCondition: string;
  private stopAtRelationship: boolean;

  constructor(
    table: string,
    relatedTable: string,
    relatedField: string,
    operatorCondition: string,
    stopAtRelationship: boolean = false
  ) {
    super(table);
    this._relatedTable = relatedTable;
    this._relatedField = relatedField;
    this.operatorCondition = operatorCondition;
    this.stopAtRelationship = stopAtRelationship;
  }

  /**
   * Generate ServiceNow Related List query string
   */
  generateQuery(encodedQuery?: string, orderBy?: string): string {
    const query = super.generateQuery(encodedQuery, orderBy);
    const identifier = `${this._relatedTable}.${this._relatedField}`;
    const stopCondition = this.stopAtRelationship ? ',m2m' : '';
    const queryCondition = query ? `^${query}` : '';
    
    return `RLQUERY${identifier},${this.operatorCondition}${stopCondition}${queryCondition}^ENDRLQUERY`;
  }
}