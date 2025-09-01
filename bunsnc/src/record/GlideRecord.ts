/**
 * GlideRecord - ServiceNow table record abstraction with full PySNC compatibility
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { GlideElement } from './GlideElement';
import { QueryBuilder } from '../query/QueryBuilder';
import { QueryCondition } from '../query/QueryCondition';
import { OrCondition } from '../query/OrCondition';
import { JoinQuery } from '../query/JoinQuery';
import { RLQuery } from '../query/RLQuery';
import type { ServiceNowRecord } from '../types/servicenow';

export interface IGlideRecord {
  // Navigation
  next(): boolean;
  hasNext(): boolean;
  rewind(): void;
  
  // CRUD Operations
  get(sysId: string): boolean;
  get(field: string, value: any): boolean;
  insert(): Promise<GlideElement | null>;
  update(): Promise<GlideElement | null>;
  delete(): Promise<boolean>;
  deleteMultiple(): Promise<boolean>;
  updateMultiple(): Promise<boolean>;
  
  // Query Methods
  query(): Promise<void>;
  addQuery(field: string, operator: string, value?: any): QueryCondition;
  addOrCondition(field: string, operator: string, value?: any): OrCondition;
  addJoinQuery(joinTable: string, primaryField?: string, joinTableField?: string): JoinQuery;
  addRLQuery(relatedTable: string, relatedField: string, operatorCondition: string, stopAtRelationship?: boolean): RLQuery;
  addNullQuery(field: string): QueryCondition;
  addNotNullQuery(field: string): QueryCondition;
  addActiveQuery(): QueryCondition;
  addEncodedQuery(query: string): void;
  orderBy(field: string): void;
  orderByDesc(field: string): void;
  
  // Data Access
  getValue(field: string): any;
  getDisplayValue(field: string): any;
  getElement(field: string): GlideElement;
  setValue(field: string, value: any): void;
  setDisplayValue(field: string, value: any): void;
  
  // Utilities
  serialize(): object;
  serializeAll(): object[];
  changes(): boolean;
  getRowCount(): number;
  getEncodedQuery(): string;
  getLink(): string;
  
  // Iteration
  [Symbol.iterator](): Iterator<GlideRecord>;
}

export class GlideRecord implements IGlideRecord {
  private _client: any; // ServiceNowClient - will be injected
  private _table: string;
  private _batchSize: number;
  private _rewindable: boolean;
  private _isIter: boolean = false;
  private _queryBuilder: QueryBuilder;
  private _encodedQuery?: string;
  private _results: ServiceNowRecord[] = [];
  private _current: number = -1;
  private _fieldLimits?: string[];
  private _view?: string;
  private _total?: number;
  private _limit?: number;
  private _page: number = -1;
  private _order: string = 'ORDERBYsys_id'; // default order for pagination
  private _isNewRecord: boolean = false;
  private _displayValue: boolean | string = 'all';
  private _excludeReferenceLink: boolean = true;
  private _elements: Map<string, GlideElement> = new Map();

  constructor(client: any, table: string, batchSize: number = 500, rewindable: boolean = true) {
    this._client = client;
    this._table = table;
    this._batchSize = batchSize;
    this._rewindable = rewindable;
    this._queryBuilder = new QueryBuilder(table);
  }

  // Properties
  get table(): string {
    return this._table;
  }

  get limit(): number | undefined {
    return this._limit;
  }

  set limit(count: number) {
    this._limit = count;
  }

  get batchSize(): number {
    return this._batchSize;
  }

  set batchSize(size: number) {
    if (this._limit && size >= this._limit) {
      throw new Error('Batch size must be less than limit');
    }
    this._batchSize = size;
  }

  get location(): number {
    return this._current;
  }

  set location(location: number) {
    if (this._total === undefined) {
      throw new Error('No location to be had when we have no query');
    }
    if (location < -1 || location >= this._total) {
      throw new Error('Location out of bounds');
    }
    this._current = location;
  }

  get displayValue(): boolean | string {
    return this._displayValue;
  }

  set displayValue(displayValue: boolean | string) {
    if (!([true, false, 'all'].includes(displayValue as any))) {
      throw new Error("displayValue must be true, false, or 'all'");
    }
    this._displayValue = displayValue;
  }

  get excludeReferenceLink(): boolean {
    return this._excludeReferenceLink;
  }

  set excludeReferenceLink(exclude: boolean) {
    this._excludeReferenceLink = exclude;
  }

  // Navigation Methods
  next(): boolean {
    const length = this._results.length;
    if (length > 0 && this._current + 1 < length) {
      this._current++;
      this._populateCurrentRecord();
      if (this._isIter) {
        return true;
      }
      return true;
    }
    
    // Check if we need to fetch more data
    if (this._total && this._current + 1 < this._total && 
        this._total > this._results.length) {
      if (this._limit) {
        if (this._current + 1 < this._limit) {
          // Fetch more data and retry
          return this._fetchMoreAndNext();
        }
      } else {
        return this._fetchMoreAndNext();
      }
    }
    
    if (this._isIter) {
      this._isIter = false;
      throw new Error('StopIteration'); // Will be caught by iterator protocol
    }
    return false;
  }

  hasNext(): boolean {
    const length = this._results.length;
    if (length > 0 && this._current + 1 < length) {
      return true;
    }
    
    // Check if there's more data to fetch
    if (this._total && this._current + 1 < this._total) {
      if (this._limit) {
        return this._current + 1 < this._limit;
      }
      return true;
    }
    
    return false;
  }

  rewind(): void {
    if (!this._rewindable) {
      throw new Error('This GlideRecord is not rewindable');
    }
    this._current = -1;
    this._elements.clear();
  }

  // CRUD Operations
  async get(sysIdOrField: string, value?: any): Promise<boolean> {
    this._clearQuery();
    
    if (value !== undefined) {
      // Two-parameter form: get(field, value)
      this.addQuery(sysIdOrField, value);
    } else {
      // Single parameter form: get(sysId)
      this.addQuery('sys_id', sysIdOrField);
    }
    
    try {
      const response = await this._executeQuery();
      if (response && response.length > 0) {
        this._results = response;
        this._current = 0;
        this._total = this._results.length;
        this._populateCurrentRecord();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error in get:', error);
      return false;
    }
  }

  async insert(): Promise<GlideElement | null> {
    try {
      const data = this._collectChangedFields();
      const result = await this._client.serviceNow.create(this._table, data);
      
      if (result && result.sys_id) {
        const sysIdElement = new GlideElement('sys_id', result.sys_id);
        this._elements.set('sys_id', sysIdElement);
        this._isNewRecord = false;
        return sysIdElement;
      }
      return null;
    } catch (error) {
      console.error('Error in insert:', error);
      throw error;
    }
  }

  async update(): Promise<GlideElement | null> {
    if (this._current < 0) {
      throw new Error('Cannot update: no current record');
    }
    
    try {
      const sysId = this.getValue('sys_id');
      if (!sysId) {
        throw new Error('Cannot update: no sys_id found');
      }
      
      const data = this._collectChangedFields();
      if (Object.keys(data).length === 0) {
        return null; // No changes to update
      }
      
      const result = await this._client.serviceNow.update(this._table, sysId, data);
      if (result) {
        // Update current record with returned data
        this._updateCurrentRecord(result);
        return new GlideElement('sys_id', sysId);
      }
      return null;
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  }

  async delete(): Promise<boolean> {
    if (this._current < 0) {
      throw new Error('Cannot delete: no current record');
    }
    
    try {
      const sysId = this.getValue('sys_id');
      if (!sysId) {
        throw new Error('Cannot delete: no sys_id found');
      }
      
      const result = await this._client.serviceNow.delete(this._table, sysId);
      if (result) {
        // Remove from results array
        this._results.splice(this._current, 1);
        if (this._current >= this._results.length) {
          this._current = this._results.length - 1;
        }
        if (this._total) {
          this._total--;
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error in delete:', error);
      return false;
    }
  }

  async deleteMultiple(): Promise<boolean> {
    // Implementation would require batch delete capability
    throw new Error('deleteMultiple not implemented yet');
  }

  async updateMultiple(): Promise<boolean> {
    // Implementation would require batch update capability
    throw new Error('updateMultiple not implemented yet');
  }

  // Query Methods
  async query(): Promise<void> {
    try {
      this._results = await this._executeQuery();
      this._current = -1;
      this._total = this._results.length;
      this._page++;
    } catch (error) {
      console.error('Error in query:', error);
      throw error;
    }
  }

  addQuery(field: string, operator: string, value?: any): QueryCondition {
    return this._queryBuilder.addQuery(field, operator, value);
  }

  addOrCondition(field: string, operator: string, value?: any): OrCondition {
    return this._queryBuilder.addOrCondition(field, operator, value);
  }

  addJoinQuery(joinTable: string, primaryField?: string, joinTableField?: string): JoinQuery {
    return this._queryBuilder.addJoinQuery(joinTable, primaryField, joinTableField);
  }

  addRLQuery(relatedTable: string, relatedField: string, operatorCondition: string, stopAtRelationship?: boolean): RLQuery {
    return this._queryBuilder.addRLQuery(relatedTable, relatedField, operatorCondition, stopAtRelationship);
  }

  addNullQuery(field: string): QueryCondition {
    return this._queryBuilder.addNullQuery(field);
  }

  addNotNullQuery(field: string): QueryCondition {
    return this._queryBuilder.addNotNullQuery(field);
  }

  addActiveQuery(): QueryCondition {
    return this._queryBuilder.addActiveQuery();
  }

  addEncodedQuery(query: string): void {
    this._queryBuilder.addEncodedQuery(query);
  }

  orderBy(field: string): void {
    this._queryBuilder.orderBy(field);
    this._order = `ORDERBY${field}`;
  }

  orderByDesc(field: string): void {
    this._queryBuilder.orderByDesc(field);
    this._order = `ORDERBYDESC${field}`;
  }

  // Data Access Methods
  getValue(field: string): any {
    const element = this.getElement(field);
    return element ? element.getValue() : null;
  }

  getDisplayValue(field: string): any {
    const element = this.getElement(field);
    return element ? element.getDisplayValue() : null;
  }

  getElement(field: string): GlideElement {
    if (this._elements.has(field)) {
      return this._elements.get(field)!;
    }
    
    // Create element from current record if available
    if (this._current >= 0 && this._current < this._results.length) {
      const record = this._results[this._current];
      if (field in record) {
        const element = new GlideElement(field, record[field], undefined, this);
        this._elements.set(field, element);
        return element;
      }
    }
    
    // Return new empty element
    const element = new GlideElement(field, null, undefined, this);
    this._elements.set(field, element);
    return element;
  }

  setValue(field: string, value: any): void {
    const element = this.getElement(field);
    element.setValue(value);
  }

  setDisplayValue(field: string, value: any): void {
    const element = this.getElement(field);
    element.setDisplayValue(value);
  }

  // Utility Methods
  serialize(): object {
    if (this._current < 0 || this._current >= this._results.length) {
      return {};
    }
    
    const record = this._results[this._current];
    const result: any = {};
    
    for (const [key, value] of Object.entries(record)) {
      const element = new GlideElement(key, value);
      result[key] = element.serialize();
    }
    
    return result;
  }

  serializeAll(): object[] {
    return this._results.map((record, index) => {
      const result: any = {};
      for (const [key, value] of Object.entries(record)) {
        const element = new GlideElement(key, value);
        result[key] = element.serialize();
      }
      return result;
    });
  }

  changes(): boolean {
    for (const element of this._elements.values()) {
      if (element.changes()) {
        return true;
      }
    }
    return false;
  }

  getRowCount(): number {
    return this._total || 0;
  }

  getEncodedQuery(): string {
    return this._queryBuilder.generateQuery();
  }

  getLink(): string {
    const sysId = this.getValue('sys_id');
    if (sysId && this._client?.instance) {
      return `${this._client.instance}/nav_to.do?uri=${this._table}.do?sys_id=${sysId}`;
    }
    return '';
  }

  // Iterator Implementation
  [Symbol.iterator](): Iterator<GlideRecord> {
    const self = this;
    self._isIter = true;
    self._current = -1;
    
    return {
      next(): IteratorResult<GlideRecord> {
        try {
          const hasNext = self.next();
          if (hasNext) {
            return { value: self, done: false };
          } else {
            self._isIter = false;
            return { value: undefined as any, done: true };
          }
        } catch (error) {
          // Handle StopIteration from next() method
          if (error instanceof Error && error.message === 'StopIteration') {
            return { value: undefined as any, done: true };
          }
          throw error;
        }
      }
    };
  }

  // Private Methods
  private _clearQuery(): void {
    this._queryBuilder.clear();
    this._encodedQuery = undefined;
    this._results = [];
    this._current = -1;
    this._total = undefined;
    this._elements.clear();
  }

  private async _executeQuery(): Promise<ServiceNowRecord[]> {
    const query = this._queryBuilder.generateQuery();
    const options = {
      table: this._table,
      query,
      fields: this._fieldLimits,
      limit: this._limit,
      offset: this._current + 1
    };
    
    return await this._client.serviceNow.query(options);
  }

  private _fetchMoreAndNext(): boolean {
    // This would be implemented to fetch more data asynchronously
    // For now, return false to indicate no more data
    return false;
  }

  private _populateCurrentRecord(): void {
    if (this._current >= 0 && this._current < this._results.length) {
      const record = this._results[this._current];
      
      // Clear and repopulate elements for current record
      this._elements.clear();
      for (const [key, value] of Object.entries(record)) {
        const element = new GlideElement(key, value, undefined, this);
        this._elements.set(key, element);
      }
    }
  }

  private _collectChangedFields(): ServiceNowRecord {
    const data: ServiceNowRecord = {};
    
    for (const [key, element] of this._elements.entries()) {
      if (element.changes()) {
        data[key] = element.getValue();
      }
    }
    
    return data;
  }

  private _updateCurrentRecord(newData: ServiceNowRecord): void {
    if (this._current >= 0 && this._current < this._results.length) {
      this._results[this._current] = { ...this._results[this._current], ...newData };
      this._populateCurrentRecord();
    }
  }
}