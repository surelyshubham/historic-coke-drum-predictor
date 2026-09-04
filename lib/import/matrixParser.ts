export interface MatrixCampaignDef {
  key: string; // e.g. "OCT-23"
  label: string; // e.g. "Oct-2023 Campaign"
  date: string; // "2023-10-15"
  lengthCol?: string;
  locationCol?: string;
  depthOdCol?: string;
  depthIdCol?: string;
  isAfterRepair?: boolean;
}

export interface UnpivotedObservation {
  campaignKey: string;
  campaignLabel: string;
  campaignDate: string;
  drumName: string;
  weldName: string;
  segment: string;
  physicalIndicationCode: string;
  locationText: string;
  circumferentialPosition: number;
  length: number;
  depth: number;
  weldPosition: string;
  indicationType: string;
  isAfterRepair?: boolean;
}

export interface TrackedPhysicalIndication {
  code: string;
  drumName: string;
  weldName: string;
  segment: string;
  locationText: string;
  circumferentialPosition: number;
  weldPosition: string;
  indicationType: string;
  hasRepairs: boolean;
  latestLength: number;
  latestDepth: number;
  earliestLength: number;
  growthDelta: number;
  growthRateYear: number;
  observationsCount: number;
  campaignValues: Record<string, { length: number | null; depth: number | null }>;
}

export interface MatrixParseResult {
  isMatrixFormat: boolean;
  campaigns: MatrixCampaignDef[];
  availableDrums: string[];
  availableWelds: string[];
  weldsByDrum: Record<string, string[]>;
  physicalIndications: TrackedPhysicalIndication[];
  observations: UnpivotedObservation[];
  totalRows: number;
}

// Helper to normalize month-year strings into standardized dates
export function parseCampaignDate(name: string): string {
  const clean = name.toUpperCase().replace(/[^A-Z0-9]/g, ' ');
  const months: Record<string, string> = {
    OCT: '10', OCTO: '10',
    APR: '04', APRI: '04',
    SEP: '09', SEPT: '09',
    MAY: '05',
    DEC: '12', DECE: '12',
    FEB: '02', FEBR: '02',
    JUL: '07', JULY: '07',
    AUG: '08', AUGU: '08',
  };

  let foundMonth = '01';
  for (const [mKey, mVal] of Object.entries(months)) {
    if (clean.includes(mKey)) {
      foundMonth = mVal;
      break;
    }
  }

  let foundYear = '2025';
  const yearMatch = clean.match(/(20\d\d|\b2[3-9]\b)/);
  if (yearMatch) {
    const yStr = yearMatch[0];
    foundYear = yStr.length === 2 ? `20${yStr}` : yStr;
  }

  return `${foundYear}-${foundMonth}-15`;
}

// Helper to auto-detect header row from sheet array-of-arrays
export function detectHeaderRow(aoa: unknown[][]): { headerIndex: number; headers: string[] } {
  const commonHeaderKeywords = ["ind", "weld", "joint", "circ", "pos", "len", "dep", "thick", "type", "amp", "segment", "no", "drum"];
  
  let bestRowIndex = 0;
  let maxKeywordScore = -1;
  let bestHeaders: string[] = [];

  for (let r = 0; r < Math.min(15, aoa.length); r++) {
    const row = aoa[r];
    if (!Array.isArray(row)) continue;

    let score = 0;
    const currentHeaders = row.map((cell, cIdx) => {
      const str = cell !== null && cell !== undefined ? String(cell).trim() : `Column_${cIdx + 1}`;
      const lower = str.toLowerCase();
      if (commonHeaderKeywords.some(k => lower.includes(k))) score += 2;
      return str;
    });

    if (score > maxKeywordScore && currentHeaders.length > 2) {
      maxKeywordScore = score;
      bestRowIndex = r;
      bestHeaders = currentHeaders;
    }
  }

  if (bestHeaders.length === 0 && aoa.length > 0) {
    bestHeaders = (aoa[0] || []).map((c, i) => String(c ?? `Column_${i + 1}`));
  }

  return { headerIndex: bestRowIndex, headers: bestHeaders };
}

// Detect if uploaded sheet matches the multi-campaign matrix format
export function detectMatrixFormat(headers: string[]): boolean {
  const lengthHeaders = headers.filter(h => {
    const up = h.toUpperCase();
    return up.includes('LENGTH') && (up.includes('-2') || up.includes('202') || up.includes('OCT') || up.includes('APR') || up.includes('MAY') || up.includes('SEP') || up.includes('DEC') || up.includes('FEB') || up.includes('JUL') || up.includes('AUG'));
  });
  return lengthHeaders.length >= 2;
}

