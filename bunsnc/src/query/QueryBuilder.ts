/**
 * Advanced QueryBuilder for ServiceNow with full PySNC compatibility
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { Query } from './Query';
import { QueryCondition } from './QueryCondition';
import { OrCondition } from './OrCondition';
import { JoinQuery } from './JoinQuery';
import { RLQuery } from './RLQuery';

export interface IQueryBuilder {
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
  generateQuery(): string;
}

export class QueryBuilder implements IQueryBuilder {
  private query: Query;
  private encodedQuery?: string;
  private orderByClause?: string;

  constructor(table?: string) {
    this.query = new Query(table);
  }

  /**
   * Add a query condition
   * 
   * Supported operators:
   * - Numbers: =, !=, >, >=, <, <=
   * - Strings: =, !=, IN, NOT IN, STARTSWITH, ENDSWITH, CONTAINS, DOES NOT CONTAIN, INSTANCEOF, LIKE
   * - Special: ISEMPTY, ISNOTEMPTY
   */
  addQuery(field: string, operator: string, value?: any): QueryCondition {
    return this.query.addQuery(field, operator, value);
  }

  /**
   * Add an OR condition (must be called on an existing QueryCondition)
   */
  addOrCondition(field: string, operator: string, value?: any): OrCondition {
    // This should be called on a QueryCondition, but we'll create a new one for compatibility
    const condition = this.query.addQuery('__temp__', '=', 'true');
    return condition.addOrCondition(field, operator, value);
  }

  /**
   * Add a JOIN query
   */
  addJoinQuery(joinTable: string, primaryField?: string, joinTableField?: string): JoinQuery {
    return this.query.addJoinQuery(joinTable, primaryField, joinTableField);
  }

  /**
   * Add a Related List query
   */
  addRLQuery(relatedTable: string, relatedField: string, operatorCondition: string, stopAtRelationship: boolean = false): RLQuery {
    return this.query.addRLQuery(relatedTable, relatedField, operatorCondition, stopAtRelationship);
  }

  /**
   * Add a null query (field IS EMPTY)
   */
  addNullQuery(field: string): QueryCondition {
    return this.query.addNullQuery(field);
  }

  /**
   * Add a not null query (field IS NOT EMPTY)
   */
  addNotNullQuery(field: string): QueryCondition {
    return this.query.addNotNullQuery(field);
  }

  /**
   * Add an active=true query
   */
  addActiveQuery(): QueryCondition {
    return this.query.addActiveQuery();
  }

  /**
   * Add a pre-encoded query string
   */
  addEncodedQuery(query: string): void {
    this.encodedQuery = query;
  }

  /**
   * Add ascending order by clause
   */
  orderBy(field: string): void {
    this.orderByClause = `ORDERBY${field}`;
  }

  /**
   * Add descending order by clause
   */
  orderByDesc(field: string): void {
    this.orderByClause = `ORDERBY${field}^ORDERBYDESC${field}`;
  }

  /**
   * Generate the complete ServiceNow encoded query string
   */
  generateQuery(): string {
    return this.query.generateQuery(this.encodedQuery, this.orderByClause);
  }

  /**
   * Reset the query builder
   */
  clear(): void {
    this.query = new Query(this.query['_table']);
    this.encodedQuery = undefined;
    this.orderByClause = undefined;
  }

  /**
   * Static factory method
   */
  static create(table?: string): QueryBuilder {
    return new QueryBuilder(table);
  }
}