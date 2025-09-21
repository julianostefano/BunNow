/**
 * Advanced OpenSearch Query Builder for ServiceNow Data
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { logger } from "../../utils/Logger";

export interface SearchOptions {
  size?: number;
  from?: number;
  timeout?: string;
  sort?: Array<Record<string, any>>;
  _source?: string[] | boolean;
  highlight?: Record<string, any>;
  explain?: boolean;
  trackTotalHits?: boolean | number;
}

export interface AggregationConfig {
  [key: string]: {
    terms?: {
      field: string;
      size?: number;
      order?: Record<string, "asc" | "desc">;
    };
    date_histogram?: {
      field: string;
      calendar_interval?: string;
      fixed_interval?: string;
      format?: string;
      time_zone?: string;
    };
    range?: {
      field: string;
      ranges: Array<{ from?: number; to?: number; key?: string }>;
    };
    stats?: {
      field: string;
    };
    cardinality?: {
      field: string;
    };
    avg?: {
      field: string;
    };
    sum?: {
      field: string;
    };
    max?: {
      field: string;
    };
    min?: {
      field: string;
    };
    nested?: {
      path: string;
    };
    filter?: any;
    aggs?: AggregationConfig;
  };
}

export interface FilterCondition {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "in"
    | "not_in"
    | "range"
    | "exists"
    | "not_exists"
    | "wildcard"
    | "regexp"
    | "fuzzy"
    | "prefix";
  value?: any;
  values?: any[];
  options?: {
    boost?: number;
    fuzziness?: string | number;
    minimumShouldMatch?: string | number;
    caseInsensitive?: boolean;
  };
}

export interface TextSearchConfig {
  fields: string[];
  query: string;
  type?:
    | "match"
    | "match_phrase"
    | "multi_match"
    | "query_string"
    | "simple_query_string";
  boost?: number;
  operator?: "and" | "or";
  minimumShouldMatch?: string | number;
  fuzziness?: string | number;
  analyzer?: string;
}

export interface DateRangeFilter {
  field: string;
  from?: string | Date;
  to?: string | Date;
  format?: string;
  timeZone?: string;
  relation?: "within" | "intersects" | "contains";
}

export class SearchQuery {
  private query: any = { match_all: {} };
  private filters: any[] = [];
  private mustNot: any[] = [];
  private should: any[] = [];
  private aggregations: AggregationConfig = {};
  private options: SearchOptions = {};

  /**
   * Create a new search query builder
   */
  static builder(): SearchQuery {
    return new SearchQuery();
  }

  /**
   * Add text search across multiple fields
   */
  search(config: TextSearchConfig): SearchQuery {
    const searchQuery = this.buildTextQuery(config);

    if (this.query.match_all) {
      this.query = searchQuery;
    } else {
      // Combine with existing query
      this.query = {
        bool: {
          must: [this.query, searchQuery],
        },
      };
    }

    return this;
  }

  /**
   * Add ServiceNow-specific incident search
   */
  searchIncidents(
    searchTerm: string,
    options: {
      includeResolved?: boolean;
      priority?: string[];
      assignmentGroup?: string[];
      dateRange?: DateRangeFilter;
    } = {},
  ): SearchQuery {
    // Text search in incident fields
    this.search({
      fields: [
        "number^3",
        "short_description^2",
        "description",
        "caller_id.text",
      ],
      query: searchTerm,
      type: "multi_match",
      operator: "and",
    });

    // Filter by state if not including resolved
    if (!options.includeResolved) {
      this.filter({
        field: "state",
        operator: "not_in",
        values: ["6", "7", "8"],
      }); // Resolved, Closed, Canceled
    }

    // Filter by priority
    if (options.priority && options.priority.length > 0) {
      this.filter({
        field: "priority",
        operator: "in",
        values: options.priority,
      });
    }

    // Filter by assignment group
    if (options.assignmentGroup && options.assignmentGroup.length > 0) {
      this.filter({
        field: "assignment_group",
        operator: "in",
        values: options.assignmentGroup,
      });
    }

    // Filter by date range
    if (options.dateRange) {
      this.dateRange(options.dateRange);
    }

    return this;
  }

  /**
   * Add ServiceNow-specific problem search
   */
  searchProblems(
    searchTerm: string,
    options: {
      includeResolved?: boolean;
      priority?: string[];
      stateFilter?: string[];
    } = {},
  ): SearchQuery {
    // Text search in problem fields
    this.search({
      fields: ["number^3", "short_description^2", "description", "root_cause"],
      query: searchTerm,
      type: "multi_match",
      operator: "and",
    });

    // Filter by state
    if (options.stateFilter) {
      this.filter({
        field: "state",
        operator: "in",
        values: options.stateFilter,
      });
    } else if (!options.includeResolved) {
      this.filter({ field: "state", operator: "not_in", values: ["3", "4"] }); // Resolved, Closed
    }

    // Filter by priority
    if (options.priority && options.priority.length > 0) {
      this.filter({
        field: "priority",
        operator: "in",
        values: options.priority,
      });
    }

    return this;
  }

  /**
   * Add filter condition
   */
  filter(condition: FilterCondition): SearchQuery {
    const filterQuery = this.buildFilterQuery(condition);
    this.filters.push(filterQuery);
    return this;
  }

  /**
   * Add multiple filter conditions (AND logic)
   */
  filters(conditions: FilterCondition[]): SearchQuery {
    conditions.forEach((condition) => this.filter(condition));
    return this;
  }

  /**
   * Add date range filter
   */
  dateRange(range: DateRangeFilter): SearchQuery {
    const rangeQuery: any = {
      range: {
        [range.field]: {},
      },
    };

    if (range.from) {
      rangeQuery.range[range.field].gte =
        range.from instanceof Date ? range.from.toISOString() : range.from;
    }

    if (range.to) {
      rangeQuery.range[range.field].lte =
        range.to instanceof Date ? range.to.toISOString() : range.to;
    }

    if (range.format) {
      rangeQuery.range[range.field].format = range.format;
    }

    if (range.timeZone) {
      rangeQuery.range[range.field].time_zone = range.timeZone;
    }

    if (range.relation) {
      rangeQuery.range[range.field].relation = range.relation;
    }

    this.filters.push(rangeQuery);
    return this;
  }

  /**
   * Add "must not" condition
   */
  mustNot(condition: FilterCondition): SearchQuery {
    const filterQuery = this.buildFilterQuery(condition);
    this.mustNot.push(filterQuery);
    return this;
  }

  /**
   * Add "should" condition (OR logic)
   */
  should(condition: FilterCondition, minimumShouldMatch?: number): SearchQuery {
    const filterQuery = this.buildFilterQuery(condition);
    this.should.push(filterQuery);

    if (minimumShouldMatch !== undefined) {
      this.options.minimumShouldMatch = minimumShouldMatch;
    }

    return this;
  }

  /**
   * Add aggregation
   */
  aggregation(name: string, config: AggregationConfig[string]): SearchQuery {
    this.aggregations[name] = config;
    return this;
  }

  /**
   * Add multiple aggregations
   */
  aggregations(aggregations: AggregationConfig): SearchQuery {
    Object.assign(this.aggregations, aggregations);
    return this;
  }

  /**
   * Add ServiceNow-specific incident analytics aggregations
   */
  incidentAnalytics(): SearchQuery {
    return this.aggregations({
      by_state: {
        terms: {
          field: "state",
          size: 20,
        },
      },
      by_priority: {
        terms: {
          field: "priority",
          size: 10,
        },
      },
      by_assignment_group: {
        terms: {
          field: "assignment_group",
          size: 50,
          order: { _count: "desc" },
        },
      },
      by_category: {
        terms: {
          field: "category",
          size: 30,
        },
      },
      created_over_time: {
        date_histogram: {
          field: "sys_created_on",
          calendar_interval: "1d",
          format: "yyyy-MM-dd",
          time_zone: "UTC",
        },
      },
      resolution_stats: {
        filter: {
          exists: { field: "resolved_at" },
        },
        aggs: {
          avg_resolution_time: {
            avg: {
              script: {
                source:
                  "(doc['resolved_at'].value.millis - doc['sys_created_on'].value.millis) / 1000 / 3600",
              },
            },
          },
        },
      },
    });
  }

  /**
   * Add ServiceNow-specific change request analytics
   */
  changeAnalytics(): SearchQuery {
    return this.aggregations({
      by_type: {
        terms: {
          field: "type",
          size: 20,
        },
      },
      by_risk: {
        terms: {
          field: "risk",
          size: 10,
        },
      },
      by_state: {
        terms: {
          field: "state",
          size: 15,
        },
      },
      success_rate: {
        filters: {
          filters: {
            successful: { term: { state: "successful" } },
            failed: { term: { state: "failed" } },
            cancelled: { term: { state: "cancelled" } },
          },
        },
      },
      changes_over_time: {
        date_histogram: {
          field: "start_date",
          calendar_interval: "1w",
          format: "yyyy-MM-dd",
        },
      },
    });
  }

  /**
   * Set pagination
   */
  paginate(from: number, size: number): SearchQuery {
    this.options.from = from;
    this.options.size = size;
    return this;
  }

  /**
   * Set sorting
   */
  sort(
    field: string,
    order: "asc" | "desc" = "desc",
    options?: { unmapped_type?: string },
  ): SearchQuery {
    if (!this.options.sort) {
      this.options.sort = [];
    }

    const sortConfig: any = { [field]: { order } };
    if (options?.unmapped_type) {
      sortConfig[field].unmapped_type = options.unmapped_type;
    }

    this.options.sort.push(sortConfig);
    return this;
  }

  /**
   * Set multiple sorting criteria
   */
  sortBy(
    sorts: Array<{
      field: string;
      order: "asc" | "desc";
      unmapped_type?: string;
    }>,
  ): SearchQuery {
    this.options.sort = sorts.map((s) => ({
      [s.field]: {
        order: s.order,
        ...(s.unmapped_type && { unmapped_type: s.unmapped_type }),
      },
    }));
    return this;
  }

  /**
   * Configure source filtering
   */
  source(fields: string[] | boolean): SearchQuery {
    this.options._source = fields;
    return this;
  }

  /**
   * Configure highlighting
   */
  highlight(config: {
    fields: string[];
    preTag?: string;
    postTag?: string;
    fragmentSize?: number;
    numberOfFragments?: number;
  }): SearchQuery {
    const highlightFields = config.fields.reduce((acc, field) => {
      acc[field] = {
        fragment_size: config.fragmentSize || 150,
        number_of_fragments: config.numberOfFragments || 3,
      };
      return acc;
    }, {} as any);

    this.options.highlight = {
      pre_tags: [config.preTag || "<em>"],
      post_tags: [config.postTag || "</em>"],
      fields: highlightFields,
    };

    return this;
  }

  /**
   * Set query timeout
   */
  timeout(timeout: string): SearchQuery {
    this.options.timeout = timeout;
    return this;
  }

  /**
   * Enable query explanation
   */
  explain(enable: boolean = true): SearchQuery {
    this.options.explain = enable;
    return this;
  }

  /**
   * Configure total hits tracking
   */
  trackTotalHits(track: boolean | number = true): SearchQuery {
    this.options.trackTotalHits = track;
    return this;
  }

  /**
   * Create a saved search for ServiceNow incident trends
   */
  static incidentTrendAnalysis(days: number = 30): SearchQuery {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    return SearchQuery.builder()
      .dateRange({
        field: "sys_created_on",
        from: fromDate.toISOString(),
        to: new Date().toISOString(),
      })
      .aggregations({
        daily_incidents: {
          date_histogram: {
            field: "sys_created_on",
            calendar_interval: "1d",
            format: "yyyy-MM-dd",
          },
          aggs: {
            by_priority: {
              terms: {
                field: "priority",
                size: 5,
              },
            },
            avg_resolution_time: {
              avg: {
                script: {
                  source:
                    "if (doc['resolved_at'].size() > 0) { (doc['resolved_at'].value.millis - doc['sys_created_on'].value.millis) / 1000 / 3600 } else { null }",
                },
              },
            },
          },
        },
        top_categories: {
          terms: {
            field: "category",
            size: 10,
            order: { _count: "desc" },
          },
        },
        resolution_stats: {
          filter: {
            exists: { field: "resolved_at" },
          },
          aggs: {
            resolution_time_ranges: {
              range: {
                field: "resolved_at",
                ranges: [
                  { to: 3600000, key: "< 1 hour" },
                  { from: 3600000, to: 86400000, key: "1-24 hours" },
                  { from: 86400000, to: 259200000, key: "1-3 days" },
                  { from: 259200000, key: "> 3 days" },
                ],
              },
            },
          },
        },
      })
      .sort("sys_created_on", "desc")
      .size(0); // Only aggregations, no individual results
  }

  /**
   * Create performance monitoring query for ServiceNow system health
   */
  static systemHealthQuery(hours: number = 24): SearchQuery {
    const fromDate = new Date();
    fromDate.setHours(fromDate.getHours() - hours);

    return SearchQuery.builder()
      .dateRange({
        field: "@timestamp",
        from: fromDate.toISOString(),
        to: new Date().toISOString(),
      })
      .aggregations({
        error_rate: {
          filters: {
            filters: {
              errors: { range: { response_code: { gte: 400 } } },
              total: { match_all: {} },
            },
          },
        },
        response_time_stats: {
          stats: {
            field: "response_time",
          },
        },
        response_time_percentiles: {
          range: {
            field: "response_time",
            ranges: [
              { to: 100, key: "< 100ms" },
              { from: 100, to: 500, key: "100-500ms" },
              { from: 500, to: 1000, key: "500ms-1s" },
              { from: 1000, to: 5000, key: "1-5s" },
              { from: 5000, key: "> 5s" },
            ],
          },
        },
        hourly_activity: {
          date_histogram: {
            field: "@timestamp",
            calendar_interval: "1h",
            format: "HH:mm",
          },
          aggs: {
            avg_response_time: {
              avg: { field: "response_time" },
            },
            error_count: {
              filter: {
                range: { response_code: { gte: 400 } },
              },
            },
          },
        },
      });
  }

  /**
   * Build the final OpenSearch query
   */
  build(): any {
    const finalQuery: any = {};

    // Build the main query with bool logic
    if (
      this.filters.length > 0 ||
      this.mustNot.length > 0 ||
      this.should.length > 0 ||
      !this.query.match_all
    ) {
      finalQuery.query = {
        bool: {
          ...(this.query.match_all ? {} : { must: [this.query] }),
          ...(this.filters.length > 0 && { filter: this.filters }),
          ...(this.mustNot.length > 0 && { must_not: this.mustNot }),
          ...(this.should.length > 0 && { should: this.should }),
          ...(this.options.minimumShouldMatch !== undefined && {
            minimum_should_match: this.options.minimumShouldMatch,
          }),
        },
      };
    } else {
      finalQuery.query = this.query;
    }

    // Add aggregations
    if (Object.keys(this.aggregations).length > 0) {
      finalQuery.aggs = this.aggregations;
    }

    // Add options
    Object.assign(finalQuery, this.options);

    return finalQuery;
  }

  /**
   * Get a human-readable description of the query
   */
  describe(): string {
    const parts: string[] = [];

    // Describe text search
    if (!this.query.match_all) {
      parts.push(`Text search configured`);
    }

    // Describe filters
    if (this.filters.length > 0) {
      parts.push(`${this.filters.length} filter(s) applied`);
    }

    if (this.mustNot.length > 0) {
      parts.push(`${this.mustNot.length} exclusion(s) applied`);
    }

    if (this.should.length > 0) {
      parts.push(`${this.should.length} optional condition(s)`);
    }

    // Describe aggregations
    const aggCount = Object.keys(this.aggregations).length;
    if (aggCount > 0) {
      parts.push(
        `${aggCount} aggregation(s): ${Object.keys(this.aggregations).join(", ")}`,
      );
    }

    // Describe pagination/sorting
    if (this.options.size !== undefined) {
      parts.push(`Limited to ${this.options.size} results`);
    }

    if (this.options.sort && this.options.sort.length > 0) {
      const sortFields = this.options.sort
        .map((s: any) => Object.keys(s)[0])
        .join(", ");
      parts.push(`Sorted by: ${sortFields}`);
    }

    return parts.length > 0 ? parts.join("; ") : "Match all documents";
  }

  private buildTextQuery(config: TextSearchConfig): any {
    const baseQuery: any = {
      boost: config.boost || 1.0,
    };

    switch (config.type || "multi_match") {
      case "match":
        return {
          match: {
            [config.fields[0]]: {
              query: config.query,
              operator: config.operator || "or",
              fuzziness: config.fuzziness,
              minimum_should_match: config.minimumShouldMatch,
              analyzer: config.analyzer,
              ...baseQuery,
            },
          },
        };

      case "match_phrase":
        return {
          match_phrase: {
            [config.fields[0]]: {
              query: config.query,
              analyzer: config.analyzer,
              ...baseQuery,
            },
          },
        };

      case "multi_match":
        return {
          multi_match: {
            query: config.query,
            fields: config.fields,
            type: "best_fields",
            operator: config.operator || "or",
            fuzziness: config.fuzziness,
            minimum_should_match: config.minimumShouldMatch,
            analyzer: config.analyzer,
            ...baseQuery,
          },
        };

      case "query_string":
        return {
          query_string: {
            query: config.query,
            fields: config.fields,
            default_operator: config.operator?.toUpperCase() || "OR",
            analyzer: config.analyzer,
            ...baseQuery,
          },
        };

      case "simple_query_string":
        return {
          simple_query_string: {
            query: config.query,
            fields: config.fields,
            default_operator: config.operator || "or",
            analyzer: config.analyzer,
            ...baseQuery,
          },
        };

      default:
        return {
          multi_match: {
            query: config.query,
            fields: config.fields,
            ...baseQuery,
          },
        };
    }
  }

  private buildFilterQuery(condition: FilterCondition): any {
    const { field, operator, value, values, options } = condition;

    switch (operator) {
      case "equals":
        return { term: { [field]: { value, boost: options?.boost } } };

      case "not_equals":
        return { bool: { must_not: [{ term: { [field]: value } }] } };

      case "in":
        return { terms: { [field]: values, boost: options?.boost } };

      case "not_in":
        return { bool: { must_not: [{ terms: { [field]: values } }] } };

      case "range":
        return { range: { [field]: value } };

      case "exists":
        return { exists: { field } };

      case "not_exists":
        return { bool: { must_not: [{ exists: { field } }] } };

      case "wildcard":
        return {
          wildcard: {
            [field]: {
              value,
              boost: options?.boost,
              case_insensitive: options?.caseInsensitive,
            },
          },
        };

      case "regexp":
        return {
          regexp: {
            [field]: {
              value,
              boost: options?.boost,
              case_insensitive: options?.caseInsensitive,
            },
          },
        };

      case "fuzzy":
        return {
          fuzzy: {
            [field]: {
              value,
              fuzziness: options?.fuzziness || "AUTO",
              boost: options?.boost,
            },
          },
        };

      case "prefix":
        return {
          prefix: {
            [field]: {
              value,
              boost: options?.boost,
              case_insensitive: options?.caseInsensitive,
            },
          },
        };

      default:
        logger.warn(`Unknown filter operator: ${operator}`);
        return { term: { [field]: value } };
    }
  }
}

