/**
 * GlideRecord Unit Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { GlideRecord } from '../../record/GlideRecord';
import { GlideElement } from '../../record/GlideElement';

// Mock ServiceNow client
const mockClient = {
  instance: 'https://dev12345.service-now.com',
  serviceNow: {
    query: mock(() => Promise.resolve([])),
    create: mock(() => Promise.resolve({ sys_id: 'new_id_123' })),
    read: mock(() => Promise.resolve({ sys_id: 'test_id', name: 'Test Record' })),
    update: mock(() => Promise.resolve({ sys_id: 'test_id', name: 'Updated Record' })),
    delete: mock(() => Promise.resolve(true))
  }
};

describe('GlideRecord', () => {
  let gr: GlideRecord;

  beforeEach(() => {
    gr = new GlideRecord(mockClient, 'incident');
    // Reset mocks
    mockClient.serviceNow.query.mockClear();
    mockClient.serviceNow.create.mockClear();
    mockClient.serviceNow.read.mockClear();
    mockClient.serviceNow.update.mockClear();
    mockClient.serviceNow.delete.mockClear();
  });

  describe('Basic Construction', () => {
    test('should create GlideRecord with table name', () => {
      expect(gr.table).toBe('incident');
      expect(gr.batchSize).toBe(500);
      expect(gr.location).toBe(-1);
    });

    test('should create with custom batch size', () => {
      const customGr = new GlideRecord(mockClient, 'task', 100);
      expect(customGr.batchSize).toBe(100);
    });

    test('should create with rewindable setting', () => {
      const nonRewindable = new GlideRecord(mockClient, 'task', 500, false);
      expect(() => nonRewindable.rewind()).toThrow('This GlideRecord is not rewindable');
    });
  });

  describe('Properties', () => {
    test('should get and set limit', () => {
      gr.limit = 10;
      expect(gr.limit).toBe(10);
    });

    test('should get and set batch size', () => {
      gr.batchSize = 100;
      expect(gr.batchSize).toBe(100);
    });

    test('should throw error if batch size >= limit', () => {
      gr.limit = 100;
      expect(() => { gr.batchSize = 100; }).toThrow();
      expect(() => { gr.batchSize = 150; }).toThrow();
    });

    test('should get and set display value', () => {
      gr.displayValue = true;
      expect(gr.displayValue).toBe(true);
      
      gr.displayValue = 'all';
      expect(gr.displayValue).toBe('all');
      
      expect(() => { gr.displayValue = 'invalid' as any; }).toThrow();
    });

    test('should get and set exclude reference link', () => {
      gr.excludeReferenceLink = false;
      expect(gr.excludeReferenceLink).toBe(false);
    });
  });

  describe('Query Building', () => {
    test('should add basic query', () => {
      const condition = gr.addQuery('state', '1');
      expect(condition).toBeDefined();
      expect(gr.getEncodedQuery()).toBe('state=1');
    });

    test('should add multiple queries', () => {
      gr.addQuery('state', '1');
      gr.addQuery('priority', '<=', '2');
      gr.addActiveQuery();
      
      const query = gr.getEncodedQuery();
      expect(query).toBe('state=1^priority<=2^active=true');
    });

    test('should add OR conditions', () => {
      const condition = gr.addQuery('state', '1');
      condition.addOrCondition('state', '2');
      
      const query = gr.getEncodedQuery();
      expect(query).toBe('state=1^ORstate=2');
    });

    test('should add JOIN queries', () => {
      const joinQuery = gr.addJoinQuery('sys_user', 'assigned_to', 'sys_id');
      joinQuery.addQuery('active', 'true');
      
      const query = gr.getEncodedQuery();
      expect(query).toBe('JOINincident.assigned_to=sys_user.sys_id!active=true');
    });

    test('should add RL queries', () => {
      const rlQuery = gr.addRLQuery('task_ci', 'ci_item', 'category=hardware');
      rlQuery.addQuery('active', 'true');
      
      const query = gr.getEncodedQuery();
      expect(query).toBe('RLQUERYtask_ci.ci_item,category=hardware^active=true^ENDRLQUERY');
    });

    test('should add null and not null queries', () => {
      gr.addNullQuery('resolved_at');
      gr.addNotNullQuery('assigned_to');
      
      const query = gr.getEncodedQuery();
      expect(query).toBe('resolved_atISEMPTY^assigned_toISNOTEMPTY');
    });

    test('should add encoded query', () => {
      gr.addQuery('state', '1');
      gr.addEncodedQuery('priority<=2');
      
      const query = gr.getEncodedQuery();
      expect(query).toBe('state=1^priority<=2');
    });

    test('should set order by', () => {
      gr.addQuery('state', '1');
      gr.orderBy('number');
      
      const query = gr.getEncodedQuery();
      expect(query).toBe('state=1^ORDERBYnumber');
    });

    test('should set order by desc', () => {
      gr.addQuery('state', '1');
      gr.orderByDesc('sys_created_on');
      
      const query = gr.getEncodedQuery();
      expect(query).toBe('state=1^ORDERBYsys_created_on^ORDERBYDESCsys_created_on');
    });
  });

  describe('Data Access', () => {
    beforeEach(() => {
      // Setup mock data
      const mockData = [
        {
          sys_id: 'test_id_1',
          number: 'INC001',
          state: '1',
          priority: '2',
          short_description: 'Test incident'
        }
      ];
      
      mockClient.serviceNow.query.mockResolvedValue(mockData);
    });

    test('should get element', () => {
      gr.setValue('test_field', 'test_value');
      const element = gr.getElement('test_field');
      
      expect(element).toBeInstanceOf(GlideElement);
      expect(element.getName()).toBe('test_field');
      expect(element.getValue()).toBe('test_value');
    });

    test('should get and set values', () => {
      gr.setValue('test_field', 'test_value');
      expect(gr.getValue('test_field')).toBe('test_value');
    });

    test('should get and set display values', () => {
      gr.setDisplayValue('test_field', 'Display Value');
      expect(gr.getDisplayValue('test_field')).toBe('Display Value');
    });

    test('should track changes', () => {
      expect(gr.changes()).toBe(false);
      
      gr.setValue('test_field', 'value');
      expect(gr.changes()).toBe(true);
    });

    test('should get link', () => {
      gr.setValue('sys_id', 'test_sys_id');
      const link = gr.getLink();
      expect(link).toContain('test_sys_id');
      expect(link).toContain('incident');
    });
  });

  describe('CRUD Operations', () => {
    test('should perform get by sys_id', async () => {
      const mockRecord = {
        sys_id: 'test_id',
        number: 'INC001',
        state: '1'
      };
      
      mockClient.serviceNow.query.mockResolvedValue([mockRecord]);
      
      const result = await gr.get('test_id');
      
      expect(result).toBe(true);
      expect(gr.getValue('sys_id')).toBe('test_id');
      expect(gr.getValue('number')).toBe('INC001');
    });

    test('should perform get by field and value', async () => {
      const mockRecord = {
        sys_id: 'test_id',
        number: 'INC001'
      };
      
      mockClient.serviceNow.query.mockResolvedValue([mockRecord]);
      
      const result = await gr.get('number', 'INC001');
      
      expect(result).toBe(true);
      expect(gr.getValue('number')).toBe('INC001');
    });

    test('should return false when record not found', async () => {
      mockClient.serviceNow.query.mockResolvedValue([]);
      
      const result = await gr.get('nonexistent_id');
      
      expect(result).toBe(false);
    });

    test('should insert new record', async () => {
      gr.setValue('short_description', 'New incident');
      gr.setValue('state', '1');
      
      const result = await gr.insert();
      
      expect(result).toBeInstanceOf(GlideElement);
      expect(result?.getValue()).toBe('new_id_123');
      expect(mockClient.serviceNow.create).toHaveBeenCalledWith('incident', {
        short_description: 'New incident',
        state: '1'
      });
    });

    test('should update existing record', async () => {
      // Setup existing record
      const mockRecord = {
        sys_id: 'test_id',
        short_description: 'Original description'
      };
      
      mockClient.serviceNow.query.mockResolvedValue([mockRecord]);
      await gr.get('test_id');
      
      // Verify record is loaded
      expect(gr.location).toBe(0);
      
      // Modify and update
      gr.setValue('short_description', 'Updated description');
      
      const result = await gr.update();
      
      expect(result).toBeInstanceOf(GlideElement);
      expect(mockClient.serviceNow.update).toHaveBeenCalledWith('incident', 'test_id', {
        short_description: 'Updated description'
      });
    });

    test('should delete record', async () => {
      // Setup existing record
      const mockRecord = { sys_id: 'test_id' };
      mockClient.serviceNow.query.mockResolvedValue([mockRecord]);
      await gr.get('test_id');
      
      // Verify record is loaded
      expect(gr.location).toBe(0);
      
      const result = await gr.delete();
      
      expect(result).toBe(true);
      expect(mockClient.serviceNow.delete).toHaveBeenCalledWith('incident', 'test_id');
    });

    test('should throw error when updating without current record', async () => {
      await expect(gr.update()).rejects.toThrow('Cannot update: no current record');
    });

    test('should throw error when deleting without current record', async () => {
      await expect(gr.delete()).rejects.toThrow('Cannot delete: no current record');
    });
  });

  describe('Navigation', () => {
    beforeEach(() => {
      const mockData = [
        { sys_id: 'id1', number: 'INC001' },
        { sys_id: 'id2', number: 'INC002' },
        { sys_id: 'id3', number: 'INC003' }
      ];
      
      gr['_results'] = mockData;
      gr['_total'] = 3;
    });

    test('should navigate with next()', () => {
      expect(gr.location).toBe(-1);
      
      expect(gr.next()).toBe(true);
      expect(gr.location).toBe(0);
      expect(gr.getValue('sys_id')).toBe('id1');
      
      expect(gr.next()).toBe(true);
      expect(gr.location).toBe(1);
      expect(gr.getValue('sys_id')).toBe('id2');
      
      expect(gr.next()).toBe(true);
      expect(gr.location).toBe(2);
      expect(gr.getValue('sys_id')).toBe('id3');
      
      expect(gr.next()).toBe(false);
    });

    test('should check hasNext()', () => {
      expect(gr.hasNext()).toBe(true);
      
      gr.next();
      expect(gr.hasNext()).toBe(true);
      
      gr.next();
      expect(gr.hasNext()).toBe(true);
      
      gr.next();
      expect(gr.hasNext()).toBe(false);
    });

    test('should rewind', () => {
      gr.next();
      gr.next();
      expect(gr.location).toBe(1);
      
      gr.rewind();
      expect(gr.location).toBe(-1);
    });

    test('should get row count', () => {
      expect(gr.getRowCount()).toBe(3);
    });
  });

  describe('Serialization', () => {
    beforeEach(() => {
      const mockRecord = {
        sys_id: 'test_id',
        number: 'INC001',
        state: { value: '1', display_value: 'New' },
        assigned_to: {
          value: 'user_id',
          display_value: 'John Doe',
          link: 'https://instance.service-now.com/api/now/table/sys_user/user_id'
        }
      };
      
      gr['_results'] = [mockRecord];
      gr['_current'] = 0;
      gr['_total'] = 1;
    });

    test('should serialize current record', () => {
      const serialized = gr.serialize();
      
      expect(serialized).toHaveProperty('sys_id');
      expect(serialized).toHaveProperty('number');
      expect(serialized).toHaveProperty('state');
      expect(serialized).toHaveProperty('assigned_to');
    });

    test('should serialize all records', () => {
      const allSerialized = gr.serializeAll();
      
      expect(Array.isArray(allSerialized)).toBe(true);
      expect(allSerialized).toHaveLength(1);
      expect(allSerialized[0]).toHaveProperty('sys_id');
    });

    test('should return empty object when no current record', () => {
      gr['_current'] = -1;
      const serialized = gr.serialize();
      
      expect(serialized).toEqual({});
    });
  });

  describe('Iterator Protocol', () => {
    beforeEach(() => {
      const mockData = [
        { sys_id: 'id1', number: 'INC001' },
        { sys_id: 'id2', number: 'INC002' }
      ];
      
      gr['_results'] = mockData;
      gr['_total'] = 2;
    });

    test('should be iterable', () => {
      const iterator = gr[Symbol.iterator]();
      expect(iterator).toBeDefined();
    });

    test('should iterate through records', () => {
      const records = Array.from(gr);
      expect(records).toHaveLength(2);
      expect(records[0]).toBe(gr);
    });
  });

  describe('Error Handling', () => {
    test('should handle query errors', async () => {
      mockClient.serviceNow.query.mockRejectedValue(new Error('Query failed'));
      
      await expect(gr.query()).rejects.toThrow('Query failed');
    });

    test('should handle invalid location setting', () => {
      expect(() => { gr.location = 5; }).toThrow('No location to be had when we have no query');
      
      gr['_total'] = 3;
      expect(() => { gr.location = -2; }).toThrow('Location out of bounds');
      expect(() => { gr.location = 3; }).toThrow('Location out of bounds');
    });
  });
});