// Discover all campaigns from headers
export function discoverCampaignsFromHeaders(headers: string[]): MatrixCampaignDef[] {
  const campaignMap = new Map<string, MatrixCampaignDef>();

  headers.forEach(h => {
    const up = h.toUpperCase();
    const isLength = up.includes('LENGTH');
    const isLocation = up.includes('LOCATION') || up.includes('DEFECT LOCATION');
    const isDepthOd = up.includes('DEPTH') && up.includes('OD');
    const isDepthId = up.includes('DEPTH') && up.includes('ID');
    const isAfterRepair = up.includes('AFTER REPAIR') || up.includes('REPAIR');

    const tokens = ['OCT-23', 'APRIL-24', 'APR-24', 'SEP-24', 'MAY-25', 'SEP-OCT-2025', 'SEP-OCT', 'DEC-2025', 'DEC-25', 'FEB-2026', 'FEB-26', 'MAY-2026', 'MAY-26', 'JULY-2026', 'JUL-26', 'AUGUST-2026', 'AUG-26', 'DEC-24'];
    
    let matchedToken = '';
    for (const t of tokens) {
      if (up.replace(/[^A-Z0-9]/g, '').includes(t.replace(/[^A-Z0-9]/g, ''))) {
        matchedToken = t;
        break;
      }
    }

    if (!matchedToken && (isLength || isLocation)) {
      const match = up.match(/([A-Z]{3,}[-'\s]*\d{2,4})/);
      if (match) matchedToken = match[0];
    }

    if (matchedToken) {
      const key = isAfterRepair ? `${matchedToken}_REPAIR` : matchedToken;
      if (!campaignMap.has(key)) {
        campaignMap.set(key, {
          key,
          label: isAfterRepair ? `${matchedToken} (After Repair)` : matchedToken,
          date: parseCampaignDate(matchedToken),
          isAfterRepair,
        });
      }

      const camp = campaignMap.get(key)!;
      if (isLength) camp.lengthCol = h;
      else if (isLocation) camp.locationCol = h;
      else if (isDepthOd) camp.depthOdCol = h;
      else if (isDepthId) camp.depthIdCol = h;
    }
  });

  const list = Array.from(campaignMap.values());
  list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return list;
}

// Clean and parse numeric defect measurement (ignores NIL, NOT DONE, etc.)
function parseMeasurement(val: unknown): number | null {
  if (val === undefined || val === null || val === '') return null;
  const str = String(val).trim().toUpperCase();
  if (['NIL', 'NOT DONE', 'NOT APPLICABLE', 'NA', 'N/A', '-', '—', 'NONE'].includes(str)) return null;

  if (str.includes('-')) {
    const parts = str.split('-').map(p => parseFloat(p.replace(/[^0-9.]/g, '')));
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      return (parts[0] + parts[1]) / 2;
    }
  }

  const cleaned = str.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

// Parse location range like "7400-8400" or single position
function parseCircumferentialLocation(val: unknown): { position: number; rawText: string } {
  if (!val) return { position: 0, rawText: '' };
  const str = String(val).trim();
  if (['NIL', 'NOT DONE', 'NA', 'N/A'].includes(str.toUpperCase())) {
    return { position: 0, rawText: '' };
  }

  if (str.includes('-')) {
    const start = parseFloat(str.split('-')[0].replace(/[^0-9.]/g, ''));
    return { position: isNaN(start) ? 0 : start, rawText: str };
  }

  const single = parseFloat(str.replace(/[^0-9.]/g, ''));
  return { position: isNaN(single) ? 0 : single, rawText: str };
}

// Unpivot matrix rows into normalized physical indications and observations
export function parseMatrixRows(
  rows: Record<string, unknown>[],
  headers: string[],
  campaigns: MatrixCampaignDef[]
): MatrixParseResult {
  const observations: UnpivotedObservation[] = [];
  const piMap = new Map<string, TrackedPhysicalIndication>();
  const allDrumsSet = new Set<string>();
  const allWeldsSet = new Set<string>();
  const weldsByDrumMap: Record<string, Set<string>> = {};

  // Find metadata columns
  const drumCol = headers.find(h => h.toUpperCase().includes('DRUM')) || headers[0];
  const weldCol = headers.find(h => h.toUpperCase().includes('JOINT') || h.toUpperCase().includes('WELD')) || headers[1];
  const segmentCol = headers.find(h => h.toUpperCase().includes('SEGMENT')) || headers[2];
  const typeCol = headers.find(h => h.toUpperCase().includes('INDICATION TYPE') || h.toUpperCase() === 'TYPE');
  const weldPosCol = headers.find(h => h.toUpperCase().includes('DEFECT POSITION') || h.toUpperCase().includes('BOTTOM TOE'));

  rows.forEach((row, rowIdx) => {
    let drumName = String(row[drumCol] ?? 'C04').trim().toUpperCase();
    if (!drumName || drumName === 'UNDEFINED') drumName = 'C04';

    let weldName = String(row[weldCol] ?? 'C6').trim().toUpperCase();
    if (!weldName || weldName === 'UNDEFINED') weldName = 'C6';

    const segment = String(row[segmentCol] ?? '').trim();
    const indicationType = typeCol && row[typeCol] ? String(row[typeCol]).trim() : 'Crack-like';
    const weldPosition = weldPosCol && row[weldPosCol] ? String(row[weldPosCol]).trim() : 'Weld';

    allDrumsSet.add(drumName);
    allWeldsSet.add(weldName);
    if (!weldsByDrumMap[drumName]) weldsByDrumMap[drumName] = new Set<string>();
    weldsByDrumMap[drumName].add(weldName);

    // Find first valid defect location across campaigns for this row
    let bestLocationText = '';
    let bestCircPos = 0;

    for (const c of campaigns) {
      if (c.locationCol && row[c.locationCol]) {
        const parsedLoc = parseCircumferentialLocation(row[c.locationCol]);
        if (parsedLoc.rawText) {
          bestLocationText = parsedLoc.rawText;
          bestCircPos = parsedLoc.position;
          break;
        }
      }
    }

    if (!bestLocationText && segment) {
      bestLocationText = `Segment ${segment}m`;
      const segNum = parseFloat(segment.split('-')[0]);
      bestCircPos = isNaN(segNum) ? 0 : segNum * 1000;
    }

    // Stable physical indication code based on drum, weld, and location
    const piCode = `PI-${drumName}-${weldName}-${bestCircPos > 0 ? bestCircPos : `R${rowIdx + 1}`}`;

    let rowObsCount = 0;
    let hasRepairs = false;
    const campaignValues: Record<string, { length: number | null; depth: number | null }> = {};
    const recordedLengths: Array<{ date: string; len: number }> = [];
    let latestDepth = 3.0;

    // Unpivot observations across campaigns
    campaigns.forEach(camp => {
      let length: number | null = null;
      if (camp.lengthCol) {
        length = parseMeasurement(row[camp.lengthCol]);
      }

      if (!length && camp.locationCol && row[camp.locationCol]) {
        const locStr = String(row[camp.locationCol]).trim();
        if (locStr.includes('-')) {
          const parts = locStr.split('-').map(p => parseFloat(p.replace(/[^0-9.]/g, '')));
          if (!isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] > parts[0]) {
            length = parts[1] - parts[0];
          }
        }
      }

      let depth: number | null = null;
      if (camp.depthOdCol && row[camp.depthOdCol]) {
        depth = parseMeasurement(row[camp.depthOdCol]);
      } else if (camp.depthIdCol && row[camp.depthIdCol]) {
        depth = parseMeasurement(row[camp.depthIdCol]);
      }

      if (length && length > 0) {
        const effectiveDepth = depth || 3.0;
        latestDepth = effectiveDepth;
        recordedLengths.push({ date: camp.date, len: length });

        if (camp.isAfterRepair) hasRepairs = true;

        observations.push({
          campaignKey: camp.key,
          campaignLabel: camp.label,
          campaignDate: camp.date,
          drumName,
          weldName,
          segment,
          physicalIndicationCode: piCode,
          locationText: bestLocationText,
          circumferentialPosition: bestCircPos,
          length,
          depth: effectiveDepth,
          weldPosition,
          indicationType,
          isAfterRepair: camp.isAfterRepair,
        });

        campaignValues[camp.key] = { length, depth: effectiveDepth };
        rowObsCount++;
      } else {
        campaignValues[camp.key] = { length: null, depth: null };
      }
    });

    if (rowObsCount > 0) {
      const earliestLength = recordedLengths[0]?.len || 0;
      const latestLength = recordedLengths[recordedLengths.length - 1]?.len || 0;
      const growthDelta = latestLength - earliestLength;

      let growthRateYear = 0;
      if (recordedLengths.length >= 2) {
        const d1 = new Date(recordedLengths[0].date).getTime();
        const d2 = new Date(recordedLengths[recordedLengths.length - 1].date).getTime();
        const years = (d2 - d1) / (1000 * 60 * 60 * 24 * 365.25);
        if (years > 0) growthRateYear = Math.round((growthDelta / years) * 10) / 10;
      }

      if (!piMap.has(piCode)) {
        piMap.set(piCode, {
          code: piCode,
          drumName,
          weldName,
          segment,
          locationText: bestLocationText,
          circumferentialPosition: bestCircPos,
          weldPosition,
          indicationType,
          hasRepairs,
          latestLength,
          latestDepth,
          earliestLength,
          growthDelta,
          growthRateYear,
          observationsCount: rowObsCount,
          campaignValues,
        });
      } else {
        const existing = piMap.get(piCode)!;
        existing.observationsCount += rowObsCount;
        if (hasRepairs) existing.hasRepairs = true;
      }
    }
  });

  const weldsByDrum: Record<string, string[]> = {};
  for (const [d, wSet] of Object.entries(weldsByDrumMap)) {
    weldsByDrum[d] = Array.from(wSet).sort();
  }

  return {
    isMatrixFormat: true,
    campaigns,
    availableDrums: Array.from(allDrumsSet).sort(),
    availableWelds: Array.from(allWeldsSet).sort(),
    weldsByDrum,
    physicalIndications: Array.from(piMap.values()),
    observations,
    totalRows: rows.length,
  };
}