// Utility functions for common ServiceNow search patterns
export class ServiceNowSearchPatterns {
  /**
   * Search for incidents created in the last N days with specific criteria
   */
  static recentIncidents(
    days: number = 7,
    criteria: {
      priority?: string[];
      state?: string[];
      assignmentGroup?: string[];
      searchText?: string;
    } = {},
  ): SearchQuery {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    let query = SearchQuery.builder().dateRange({
      field: "sys_created_on",
      from: fromDate.toISOString(),
      to: new Date().toISOString(),
    });

    if (criteria.searchText) {
      query = query.searchIncidents(criteria.searchText, {
        priority: criteria.priority,
        assignmentGroup: criteria.assignmentGroup,
      });
    } else {
      if (criteria.priority) {
        query = query.filter({
          field: "priority",
          operator: "in",
          values: criteria.priority,
        });
      }
      if (criteria.state) {
        query = query.filter({
          field: "state",
          operator: "in",
          values: criteria.state,
        });
      }
      if (criteria.assignmentGroup) {
        query = query.filter({
          field: "assignment_group",
          operator: "in",
          values: criteria.assignmentGroup,
        });
      }
    }

    return query.sort("sys_created_on", "desc").highlight({
      fields: ["short_description", "description"],
      fragmentSize: 200,
      numberOfFragments: 2,
    });
  }

