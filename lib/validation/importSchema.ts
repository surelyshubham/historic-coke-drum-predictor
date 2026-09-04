import { z } from 'zod';

export const observationImportRowSchema = z.object({
  sourceIndicationNumber: z.string().min(1, 'Indication number cannot be empty'),
  weldName: z.string().min(1, 'Weld joint reference cannot be empty'),
  circumferentialPosition: z.number().min(0, 'Circumferential position must be >= 0 mm'),
  axialPosition: z.number().optional().nullable(),
  length: z.number().positive('Indication length must be greater than 0 mm'),
  depth: z.number().positive('Indication depth must be greater than 0 mm'),
  amplitude: z.number().optional().nullable(),
  indicationType: z.string().optional().nullable().default('PAUT Indication'),
  result: z.string().optional().nullable(),
});

export type ObservationImportRow = z.infer<typeof observationImportRowSchema>;

export interface ValidationError {
  rowIndex: number;
  rowNumber: number;
  field: string;
  message: string;
  receivedValue?: string;
  rawRow: Record<string, unknown>;
}

export function cleanNumericValue(val: unknown): { parsed: number | null; error?: string } {
  if (val === undefined || val === null || val === '') {
    return { parsed: null };
  }

  if (typeof val === 'number') {
    if (isNaN(val)) return { parsed: null, error: 'Expected numeric value, received NaN' };
    return { parsed: val };
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || trimmed === '-' || trimmed === '—') return { parsed: null };
    
    // Normalize comma decimal separator to period: 12,5 -> 12.5
    let cleaned = trimmed.replace(',', '.');
    
    // Strip common engineering units: mm, %, deg, etc.
    cleaned = cleaned.replace(/(mm|%|deg|°|dB|approx|~)/gi, '').trim();

    const num = Number(cleaned);
    if (isNaN(num)) {
      return { parsed: null, error: `Expected numeric value, received "${val}"` };
    }
    return { parsed: num };
  }

  return { parsed: null, error: `Expected numeric value, received "${String(val)}"` };
}

export function validateImportRows(
  rows: Record<string, unknown>[],
  fieldMapping: Record<string, string>,
  options?: {
    headerRowIndex?: number;
    validWeldNames?: string[];
  }
) {
  const validRows: ObservationImportRow[] = [];
  const errors: ValidationError[] = [];
  const headerOffset = (options?.headerRowIndex ?? 0) + 2; // +1 for 0-index, +1 for 1-based display
  const weldSet = options?.validWeldNames ? new Set(options.validWeldNames.map(w => w.toUpperCase().replace(/[^A-Z0-9]/g, ''))) : null;

  const seenIndicationNumbers = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + headerOffset;
    const mappedObj: Record<string, unknown> = {};
    let rowHasData = false;

    // Check mapped fields
    Object.entries(fieldMapping).forEach(([targetField, sourceCol]) => {
      if (!sourceCol || row[sourceCol] === undefined) return;
      const rawVal = row[sourceCol];
      if (rawVal !== '' && rawVal !== null && rawVal !== undefined) {
        rowHasData = true;
      }

      if (['circumferentialPosition', 'axialPosition', 'length', 'depth', 'amplitude'].includes(targetField)) {
        const { parsed, error } = cleanNumericValue(rawVal);
        if (error) {
          errors.push({
            rowIndex: idx,
            rowNumber,
            field: targetField,
            message: error,
            receivedValue: String(rawVal),
            rawRow: row,
          });
        }
        mappedObj[targetField] = parsed;
      } else if (typeof rawVal === 'string') {
        mappedObj[targetField] = rawVal.trim();
      } else {
        mappedObj[targetField] = String(rawVal);
      }
    });

    // Skip entirely blank rows
    if (!rowHasData) return;

    // Check for unknown weld reference if weld set provided
    if (weldSet && mappedObj.weldName) {
      const normalizedWeld = String(mappedObj.weldName).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!weldSet.has(normalizedWeld)) {
        errors.push({
          rowIndex: idx,
          rowNumber,
          field: 'weldName',
          message: `Unknown weld "${mappedObj.weldName}". It is not configured for this Coke Drum.`,
          receivedValue: String(mappedObj.weldName),
          rawRow: row,
        });
      }
    }

    // Check for duplicates
    if (mappedObj.sourceIndicationNumber) {
      const indNo = String(mappedObj.sourceIndicationNumber).trim();
      if (seenIndicationNumbers.has(indNo)) {
        errors.push({
          rowIndex: idx,
          rowNumber,
          field: 'sourceIndicationNumber',
          message: `Duplicate indication number "${indNo}" within this inspection file.`,
          receivedValue: indNo,
          rawRow: row,
        });
      } else {
        seenIndicationNumbers.add(indNo);
      }
    }

    const result = observationImportRowSchema.safeParse(mappedObj);
    if (result.success) {
      // Only push as valid if no prior custom errors for this row
      const hasErrorsThisRow = errors.some(e => e.rowIndex === idx);
      if (!hasErrorsThisRow) {
        validRows.push(result.data);
      }
    } else {
      result.error.issues.forEach(err => {
        // Prevent duplicate messages if already reported
        const fieldName = err.path.join('.');
        if (!errors.some(e => e.rowIndex === idx && e.field === fieldName)) {
          errors.push({
            rowIndex: idx,
            rowNumber,
            field: fieldName,
            message: err.message,
            receivedValue: String(mappedObj[fieldName] ?? ''),
            rawRow: row,
          });
        }
      });
    }
  });

  return { validRows, errors, totalRows: rows.length };
}
