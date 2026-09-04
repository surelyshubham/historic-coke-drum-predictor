import { describe, it, expect } from 'vitest';
import { validateImportRows } from '../../lib/validation/importSchema';

describe('Master Data Import Validation', () => {
  const fieldMapping = {
    sourceIndicationNumber: 'Indication No',
    weldName: 'Weld Ref',
    circumferentialPosition: 'Circ Position',
    length: 'Length (mm)',
    depth: 'Depth (mm)',
  };

  it('successfully validates correct observation rows', () => {
    const rawRows = [
      {
        'Indication No': 'IND-101',
        'Weld Ref': 'W01',
        'Circ Position': '450',
        'Length (mm)': '12.5',
        'Depth (mm)': '4.2',
      },
    ];

    const result = validateImportRows(rawRows, fieldMapping);
    expect(result.validRows.length).toBe(1);
    expect(result.errors.length).toBe(0);
    expect(result.validRows[0].sourceIndicationNumber).toBe('IND-101');
    expect(result.validRows[0].length).toBe(12.5);
  });

  it('catches missing required fields and invalid negative numbers', () => {
    const rawRows = [
      {
        'Indication No': '',
        'Weld Ref': 'W01',
        'Circ Position': '-10',
        'Length (mm)': 'invalid',
        'Depth (mm)': '0',
      },
    ];

    const result = validateImportRows(rawRows, fieldMapping);
    expect(result.validRows.length).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