  /**
   * Search for high-priority open tickets
   */
  static highPriorityOpenTickets(
    table: "incident" | "problem" | "change_request" = "incident",
  ): SearchQuery {
    const openStates = {
      incident: ["1", "2", "3"], // New, In Progress, On Hold
      problem: ["1", "2"], // Open, Known Error
      change_request: ["1", "2", "3"], // New, Assess, Authorize
    };

    return SearchQuery.builder()
      .filter({ field: "priority", operator: "in", values: ["1", "2"] }) // Critical, High
      .filter({ field: "state", operator: "in", values: openStates[table] })
      .sort("priority", "asc")
      .sort("sys_created_on", "asc"); // Oldest first for high priority
  }

  /**
   * Search for tickets assigned to specific user
   */
  static userAssignedTickets(
    userId: string,
    options: {
      includeGroup?: boolean;
      states?: string[];
      lastNDays?: number;
    } = {},
  ): SearchQuery {
    let query = SearchQuery.builder().filter({
      field: "assigned_to",
      operator: "equals",
      value: userId,
    });

    if (options.includeGroup) {
      // Add OR condition for assignment group where user is member
      query = query.should({
        field: "assignment_group.members",
        operator: "equals",
        value: userId,
      });
    }

    if (options.states) {
      query = query.filter({
        field: "state",
        operator: "in",
        values: options.states,
      });
    }

    if (options.lastNDays) {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - options.lastNDays);
      query = query.dateRange({
        field: "sys_updated_on",
        from: fromDate.toISOString(),
      });
    }

