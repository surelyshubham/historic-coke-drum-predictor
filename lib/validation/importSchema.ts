import { z } from 'zod';

export const observationImportRowSchema = z.object({
  sourceIndicationNumber: z.string().min(1, 'Indication number cannot be empty'),
  weldName: z.string().min(1, 'Weld name cannot be empty'),
  circumferentialPosition: z.number().min(0, 'Position must be >= 0'),
  axialPosition: z.number().optional().nullable(),
  length: z.number().positive('Indication length must be greater than 0'),
  depth: z.number().positive('Indication depth must be greater than 0'),
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
  rawRow: Record<string, unknown>;
}

export function validateImportRows(rows: Record<string, unknown>[], fieldMapping: Record<string, string>) {
  const validRows: ObservationImportRow[] = [];
  const errors: ValidationError[] = [];

  rows.forEach((row, idx) => {
    // Map column names according to fieldMapping
    const mappedObj: Record<string, unknown> = {};
    Object.entries(fieldMapping).forEach(([targetField, sourceCol]) => {
      if (sourceCol && row[sourceCol] !== undefined) {
        let val = row[sourceCol];
        // Clean numeric fields
        if (['circumferentialPosition', 'axialPosition', 'length', 'depth', 'amplitude'].includes(targetField)) {
          if (typeof val === 'string') {
            const parsed = parseFloat(val.trim());
            val = isNaN(parsed) ? val : parsed;
          }
        }
        mappedObj[targetField] = val;
      }
    });

    const result = observationImportRowSchema.safeParse(mappedObj);
    if (result.success) {
      validRows.push(result.data);
    } else {
      result.error.issues.forEach(err => {
        errors.push({
          rowIndex: idx,
          rowNumber: idx + 2, // Accounting for header row
          field: err.path.join('.'),
          message: err.message,
          rawRow: row,
        });
      });
    }
  });

  return { validRows, errors, totalRows: rows.length };
}
