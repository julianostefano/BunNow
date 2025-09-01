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
import { logger } from '../utils/Logger';
import type { ServiceNowRecord } from '../types/servicenow';

export interface IGlideRecord {
  // Navigation
  next(): boolean;
  nextAsync(): Promise<boolean>;
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
  
  // Bulk Operations
  setBulkUpdateValue(field: string, value: any): void;
  
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
  private _autoPaginate: boolean = true;
  private _currentOffset: number = 0;
  private _hasMorePages: boolean = true;
  private _isPaginating: boolean = false;

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
    this._populateCurrentRecord();
  }

  get autoPaginate(): boolean {
    return this._autoPaginate;
  }

  set autoPaginate(enabled: boolean) {
    this._autoPaginate = enabled;
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

  async nextAsync(): Promise<boolean> {
    const length = this._results.length;
    if (length > 0 && this._current + 1 < length) {
      this._current++;
      this._populateCurrentRecord();
      return true;
    }
    
    // Auto-pagination: if we're at the end of current batch but more data might exist
    if (this._autoPaginate && this._hasMorePages && !this._isPaginating) {
      try {
        return await this._fetchNextPageAsync();
      } catch (error) {
        console.error('Auto-pagination error:', error);
        return false;
      }
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
    try {
      if (this._results.length === 0) {
        return false;
      }

      // Create batch for multiple deletes
      const batch = new (await import('../api/BatchAPI')).BatchAPI(
        this._client.table,
        this._client.attachment
      );

      let deleteCount = 0;
      const totalRecords = this._results.length;

      // Add all records to batch delete
      for (const record of this._results) {
        if (record.sys_id) {
          batch.addRequest({
            id: `delete_multiple_${record.sys_id}`,
            method: 'DELETE',
            table: this._table,
            sysId: record.sys_id,
            callback: (result, error) => {
              if (!error) {
                deleteCount++;
              } else {
                console.warn(`Failed to delete record ${record.sys_id}:`, error.message);
              }
            }
          });
        }
      }

      // Execute batch delete
      const results = await batch.execute();
      const successCount = results.filter(r => r.success).length;

      if (successCount > 0) {
        // Clear local results as records were deleted
        this._results = [];
        this._current = -1;
        this._total = 0;
      }

      return successCount === totalRecords;
    } catch (error) {
      console.error('Error in deleteMultiple:', error);
      return false;
    }
  }

  async updateMultiple(): Promise<boolean> {
    try {
      if (this._results.length === 0) {
        return false;
      }

      // Collect changed fields from current query conditions
      const updateData = this._collectBulkUpdateData();
      if (Object.keys(updateData).length === 0) {
        console.warn('No update data provided for updateMultiple');
        return false;
      }

      // Create batch for multiple updates
      const batch = new (await import('../api/BatchAPI')).BatchAPI(
        this._client.table,
        this._client.attachment
      );

      let updateCount = 0;
      const totalRecords = this._results.length;

      // Add all records to batch update
      for (const record of this._results) {
        if (record.sys_id) {
          batch.addRequest({
            id: `update_multiple_${record.sys_id}`,
            method: 'PUT',
            table: this._table,
            sysId: record.sys_id,
            data: updateData,
            callback: (result, error) => {
              if (!error) {
                updateCount++;
                // Update local cache with returned data
                const index = this._results.findIndex(r => r.sys_id === record.sys_id);
                if (index >= 0) {
                  this._results[index] = { ...this._results[index], ...result };
                }
              } else {
                console.warn(`Failed to update record ${record.sys_id}:`, error.message);
              }
            }
          });
        }
      }

      // Execute batch update
      const results = await batch.execute();
      const successCount = results.filter(r => r.success).length;

      // Refresh current record if it was updated
      if (this._current >= 0 && this._current < this._results.length) {
        this._populateCurrentRecord();
      }

      return successCount === totalRecords;
    } catch (error) {
      console.error('Error in updateMultiple:', error);
      return false;
    }
  }

  // Query Methods
  async query(): Promise<void> {
    try {
      // Reset pagination state
      this._currentOffset = 0;
      this._hasMorePages = true;
      this._isPaginating = false;
      
      this._results = await this._executeQuery();
      this._current = -1;
      this._page++;
      
      // Update pagination state based on results
      if (this._results.length < this._batchSize) {
        this._hasMorePages = false;
        this._total = this._results.length;
      } else {
        // More data might be available
        this._total = this._limit || (this._results.length + this._batchSize);
      }
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
    if (!this._autoPaginate || this._isPaginating) {
      return false;
    }
    
    try {
      // For synchronous next(), we need to use a synchronous approach
      // This is a simplified implementation - in real usage, consider using nextAsync()
      return this._fetchNextPageSync();
    } catch (error) {
      console.error('Error fetching next page:', error);
      return false;
    }
  }

  private _fetchNextPageSync(): boolean {
    // This is a simplified sync version - not recommended for large datasets
    // Use nextAsync() for better performance with large paginated data
    console.warn('Synchronous pagination detected - consider using nextAsync() for better performance');
    return false;
  }

  private _fetchNextPage(): boolean {
    if (!this._autoPaginate || this._isPaginating || !this._hasMorePages) {
      return false;
    }
    
    // Intelligent prefetching - start loading next page before we reach the end
    if (this._autoPaginate && this._hasMorePages && !this._isPaginating) {
      const remainingRecords = this._results.length - (this._current + 1);
      if (remainingRecords <= this._prefetchThreshold) {
        // Prefetch next page asynchronously
        this._fetchNextPageAsync().catch(error => {
          logger.warn('Prefetch failed', 'GlideRecord', {
            table: this._table,
            error: error.message
          });
        });
      }
    }
    
    // For sync method, we can only indicate if more data MIGHT be available
    // The actual fetch would need to be async
    return this._hasMorePages && this._results.length >= this._batchSize;
  }

  private async _fetchNextPageAsync(): Promise<boolean> {
    if (!this._autoPaginate || this._isPaginating || !this._hasMorePages) {
      return false;
    }

    this._isPaginating = true;
    const operation = logger.operation('fetch_next_page', this._table, undefined, {
      currentResults: this._results.length,
      batchSize: this._batchSize,
      currentOffset: this._currentOffset
    });
    
    try {
      // Calculate next offset
      this._currentOffset = this._results.length;
      
      // Build query for next page
      const query = this._queryBuilder.generateQuery();
      const options = {
        table: this._table,
        query,
        fields: this._fieldLimits,
        limit: this._batchSize,
        offset: this._currentOffset
      };
      
      // Fetch next page with retry logic
      let retryCount = 0;
      let nextBatch: ServiceNowRecord[] | undefined;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          nextBatch = await this._client.serviceNow.query(options);
          break; // Success, exit retry loop
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw error; // Re-throw after max retries
          }
          
          // Exponential backoff
          const delay = Math.pow(2, retryCount) * 1000;
          operation.progress(`Retrying page fetch (${retryCount}/${maxRetries}) in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      if (nextBatch && nextBatch.length > 0) {
        // Append new results to existing ones
        this._results.push(...nextBatch);
        
        // Update pagination state
        if (nextBatch.length < this._batchSize) {
          this._hasMorePages = false;
        }
        
        // Update pagination metrics
        this._paginationStats.pagesLoaded++;
        this._paginationStats.totalRecordsLoaded = this._results.length;
        
        // Move to next record (first of new batch)
        this._current++;
        this._populateCurrentRecord();
        
        // Update total count if we have a limit
        if (this._limit) {
          this._total = Math.min(this._limit, this._results.length + (this._hasMorePages ? this._batchSize : 0));
        } else {
          this._total = this._results.length + (this._hasMorePages ? this._batchSize : 0);
        }
        
        // Intelligent cache management for large datasets
        if (this._results.length > this._maxCacheSize) {
          this._trimOldResults();
        }
        
        operation.success('Page fetched successfully', {
          newRecords: nextBatch.length,
          totalRecords: this._results.length,
          hasMorePages: this._hasMorePages,
          retryCount
        });
        
        this._isPaginating = false;
        return true;
      } else {
        // No more data available
        this._hasMorePages = false;
        this._paginationStats.completed = true;
        
        operation.success('Pagination completed - no more data', {
          totalRecords: this._results.length,
          pagesLoaded: this._paginationStats.pagesLoaded
        });
        
        this._isPaginating = false;
        return false;
      }
    } catch (error) {
      this._isPaginating = false;
      operation.error('Page fetch failed', error);
      logger.error('Error in async pagination', error, 'GlideRecord', {
        table: this._table,
        currentResults: this._results.length,
        currentOffset: this._currentOffset
      });
      return false;
    }
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

  private _collectBulkUpdateData(): ServiceNowRecord {
    // Use bulk update data if set, otherwise collect changed fields
    if (this._bulkUpdateData && Object.keys(this._bulkUpdateData).length > 0) {
      return { ...this._bulkUpdateData };
    }
    
    // Fallback: collect changed fields from elements
    const data: ServiceNowRecord = {};
    for (const [key, element] of this._elements.entries()) {
      if (element.changes() && key !== 'sys_id') {
        data[key] = element.getValue();
      }
    }
    
    return data;
  }

  setBulkUpdateValue(field: string, value: any): void {
    // Set a value that will be used for updateMultiple
    if (!this._bulkUpdateData) {
      this._bulkUpdateData = {};
    }
    this._bulkUpdateData[field] = value;
  }

  /**
   * Trim old results to maintain memory efficiency for large datasets
   */
  private _trimOldResults(): void {
    if (this._results.length <= this._maxCacheSize) {
      return;
    }

    const trimSize = Math.floor(this._maxCacheSize * 0.3); // Remove 30% of oldest records
    const removedRecords = this._results.splice(0, trimSize);
    
    // Adjust current index
    this._current -= trimSize;
    if (this._current < 0) {
      this._current = 0;
    }
    
    // Update offset to account for trimmed records
    this._currentOffset -= trimSize;
    if (this._currentOffset < 0) {
      this._currentOffset = 0;
    }
    
    logger.debug(`Trimmed ${removedRecords.length} old records from memory`, 'GlideRecord', {
      table: this._table,
      remainingRecords: this._results.length,
      currentIndex: this._current
    });
  }

  /**
   * Get pagination statistics
   */
  getPaginationStats(): any {
    return {
      ...this._paginationStats,
      currentRecords: this._results.length,
      currentIndex: this._current,
      hasMorePages: this._hasMorePages,
      isPaginating: this._isPaginating,
      batchSize: this._batchSize,
      autoPaginateEnabled: this._autoPaginate
    };
  }

  /**
   * Enable/disable intelligent prefetching
   */
  setPrefetchThreshold(threshold: number): void {
    this._prefetchThreshold = Math.max(1, threshold);
    logger.debug(`Prefetch threshold set to ${threshold}`, 'GlideRecord', {
      table: this._table
    });
  }

  /**
   * Set maximum cache size for memory management
   */
  setMaxCacheSize(size: number): void {
    this._maxCacheSize = Math.max(1000, size); // Minimum 1000 records
    logger.debug(`Max cache size set to ${size}`, 'GlideRecord', {
      table: this._table
    });
  }

  /**
   * Force load next page (useful for testing or manual control)
   */
  async loadNextPage(): Promise<boolean> {
    return this._fetchNextPageAsync();
  }

  /**
   * Preload multiple pages for better performance
   */
  async preloadPages(pageCount: number = 3): Promise<number> {
    if (!this._hasMorePages || this._isPaginating) {
      return 0;
    }

    const operation = logger.operation('preload_pages', this._table, undefined, {
      requestedPages: pageCount,
      currentResults: this._results.length
    });

    let loadedPages = 0;
    
    try {
      for (let i = 0; i < pageCount && this._hasMorePages; i++) {
        const loaded = await this._fetchNextPageAsync();
        if (loaded) {
          loadedPages++;
        } else {
          break;
        }
        
        // Small delay between requests to be respectful
        if (i < pageCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      operation.success('Pages preloaded', {
        requestedPages: pageCount,
        loadedPages,
        totalRecords: this._results.length
      });

      return loadedPages;
    } catch (error) {
      operation.error('Preload pages failed', error);
      return loadedPages;
    }
  }

  private _bulkUpdateData?: ServiceNowRecord;
  private _paginationStats = {
    pagesLoaded: 0,
    totalRecordsLoaded: 0,
    cacheHits: 0,
    networkRequests: 0,
    averagePageLoadTime: 0,
    completed: false
  };
  private _maxCacheSize: number = 10000; // Maximum records to keep in memory
  private _prefetchThreshold: number = 10; // Start prefetching when within X records of end
}