    return query.sort("priority", "asc").sort("sys_updated_on", "desc");
  }

  /**
   * Search for tickets by customer/caller
   */
  static customerTickets(
    customerId: string,
    options: {
      ticketType?: "incident" | "problem" | "change_request";
      lastNMonths?: number;
      includeResolved?: boolean;
    } = {},
  ): SearchQuery {
    let query = SearchQuery.builder().filter({
      field: "caller_id",
      operator: "equals",
      value: customerId,
    });

    if (options.lastNMonths) {
      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - options.lastNMonths);
      query = query.dateRange({
        field: "sys_created_on",
        from: fromDate.toISOString(),
      });
    }

    if (!options.includeResolved) {
      // Exclude resolved/closed states (varies by ticket type)
      const excludedStates = {
        incident: ["6", "7", "8"], // Resolved, Closed, Canceled
        problem: ["3", "4"], // Resolved, Closed
        change_request: ["3", "4", "7"], // Complete, Closed, Canceled
      };

      if (options.ticketType) {
        query = query.filter({
          field: "state",
          operator: "not_in",
          values: excludedStates[options.ticketType],
        });
      }
    }

    return query
      .sort("sys_created_on", "desc")
      .aggregation("by_priority", {
        terms: { field: "priority", size: 5 },
      })
      .aggregation("by_state", {
        terms: { field: "state", size: 10 },
      });
  }
}
