/**
 * Ticket Query Service - Handles all query and analytics operations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { TicketStorageCore, TicketDocument, TicketQuery, QueryResult } from './TicketStorageCore';

export class TicketQueryService extends TicketStorageCore {

  /**
   * Advanced query with optimized filtering and pagination
   */
  async queryTickets(query: TicketQuery): Promise<QueryResult<TicketDocument>> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      // Build MongoDB filter
      const filter: any = {};

      if (query.ticketType && query.ticketType.length > 0) {
        filter.ticketType = { $in: query.ticketType };
      }

      if (query.state && query.state.length > 0) {
        filter.state = { $in: query.state };
      }

      if (query.assignment_group && query.assignment_group.length > 0) {
        filter.assignment_group = { $in: query.assignment_group };
      }

      if (query.priority && query.priority.length > 0) {
        filter.priority = { $in: query.priority };
      }

      if (query.dateRange) {
        const dateField = query.dateRange.field;
        const dateFilter: any = {};
        
        if (query.dateRange.start) {
          dateFilter.$gte = query.dateRange.start;
        }
        if (query.dateRange.end) {
          dateFilter.$lte = query.dateRange.end;
        }
        
        if (Object.keys(dateFilter).length > 0) {
          filter[dateField] = dateFilter;
        }
      }

      if (query.textSearch) {
        filter.$text = { $search: query.textSearch };
      }

      // Build sort
      const sort = query.sort || { sys_created_on: -1 };

      // Execute query with pagination
      const limit = Math.min(query.limit || 50, 1000); // Max 1000 results
      const skip = query.skip || 0;

      const [data, total] = await Promise.all([
        this.ticketsCollection
          .find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .toArray(),
        this.ticketsCollection.countDocuments(filter)
      ]);

      return {
        data,
        total,
        hasMore: skip + data.length < total,
        page: Math.floor(skip / limit) + 1,
        limit
      };

    } catch (error) {
      console.error(' Error querying tickets:', error);
      throw error;
    }
  }

  /**
   * Get dashboard statistics with optimized aggregation
   */
  async getDashboardStats(groupBy?: string): Promise<any> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      const pipeline: any[] = [
        {
          $group: {
            _id: groupBy ? `$${groupBy}` : null,
            totalTickets: { $sum: 1 },
            activeTickets: {
              $sum: { $cond: [{ $ne: ["$state", 7] }, 1, 0] } // Assuming 7 is closed
            },
            byType: {
              $push: {
                ticketType: "$ticketType",
                state: "$state",
                priority: "$priority"
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            totalTickets: 1,
            activeTickets: 1,
            closedTickets: { $subtract: ["$totalTickets", "$activeTickets"] },
            incidentCount: {
              $size: {
                $filter: {
                  input: "$byType",
                  cond: { $eq: ["$$this.ticketType", "incident"] }
                }
              }
            },
            changeTaskCount: {
              $size: {
                $filter: {
                  input: "$byType",
                  cond: { $eq: ["$$this.ticketType", "change_task"] }
                }
              }
            },
            scTaskCount: {
              $size: {
                $filter: {
                  input: "$byType",
                  cond: { $eq: ["$$this.ticketType", "sc_task"] }
                }
              }
            }
          }
        }
      ];

      const results = await this.ticketsCollection.aggregate(pipeline).toArray();
      return results[0] || {
        totalTickets: 0,
        activeTickets: 0,
        closedTickets: 0,
        incidentCount: 0,
        changeTaskCount: 0,
        scTaskCount: 0
      };

    } catch (error) {
      console.error(' Error getting dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Get collection health metrics
   */
  async getHealthMetrics(): Promise<any> {
    await this.ensureConnected();
    if (!this.db || !this.ticketsCollection) throw new Error('Service not initialized');

    try {
      const [collStats, indexes, recentSyncs] = await Promise.all([
        this.db.command({ collStats: 'tickets' }),
        this.ticketsCollection.listIndexes().toArray(),
        this.ticketsCollection
          .find({ _syncedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
          .count()
      ]);

      return {
        collectionSize: collStats.size,
        documentCount: collStats.count,
        indexCount: indexes.length,
        avgDocumentSize: collStats.avgObjSize,
        recentSyncs24h: recentSyncs,
        indexes: indexes.map((idx: any) => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false
        }))
      };

    } catch (error) {
      console.error(' Error getting health metrics:', error);
      throw error;
    }
  }

  /**
   * Get tickets with SLA information
   */
  async getTicketsWithSLAs(query: Partial<TicketQuery> = {}): Promise<QueryResult<TicketDocument>> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      // Build filter with SLA-specific criteria
      const filter: any = {
        'slms': { $exists: true, $not: { $size: 0 } }
      };

      // Add query filters
      if (query.ticketType && query.ticketType.length > 0) {
        filter.ticketType = { $in: query.ticketType };
      }

      if (query.state && query.state.length > 0) {
        filter.state = { $in: query.state };
      }

      if (query.assignment_group && query.assignment_group.length > 0) {
        filter.assignment_group = { $in: query.assignment_group };
      }

      const limit = Math.min(query.limit || 50, 1000);
      const skip = query.skip || 0;

      const [data, total] = await Promise.all([
        this.ticketsCollection
          .find(filter)
          .sort({ sys_updated_on: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        this.ticketsCollection.countDocuments(filter)
      ]);

      return {
        data,
        total,
        hasMore: skip + data.length < total,
        page: Math.floor(skip / limit) + 1,
        limit
      };

    } catch (error) {
      console.error(' Error getting tickets with SLAs:', error);
      throw error;
    }
  }

  /**
   * Advanced analytics - Tickets by time period
   */
  async getTicketsTrends(
    period: 'day' | 'week' | 'month' = 'week',
    ticketType?: 'incident' | 'change_task' | 'sc_task'
  ): Promise<any> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      const dateFormat = period === 'day' ? '%Y-%m-%d' : 
                        period === 'week' ? '%Y-%U' : '%Y-%m';

      const pipeline: any[] = [
        {
          $match: ticketType ? { ticketType } : {}
        },
        {
          $group: {
            _id: {
              period: { $dateToString: { format: dateFormat, date: '$sys_created_on' } },
              ticketType: '$ticketType'
            },
            count: { $sum: 1 },
            activeCount: {
              $sum: { $cond: [{ $ne: ['$state', 7] }, 1, 0] }
            },
            closedCount: {
              $sum: { $cond: [{ $eq: ['$state', 7] }, 1, 0] }
            }
          }
        },
        {
          $sort: { '_id.period': 1 }
        },
        {
          $limit: 50
        }
      ];

      const results = await this.ticketsCollection.aggregate(pipeline).toArray();
      
      return {
        period,
        data: results.map(r => ({
          period: r._id.period,
          ticketType: r._id.ticketType,
          total: r.count,
          active: r.activeCount,
          closed: r.closedCount
        }))
      };

    } catch (error) {
      console.error(' Error getting ticket trends:', error);
      throw error;
    }
  }

  /**
   * Get tickets by assignment group with statistics
   */
  async getTicketsByAssignmentGroup(limit: number = 20): Promise<any> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      const pipeline = [
        {
          $group: {
            _id: '$assignment_group',
            totalTickets: { $sum: 1 },
            activeTickets: {
              $sum: { $cond: [{ $ne: ['$state', 7] }, 1, 0] }
            },
            avgPriority: { $avg: '$priority' },
            ticketTypes: {
              $push: '$ticketType'
            },
            lastUpdate: { $max: '$sys_updated_on' }
          }
        },
        {
          $project: {
            _id: 1,
            totalTickets: 1,
            activeTickets: 1,
            closedTickets: { $subtract: ['$totalTickets', '$activeTickets'] },
            avgPriority: { $round: ['$avgPriority', 2] },
            incidentCount: {
              $size: {
                $filter: {
                  input: '$ticketTypes',
                  cond: { $eq: ['$$this', 'incident'] }
                }
              }
            },
            changeTaskCount: {
              $size: {
                $filter: {
                  input: '$ticketTypes',
                  cond: { $eq: ['$$this', 'change_task'] }
                }
              }
            },
            scTaskCount: {
              $size: {
                $filter: {
                  input: '$ticketTypes',
                  cond: { $eq: ['$$this', 'sc_task'] }
                }
              }
            },
            lastUpdate: 1
          }
        },
        {
          $sort: { totalTickets: -1 }
        },
        {
          $limit: limit
        }
      ];

      const results = await this.ticketsCollection.aggregate(pipeline).toArray();
      
      return results.map(r => ({
        assignmentGroup: r._id,
        totalTickets: r.totalTickets,
        activeTickets: r.activeTickets,
        closedTickets: r.closedTickets,
        avgPriority: r.avgPriority,
        breakdown: {
          incidents: r.incidentCount,
          changeTasks: r.changeTaskCount,
          scTasks: r.scTaskCount
        },
        lastUpdate: r.lastUpdate
      }));

    } catch (error) {
      console.error(' Error getting tickets by assignment group:', error);
      throw error;
    }
  }

  /**
   * Search tickets with text search and filters
   */
  async searchTickets(
    searchText: string,
    filters?: Partial<TicketQuery>
  ): Promise<QueryResult<TicketDocument>> {
    await this.ensureConnected();
    if (!this.ticketsCollection) throw new Error('Tickets collection not initialized');

    try {
      const query: TicketQuery = {
        textSearch: searchText,
        limit: filters?.limit || 50,
        skip: filters?.skip || 0,
        ...filters
      };

      return await this.queryTickets(query);

    } catch (error) {
      console.error(' Error searching tickets:', error);
      throw error;
    }
  }
}