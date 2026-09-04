import { describe, it, expect } from 'vitest';
import { validateImportRows, cleanNumericValue } from '../../lib/validation/importSchema';

describe('Master Data Import Validation Engine', () => {
  const fieldMapping = {
    sourceIndicationNumber: 'Indication No',
    weldName: 'Weld Ref',
    circumferentialPosition: 'Circ Position',
    length: 'Length (mm)',
    depth: 'Depth (mm)',
  };

  it('successfully cleans units and parses comma decimals', () => {
    expect(cleanNumericValue('12.5mm').parsed).toBe(12.5);
    expect(cleanNumericValue('12,5 mm').parsed).toBe(12.5);
    expect(cleanNumericValue('~4.8').parsed).toBe(4.8);
    expect(cleanNumericValue('N/A').error).toContain('Expected numeric value');
  });

  it('successfully validates correct observation rows', () => {
    const rawRows = [
      {
        'Indication No': 'IND-101',
        'Weld Ref': 'W01',
        'Circ Position': '450 mm',
        'Length (mm)': '12.5',
        'Depth (mm)': '4.2',
      },
    ];

    const result = validateImportRows(rawRows, fieldMapping, { validWeldNames: ['W01', 'W02'] });
    expect(result.validRows.length).toBe(1);
    expect(result.errors.length).toBe(0);
    expect(result.validRows[0].sourceIndicationNumber).toBe('IND-101');
    expect(result.validRows[0].length).toBe(12.5);
  });

  it('catches invalid text in numeric fields with exact error message', () => {
    const rawRows = [
      {
        'Indication No': 'IND-102',
        'Weld Ref': 'W01',
        'Circ Position': '100',
        'Length (mm)': 'N/A',
        'Depth (mm)': '4.0',
      },
    ];

    const result = validateImportRows(rawRows, fieldMapping);
    expect(result.validRows.length).toBe(0);
    expect(result.errors[0].message).toContain('Expected numeric value, received "N/A"');
  });

  it('catches unknown welds when validWeldNames option is passed', () => {
    const rawRows = [
      {
        'Indication No': 'IND-103',
        'Weld Ref': 'W99',
        'Circ Position': '100',
        'Length (mm)': '10',
        'Depth (mm)': '4.0',
      },
    ];

    const result = validateImportRows(rawRows, fieldMapping, { validWeldNames: ['W01', 'W02'] });
    expect(result.validRows.length).toBe(0);
    expect(result.errors[0].message).toContain('Unknown weld "W99"');
  });

  it('catches duplicate indication numbers', () => {
    const rawRows = [
      {
        'Indication No': 'IND-01',
        'Weld Ref': 'W01',
        'Circ Position': '100',
        'Length (mm)': '10',
        'Depth (mm)': '4.0',
      },
      {
        'Indication No': 'IND-01',
        'Weld Ref': 'W01',
        'Circ Position': '120',
        'Length (mm)': '15',
        'Depth (mm)': '5.0',
      },
    ];

    const result = validateImportRows(rawRows, fieldMapping);
    expect(result.validRows.length).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].message).toContain('Duplicate indication number "IND-01"');
  });
});
