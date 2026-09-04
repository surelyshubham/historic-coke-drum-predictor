import { describe, it, expect } from 'vitest';
import { detectMatrixFormat, discoverCampaignsFromHeaders, parseMatrixRows } from '../../lib/import/matrixParser';

describe('Historical Matrix Parser Engine', () => {
  const sampleHeaders = [
    'COKE DRUM NO',
    'JOINT NO',
    'SEGMENT [M]',
    'DEFECT LOCATION FROM \'0\' POINT [MM] MAY-25',
    'OCT-23 LENGTH [MM]',
    'APRIL-24 LENGTH [MM]',
    'SEP-24 LENGTH [MM]',
    'MAY-25 LENGTH [MM]',
    'DEFECT LOCATION FROM \'0\' POINT [MM] AUGUST-2026 AFTER REPAIR',
    'AUGUST-2026 LENGTH [MM] AFTER REPAIR',
    'INDICATION TYPE',
  ];

  it('detects multi-campaign matrix headers correctly', () => {
    expect(detectMatrixFormat(sampleHeaders)).toBe(true);
  });

  it('discovers all campaign columns chronologically', () => {
    const campaigns = discoverCampaignsFromHeaders(sampleHeaders);
    expect(campaigns.length).toBeGreaterThanOrEqual(4);
    const keys = campaigns.map(c => c.key);
    expect(keys).toContain('OCT-23');
    expect(keys).toContain('APRIL-24');
    expect(keys).toContain('MAY-25');
  });

  it('unpivots a matrix row into multiple campaign observations and a persistent physical indication', () => {
    const campaigns = discoverCampaignsFromHeaders(sampleHeaders);
    const sampleRows = [
      {
        'COKE DRUM NO': 'R01',
        'JOINT NO': 'C6',
        'SEGMENT [M]': '6-9',
        'DEFECT LOCATION FROM \'0\' POINT [MM] MAY-25': '7400-8400',
        'OCT-23 LENGTH [MM]': '600',
        'APRIL-24 LENGTH [MM]': '650',
        'SEP-24 LENGTH [MM]': '950',
        'MAY-25 LENGTH [MM]': '1000',
        'INDICATION TYPE': 'Crack-like',
      },
      {
        'COKE DRUM NO': 'R01',
        'JOINT NO': 'C6',
        'SEGMENT [M]': '0-3',
        'DEFECT LOCATION FROM \'0\' POINT [MM] MAY-25': 'NIL',
        'OCT-23 LENGTH [MM]': 'NIL',
        'APRIL-24 LENGTH [MM]': 'NIL',
        'SEP-24 LENGTH [MM]': 'NOT DONE',
        'MAY-25 LENGTH [MM]': 'NIL',
        'INDICATION TYPE': 'NIL',
      }
    ];

    const result = parseMatrixRows(sampleRows, sampleHeaders, campaigns);

    // Should create 1 physical indication for the real flaw (skipping NIL row)
    expect(result.physicalIndications.length).toBe(1);
    expect(result.physicalIndications[0].code).toBe('PI-R01-C6-7400');
    expect(result.physicalIndications[0].circumferentialPosition).toBe(7400);

    // Should create 4 observations across the 4 campaigns
    expect(result.observations.length).toBe(4);
    expect(result.observations[0].length).toBe(600); // Oct-23
    expect(result.observations[1].length).toBe(650); // Apr-24
    expect(result.observations[2].length).toBe(950); // Sep-24
    expect(result.observations[3].length).toBe(1000); // May-25
  });
});
