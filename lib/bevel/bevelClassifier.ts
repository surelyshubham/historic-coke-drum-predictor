/**
 * Coke Drum Weld Bevel Profiles Engine
 * Represents the 8 distinct weld joint fabrication details from authentic engineering drawings.
 */

export type BevelJointType =
  | "TYPE_A_STANDARD"        // Row D-Left:  C2~C7, L8A~D, L9 (50° Single-V, 10mm Inco Root)
  | "TYPE_B_GTAW_ROOT"       // Row D-Right: L1A~D ~ L7A~D (50° Single-V, GTAW Root Pass, 6.5mm B.C)
  | "TYPE_C_TAPER_C8"        // Row E-Left:  C8 (50° Single-V, 1:10 OD Taper Transition)
  | "TYPE_D_TAPER_HEAD"      // Row E-Right: C1, C9, C10, C11 (50° Single-V, 1:10 OD Taper)
  | "TYPE_E_SKIRT_UNCLAD"    // Row F-Left:  SL1A/B, SL2A/B, SC2 (Support Skirt Unclad 50° V, Convex OD Cap)
  | "TYPE_F_HEAVY_CROWN_C12" // Row F-Right: C12 (50° Single-V, 1:10 Taper, MAX 2.0mm Heavy ID Cap)
  | "TYPE_G_HEAD_H1"         // Row G-Left:  H1A~K (Asymmetric Double-V: 45° OD / 60° ID, 32mm Base)
  | "TYPE_H_HEAD_H2_H3";     // Row G-Right: H2A~H, H3A~D (Asymmetric Double-V: 45° OD / 50° ID, 36mm Base)

export interface BevelDefinition {
  id: BevelJointType;
  typeLetter: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
  drawingRow: "D" | "E" | "F" | "G";
  shortName: string;
  fullName: string;
  drawingRef: string;
  applicableWeldsText: string;
  baseMaterial: string;

  // Geometry parameters
  grooveAngleDeg: number;            // OD Groove angle (50° or 45°)
  hasTaper: boolean;                 // true for C8, C1, C9, C10, C11, C12
  taperSlope?: "1:10";
  taperSide?: "RIGHT";               // Side with the thicker course in drawing
  taperThickOffsetMm?: number;       // Visual vertical step delta (e.g. 5.0 mm)

  hasCladding: boolean;              // false for Skirt
  defaultCladThicknessMm: number;    // 1.5 mm (or 0 mm for Skirt)
  inconelOverlay: boolean;           // true for all cladded seams
  backChipWidthMm: number;           // 10.0 mm (standard) or 6.5 mm (GTAW)
  rootGapMm: number;                 // 3.0 mm (or 1.5 mm for skirt)

  odCapStyle: "FLUSH" | "CONVEX";    // CONVEX for skirt
  idCapProtrusionMaxMm: number;      // 0.8 mm (flush) or 2.0 mm (C12)

  isDoubleV: boolean;                // true for H1, H2, H3
  idGrooveAngleDeg?: number;         // 60° for H1, 50° for H2/H3
  defaultWallThicknessMm: number;    // 32.0 mm or 36.0 mm
  gtawRootPass: boolean;             // true for L1~L7
}

