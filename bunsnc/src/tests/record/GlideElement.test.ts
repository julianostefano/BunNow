/**
 * GlideElement Unit Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { GlideElement } from '../../record/GlideElement';

describe('GlideElement', () => {
  let element: GlideElement;

  beforeEach(() => {
    element = new GlideElement('test_field');
  });

  describe('Basic Construction', () => {
    test('should create element with name', () => {
      expect(element.getName()).toBe('test_field');
    });

    test('should create element with value', () => {
      const elem = new GlideElement('field', 'value');
      expect(elem.getValue()).toBe('value');
      expect(elem.getName()).toBe('field');
    });

    test('should create element with display value', () => {
      const elem = new GlideElement('field', 'value', 'Display Value');
      expect(elem.getValue()).toBe('value');
      expect(elem.getDisplayValue()).toBe('Display Value');
    });

    test('should create element from ServiceNow API object', () => {
      const apiValue = {
        value: 'sys_id_123',
        display_value: 'John Doe',
        link: 'https://instance.service-now.com/api/now/table/sys_user/sys_id_123'
      };
      
      const elem = new GlideElement('assigned_to', apiValue);
      expect(elem.getValue()).toBe('sys_id_123');
      expect(elem.getDisplayValue()).toBe('John Doe');
      expect(elem.getLink()).toBe('https://instance.service-now.com/api/now/table/sys_user/sys_id_123');
    });
  });

  describe('Value Management', () => {
    test('should set and get values', () => {
      element.setValue('new_value');
      expect(element.getValue()).toBe('new_value');
      expect(element.changes()).toBe(true);
    });

    test('should set and get display values', () => {
      element.setDisplayValue('Display Value');
      expect(element.getDisplayValue()).toBe('Display Value');
      expect(element.changes()).toBe(true);
    });

    test('should set and get links', () => {
      const link = 'https://instance.service-now.com/nav_to.do?uri=table.do';
      element.setLink(link);
      expect(element.getLink()).toBe(link);
      expect(element.changes()).toBe(true);
    });

    test('should handle GlideElement values', () => {
      const sourceElement = new GlideElement('source', 'source_value', 'Source Display');
      
      element.setValue(sourceElement);
      expect(element.getValue()).toBe('source_value');
      
      element.setDisplayValue(sourceElement);
      expect(element.getDisplayValue()).toBe('Source Display');
    });

    test('should track changes correctly', () => {
      expect(element.changes()).toBe(false);
      
      element.setValue('value');
      expect(element.changes()).toBe(true);
      
      const elem2 = new GlideElement('test2');
      elem2.setDisplayValue('display');
      expect(elem2.changes()).toBe(true);
    });

    test('should not mark as changed when setting same value', () => {
      element.setValue('value');
      element = new GlideElement('test', 'value'); // Reset
      
      element.setValue('value');
      expect(element.changes()).toBe(false);
    });
  });

  describe('Null and Empty Checks', () => {
    test('should identify nil values', () => {
      expect(element.nil()).toBe(true); // null by default
      
      element.setValue('');
      expect(element.nil()).toBe(true); // empty string
      
      element.setValue('value');
      expect(element.nil()).toBe(false); // has value
      
      element.setValue(null);
      expect(element.nil()).toBe(true); // explicit null
      
      element.setValue(undefined);
      expect(element.nil()).toBe(true); // undefined
    });

    test('should handle array values for nil check', () => {
      element.setValue([]);
      expect(element.nil()).toBe(true); // empty array
      
      element.setValue(['item']);
      expect(element.nil()).toBe(false); // non-empty array
    });
  });

  describe('Date Operations', () => {
    test('should convert string to date', () => {
      element.setValue('2025-01-01T00:00:00Z');
      const date = element.dateValue();
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2025);
    });

    test('should convert Date object', () => {
      const testDate = new Date('2025-01-01T00:00:00Z');
      element.setValue(testDate);
      const date = element.dateValue();
      expect(date).toEqual(testDate);
    });

    test('should convert numeric timestamp', () => {
      const timestamp = Date.now();
      element.setValue(timestamp);
      const date = element.dateValue();
      expect(date.getTime()).toBe(timestamp);
    });

    test('should get numeric date value', () => {
      const testDate = new Date('2025-01-01T00:00:00Z');
      element.setValue(testDate);
      expect(element.dateNumericValue()).toBe(testDate.getTime());
    });

    test('should set date from numeric value', () => {
      const timestamp = Date.now();
      element.setDateNumericValue(timestamp);
      expect(element.dateValue().getTime()).toBe(timestamp);
    });

    test('should throw error for invalid date strings', () => {
      element.setValue('invalid-date');
      expect(() => element.dateValue()).toThrow();
    });

    test('should throw error for non-convertible types', () => {
      element.setValue({ not: 'a date' });
      expect(() => element.dateValue()).toThrow();
    });
  });

  describe('Serialization', () => {
    test('should serialize basic element', () => {
      element.setValue('value');
      element.setDisplayValue('Display Value');
      
      const serialized = element.serialize();
      expect(serialized).toEqual({
        value: 'value',
        display_value: 'Display Value'
      });
    });

    test('should serialize element with link', () => {
      element.setValue('sys_id_123');
      element.setDisplayValue('John Doe');
      element.setLink('https://instance.service-now.com/api/now/table/sys_user/sys_id_123');
      
      const serialized = element.serialize();
      expect(serialized).toEqual({
        value: 'sys_id_123',
        display_value: 'John Doe',
        link: 'https://instance.service-now.com/api/now/table/sys_user/sys_id_123'
      });
    });

    test('should handle JSON serialization', () => {
      element.setValue('value');
      element.setDisplayValue('Display Value');
      
      const json = JSON.stringify(element);
      const parsed = JSON.parse(json);
      
      expect(parsed.value).toBe('value');
      expect(parsed.display_value).toBe('Display Value');
    });
  });

  describe('String Operations', () => {
    test('should convert to string', () => {
      element.setValue('test_value');
      expect(element.toString()).toBe('test_value');
    });

    test('should handle null values in toString', () => {
      expect(element.toString()).toBe(''); // null/undefined becomes empty string
    });

    test('should handle valueOf for comparisons', () => {
      element.setValue(42);
      expect(element.valueOf()).toBe(42);
      
      element.setValue('string_value');
      expect(element.valueOf()).toBe('string_value');
    });
  });

  describe('Display Value Fallback', () => {
    test('should return value when no display value', () => {
      element.setValue('value');
      expect(element.getDisplayValue()).toBe('value');
    });

    test('should return display value when available', () => {
      element.setValue('value');
      element.setDisplayValue('display');
      expect(element.getDisplayValue()).toBe('display');
    });

    test('should return display value when value is null', () => {
      element.setDisplayValue('display_only');
      expect(element.getValue()).toBe('display_only');
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero values', () => {
      element.setValue(0);
      expect(element.getValue()).toBe(0);
      expect(element.nil()).toBe(false);
    });

    test('should handle false values', () => {
      element.setValue(false);
      expect(element.getValue()).toBe(false);
      expect(element.nil()).toBe(false);
    });

    test('should handle empty string vs null distinction', () => {
      element.setValue('');
      expect(element.getValue()).toBe('');
      expect(element.nil()).toBe(true);
      
      element.setValue(null);
      expect(element.getValue()).toBe(null);
      expect(element.nil()).toBe(true);
    });

    test('should handle complex object values', () => {
      const complexValue = { nested: { data: 'value' } };
      element.setValue(complexValue);
      expect(element.getValue()).toEqual(complexValue);
    });
  });
});