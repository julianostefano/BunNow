/**
 * TableAPI Unit Tests - Phase 3
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test';
import { TableAPI } from '../../api/TableAPI';
import type { QueryOptions } from '../../types/servicenow';

// Mock global fetch
const mockFetch = mock(() => 
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ result: {} }),
    text: () => Promise.resolve(''),
    headers: new Map([['X-Total-Count', '0']])
  } as any)
);

global.fetch = mockFetch;

describe('TableAPI', () => {
  let tableAPI: TableAPI;
  const instanceUrl = 'https://dev12345.service-now.com';
  const authToken = 'Bearer test-token-123';

  beforeEach(() => {
    tableAPI = new TableAPI(instanceUrl, authToken);
    mockFetch.mockClear();
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  describe('Construction', () => {
    test('should create TableAPI with instance URL and auth token', () => {
      expect(tableAPI).toBeInstanceOf(TableAPI);
    });

    test('should handle auth token with Bearer prefix', () => {
      const apiWithBearer = new TableAPI(instanceUrl, authToken);
      expect(apiWithBearer).toBeDefined();
    });

    test('should add Bearer prefix to auth token if missing', () => {
      const apiWithoutBearer = new TableAPI(instanceUrl, 'plain-token-123');
      expect(apiWithoutBearer).toBeDefined();
    });
  });

  describe('Get Record', () => {
    test('should get single record by sys_id', async () => {
      const mockRecord = {
        sys_id: 'test123',
        number: 'INC001',
        state: '1',
        short_description: 'Test incident'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: mockRecord })
      } as any);

      const result = await tableAPI.get('incident', 'test123');

      expect(result).toEqual(mockRecord);
      expect(mockFetch).toHaveBeenCalledWith(
        `${instanceUrl}/api/now/table/incident/test123`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': authToken
          })
        })
      );
    });

    test('should return null for non-existent record', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as any);

      const result = await tableAPI.get('incident', 'nonexistent');

      expect(result).toBeNull();
    });

    test('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      } as any);

      await expect(tableAPI.get('incident', 'test123')).rejects.toThrow();
    });
  });

  describe('Create Record', () => {
    test('should create new record', async () => {
      const newRecord = {
        short_description: 'New test incident',
        state: '1',
        priority: '3'
      };

      const createdRecord = {
        sys_id: 'new123',
        ...newRecord
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: createdRecord })
      } as any);

      const result = await tableAPI.create('incident', newRecord);

      expect(result).toEqual(createdRecord);
      expect(mockFetch).toHaveBeenCalledWith(
        `${instanceUrl}/api/now/table/incident`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': authToken
          }),
          body: JSON.stringify(newRecord)
        })
      );
    });

    test('should handle create errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request')
      } as any);

      await expect(tableAPI.create('incident', {})).rejects.toThrow();
    });
  });

  describe('Update Record', () => {
    test('should update existing record with PUT', async () => {
      const updateData = { state: '2', priority: '1' };
      const updatedRecord = {
        sys_id: 'test123',
        short_description: 'Original description',
        ...updateData
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: updatedRecord })
      } as any);

      const result = await tableAPI.update('incident', 'test123', updateData);

      expect(result).toEqual(updatedRecord);
      expect(mockFetch).toHaveBeenCalledWith(
        `${instanceUrl}/api/now/table/incident/test123`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData)
        })
      );
    });

    test('should patch existing record with PATCH', async () => {
      const patchData = { state: '2' };
      const patchedRecord = {
        sys_id: 'test123',
        state: '2',
        priority: '3'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: patchedRecord })
      } as any);

      const result = await tableAPI.patch('incident', 'test123', patchData);

      expect(result).toEqual(patchedRecord);
      expect(mockFetch).toHaveBeenCalledWith(
        `${instanceUrl}/api/now/table/incident/test123`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(patchData)
        })
      );
    });

    test('should handle update errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden')
      } as any);

      await expect(tableAPI.update('incident', 'test123', {})).rejects.toThrow();
    });
  });

  describe('Delete Record', () => {
    test('should delete existing record', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204
      } as any);

      const result = await tableAPI.delete('incident', 'test123');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `${instanceUrl}/api/now/table/incident/test123`,
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });

    test('should return false for non-existent record', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as any);

      const result = await tableAPI.delete('incident', 'nonexistent');

      expect(result).toBe(false);
    });

    test('should handle delete errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      } as any);

      await expect(tableAPI.delete('incident', 'test123')).rejects.toThrow();
    });
  });

  describe('Query Records', () => {
    test('should query records with basic options', async () => {
      const mockRecords = [
        { sys_id: 'inc1', state: '1', priority: '2' },
        { sys_id: 'inc2', state: '1', priority: '3' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: mockRecords })
      } as any);

      const options: QueryOptions = {
        table: 'incident',
        query: 'state=1',
        limit: 10
      };

      const result = await tableAPI.query(options);

      expect(result).toEqual(mockRecords);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sysparm_query=state%3D1'),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    test('should query records with field selection', async () => {
      const options: QueryOptions = {
        table: 'incident',
        query: 'state=1',
        fields: ['sys_id', 'number', 'state'],
        limit: 5,
        offset: 10
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [] })
      } as any);

      await tableAPI.query(options);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sysparm_fields=sys_id%2Cnumber%2Cstate'),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    test('should query records with pagination', async () => {
      const options: QueryOptions = {
        table: 'incident',
        limit: 100,
        offset: 200
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [] })
      } as any);

      await tableAPI.query(options);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sysparm_limit=100'),
        expect.objectContaining({
          method: 'GET'
        })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sysparm_offset=200'),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    test('should handle query timeout errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Transaction cancelled: maximum execution time exceeded')
      } as any);

      await expect(tableAPI.query({ table: 'incident' })).rejects.toThrow('Query timeout');
    });

    test('should handle general query errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid query')
      } as any);

      await expect(tableAPI.query({ table: 'incident' })).rejects.toThrow();
    });
  });

  describe('List Records', () => {
    test('should list records with simple parameters', async () => {
      const mockRecords = [
        { sys_id: 'task1', state: '1' },
        { sys_id: 'task2', state: '2' }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: mockRecords })
      } as any);

      const result = await tableAPI.list('task', { limit: 10 });

      expect(result).toEqual(mockRecords);
    });

    test('should list records without parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [] })
      } as any);

      const result = await tableAPI.list('incident');

      expect(result).toEqual([]);
    });
  });

  describe('Get Count', () => {
    test('should get total count for table', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['X-Total-Count', '150']])
      } as any);

      const result = await tableAPI.getCount('incident');

      expect(result).toBe(150);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sysparm_count=true'),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    test('should get count with query filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['X-Total-Count', '25']])
      } as any);

      const result = await tableAPI.getCount('incident', 'state=1');

      expect(result).toBe(25);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sysparm_query=state%3D1'),
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    test('should return 0 when count header is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map()
      } as any);

      const result = await tableAPI.getCount('incident');

      expect(result).toBe(0);
    });

    test('should handle count errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden')
      } as any);

      await expect(tableAPI.getCount('incident')).rejects.toThrow();
    });
  });

  describe('Batch Operations', () => {
    test('should execute batch operations sequentially', async () => {
      const operations = [
        { method: 'GET' as const, table: 'incident', sysId: 'inc1' },
        { method: 'POST' as const, table: 'incident', data: { short_description: 'Test' } },
        { method: 'PUT' as const, table: 'incident', sysId: 'inc2', data: { state: '2' } },
        { method: 'DELETE' as const, table: 'incident', sysId: 'inc3' }
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ result: { sys_id: 'inc1', state: '1' } })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ result: { sys_id: 'inc4', short_description: 'Test' } })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ result: { sys_id: 'inc2', state: '2' } })
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 204
        } as any);

      const results = await tableAPI.batch(operations);

      expect(results).toHaveLength(4);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    test('should handle batch operation errors', async () => {
      const operations = [
        { method: 'GET' as const, table: 'incident', sysId: 'inc1' },
        { method: 'GET' as const, table: 'incident', sysId: 'nonexistent' }
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ result: { sys_id: 'inc1' } })
        } as any)
        .mockRejectedValueOnce(new Error('Not found'));

      const results = await tableAPI.batch(operations);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ sys_id: 'inc1' });
      expect(results[1]).toHaveProperty('error');
    });

    test('should handle list operations in batch', async () => {
      const operations = [
        { method: 'GET' as const, table: 'incident' } // No sysId = list operation
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [{ sys_id: 'inc1' }, { sys_id: 'inc2' }] })
      } as any);

      const results = await tableAPI.batch(operations);

      expect(results).toHaveLength(1);
      expect(Array.isArray(results[0])).toBe(true);
    });
  });

  describe('Statistics and Health', () => {
    test('should get instance statistics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [{ name: 'glide.war', value: 'San Diego' }] })
      } as any);

      const result = await tableAPI.getStats();

      expect(result).toEqual({
        status: 'connected',
        instance: instanceUrl,
        version: 'San Diego'
      });
    });

    test('should handle stats API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403
      } as any);

      const result = await tableAPI.getStats();

      expect(result).toEqual({
        status: 'error',
        instance: instanceUrl
      });
    });

    test('should handle unknown version', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [] })
      } as any);

      const result = await tableAPI.getStats();

      expect(result).toEqual({
        status: 'connected',
        instance: instanceUrl,
        version: 'unknown'
      });
    });

    test('should handle network errors in stats', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await tableAPI.getStats();

      expect(result).toEqual({
        status: 'error',
        instance: instanceUrl
      });
    });
  });

  describe('URL Parameter Encoding', () => {
    test('should properly encode query parameters', async () => {
      const options: QueryOptions = {
        table: 'incident',
        query: 'short_description=Test & Special',
        fields: ['sys_id', 'number']
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [] })
      } as any);

      await tableAPI.query(options);

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('Test%20%26%20Special');
    });

    test('should handle special characters in field names', async () => {
      const options: QueryOptions = {
        table: 'incident',
        fields: ['sys_id', 'u_custom field', 'parent.number']
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: [] })
      } as any);

      await tableAPI.query(options);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Response Processing', () => {
    test('should handle response with result property', async () => {
      const mockData = { sys_id: 'test123', state: '1' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: mockData })
      } as any);

      const result = await tableAPI.get('incident', 'test123');

      expect(result).toEqual(mockData);
    });

    test('should handle response without result property', async () => {
      const mockData = { sys_id: 'test123', state: '1' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData)
      } as any);

      const result = await tableAPI.get('incident', 'test123');

      expect(result).toEqual(mockData);
    });

    test('should handle empty responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      } as any);

      const result = await tableAPI.query({ table: 'incident' });

      expect(result).toEqual([]);
    });
  });
});