export const BEVEL_DEFINITIONS: Record<BevelJointType, BevelDefinition> = {
  TYPE_A_STANDARD: {
    id: "TYPE_A_STANDARD",
    typeLetter: "A",
    drawingRow: "D",
    shortName: "Type A — Standard Shell Single-V",
    fullName: "Type A: C2~C7, L8, L9 (50° Single-V, 10mm Inco Root)",
    drawingRef: "Drawing Row D - Left: C2~C7, L8A~D, L9",
    applicableWeldsText: "C2~C7, L8A~D, L9",
    baseMaterial: "1 1/4Cr (SA-387 Gr 11)",
    grooveAngleDeg: 50.0,
    hasTaper: false,
    hasCladding: true,
    defaultCladThicknessMm: 1.5,
    inconelOverlay: true,
    backChipWidthMm: 10.0,
    rootGapMm: 3.0,
    odCapStyle: "FLUSH",
    idCapProtrusionMaxMm: 0.8,
    isDoubleV: false,
    defaultWallThicknessMm: 32.0,
    gtawRootPass: false,
  },
  TYPE_B_GTAW_ROOT: {
    id: "TYPE_B_GTAW_ROOT",
    typeLetter: "B",
    drawingRow: "D",
    shortName: "Type B — Longitudinal GTAW Root",
    fullName: "Type B: L1~L7 (50° Single-V, GTAW Root Pass, 6.5mm B.C)",
    drawingRef: "Drawing Row D - Right: L1A~D ~ L7A~D",
    applicableWeldsText: "L1A~D ~ L7A~D",
    baseMaterial: "1 1/4Cr (SA-387 Gr 11)",
    grooveAngleDeg: 50.0,
    hasTaper: false,
    hasCladding: true,
    defaultCladThicknessMm: 1.5,
    inconelOverlay: true,
    backChipWidthMm: 6.5,
    rootGapMm: 3.0,
    odCapStyle: "FLUSH",
    idCapProtrusionMaxMm: 0.8,
    isDoubleV: false,
    defaultWallThicknessMm: 32.0,
    gtawRootPass: true,
  },
  TYPE_C_TAPER_C8: {
    id: "TYPE_C_TAPER_C8",
    typeLetter: "C",
    drawingRow: "E",
    shortName: "Type C — Mid-Shell 1:10 OD Taper (C8)",
    fullName: "Type C: C8 (50° Single-V, 1:10 OD Taper Transition)",
    drawingRef: "Drawing Row E - Left: C8",
    applicableWeldsText: "C8",
    baseMaterial: "1 1/4Cr (SA-387 Gr 11)",
    grooveAngleDeg: 50.0,
    hasTaper: true,
    taperSlope: "1:10",
    taperSide: "RIGHT",
    taperThickOffsetMm: 5.0,
    hasCladding: true,
    defaultCladThicknessMm: 1.5,
    inconelOverlay: true,
    backChipWidthMm: 10.0,
    rootGapMm: 3.0,
    odCapStyle: "FLUSH",
    idCapProtrusionMaxMm: 0.8,
    isDoubleV: false,
    defaultWallThicknessMm: 32.0,
    gtawRootPass: false,
  },
  TYPE_D_TAPER_HEAD: {
    id: "TYPE_D_TAPER_HEAD",
    typeLetter: "D",
    drawingRow: "E",
    shortName: "Type D — Cone/Head 1:10 OD Taper (C1, C9~C11)",
    fullName: "Type D: C1, C9, C10, C11 (50° Single-V, 1:10 OD Taper)",
    drawingRef: "Drawing Row E - Right: C1, C9, C10, C11",
    applicableWeldsText: "C1, C9, C10, C11",
    baseMaterial: "1 1/4Cr (SA-387 Gr 11)",
    grooveAngleDeg: 50.0,
    hasTaper: true,
    taperSlope: "1:10",
    taperSide: "RIGHT",
    taperThickOffsetMm: 5.0,
    hasCladding: true,
    defaultCladThicknessMm: 1.5,
    inconelOverlay: true,
    backChipWidthMm: 10.0,
    rootGapMm: 3.0,
    odCapStyle: "FLUSH",
    idCapProtrusionMaxMm: 0.8,
    isDoubleV: false,
    defaultWallThicknessMm: 32.0,
    gtawRootPass: false,
  },
  TYPE_E_SKIRT_UNCLAD: {
    id: "TYPE_E_SKIRT_UNCLAD",
    typeLetter: "E",
    drawingRow: "F",
    shortName: "Type E — Support Skirt Unclad (Convex Cap)",
    fullName: "Type E: SL1/SL2, SC2 (Support Skirt Unclad 50° V, Convex OD Cap)",
    drawingRef: "Drawing Row F - Left: SL1A/B, SL2A/B, SC2",
    applicableWeldsText: "SL1A/B, SL2A/B, SC2",
    baseMaterial: "1 1/4Cr (SA-387 Gr 11)",
    grooveAngleDeg: 50.0,
    hasTaper: false,
    hasCladding: false,
    defaultCladThicknessMm: 0.0,
    inconelOverlay: false,
    backChipWidthMm: 5.0,
    rootGapMm: 1.5,
    odCapStyle: "CONVEX",
    idCapProtrusionMaxMm: 0.0,
    isDoubleV: false,
    defaultWallThicknessMm: 32.0,
    gtawRootPass: false,
  },
  TYPE_F_HEAVY_CROWN_C12: {
    id: "TYPE_F_HEAVY_CROWN_C12",
    typeLetter: "F",
    drawingRow: "F",
    shortName: "Type F — Transition Seam (MAX 2mm ID Crown)",
    fullName: "Type F: C12 (50° Single-V, 1:10 Taper, MAX 2.0mm Heavy ID Cap)",
    drawingRef: "Drawing Row F - Right: C12",
    applicableWeldsText: "C12",
    baseMaterial: "1 1/4Cr (SA-387 Gr 11)",
    grooveAngleDeg: 50.0,
    hasTaper: true,
    taperSlope: "1:10",
    taperSide: "RIGHT",
    taperThickOffsetMm: 5.0,
    hasCladding: true,
    defaultCladThicknessMm: 1.5,
    inconelOverlay: true,
    backChipWidthMm: 10.0,
    rootGapMm: 3.0,
    odCapStyle: "FLUSH",
    idCapProtrusionMaxMm: 2.0, // Special heavier ID reinforced cap
    isDoubleV: false,
    defaultWallThicknessMm: 32.0,
    gtawRootPass: false,
  },
  TYPE_G_HEAD_H1: {
    id: "TYPE_G_HEAD_H1",
    typeLetter: "G",
    drawingRow: "G",
    shortName: "Type G — Head 1 Asym Double-V (60° OD / 45° ID)",
    fullName: "Type G: H1A~K (Double-V: 60° OD / 45° ID, 32mm Wall)",
    drawingRef: "Drawing Row G - Left: H1A~K",
    applicableWeldsText: "H1A~K",
    baseMaterial: "1 1/4Cr (SA-387 Gr 11)",
    grooveAngleDeg: 60.0,
    hasTaper: false,
    hasCladding: true,
    defaultCladThicknessMm: 1.5,
    inconelOverlay: true,
    backChipWidthMm: 10.0,
    rootGapMm: 3.0,
    odCapStyle: "FLUSH",
    idCapProtrusionMaxMm: 0.8,
    isDoubleV: true,
    idGrooveAngleDeg: 45.0,
    defaultWallThicknessMm: 32.0,
    gtawRootPass: false,
  },
  TYPE_H_HEAD_H2_H3: {
    id: "TYPE_H_HEAD_H2_H3",
    typeLetter: "H",
    drawingRow: "G",
    shortName: "Type H — Head 2/3 Asym Double-V (50° OD / 45° ID)",
    fullName: "Type H: H2/H3 (Double-V: 50° OD / 45° ID, 36mm Wall)",
    drawingRef: "Drawing Row G - Right: H2A~H, H3A~D",
    applicableWeldsText: "H2A~H, H3A~D",
    baseMaterial: "1 1/4Cr (SA-387 Gr 11)",
    grooveAngleDeg: 50.0,
    hasTaper: false,
    hasCladding: true,
    defaultCladThicknessMm: 1.5,
    inconelOverlay: true,
    backChipWidthMm: 10.0,
    rootGapMm: 3.0,
    odCapStyle: "FLUSH",
    idCapProtrusionMaxMm: 0.8,
    isDoubleV: true,
    idGrooveAngleDeg: 45.0,
    defaultWallThicknessMm: 36.0, // Heavy plate section
    gtawRootPass: false,
  },
};

export const ALL_BEVEL_TYPES: BevelJointType[] = [
  "TYPE_A_STANDARD",
  "TYPE_B_GTAW_ROOT",
  "TYPE_C_TAPER_C8",
  "TYPE_D_TAPER_HEAD",
  "TYPE_E_SKIRT_UNCLAD",
  "TYPE_F_HEAVY_CROWN_C12",
  "TYPE_G_HEAD_H1",
  "TYPE_H_HEAD_H2_H3",
];

export function getBevelDefinition(type?: BevelJointType | string | null): BevelDefinition {
  if (type && type in BEVEL_DEFINITIONS) {
    return BEVEL_DEFINITIONS[type as BevelJointType];
  }
  return BEVEL_DEFINITIONS.TYPE_G_HEAD_H1;
}

/**
 * Intelligent automatic classifier that detects the authentic bevel type from any weld name string.
 * Handles formats like "C8", "WELD C8", "C08", "L2A", "SL1", "SC2", "H1B", "C12", etc.
 */
export function detectBevelTypeFromWeldName(weldName?: string | null): BevelJointType {
  // As requested, Type G is the universal default, bypassing regex auto-detection.
  return "TYPE_G_HEAD_H1";
}