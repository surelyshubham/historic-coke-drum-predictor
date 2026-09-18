import { describe, it, expect } from "vitest";
import { 
  detectBevelTypeFromWeldName, 
  getBevelDefinition, 
  ALL_BEVEL_TYPES, 
  BEVEL_DEFINITIONS 
} from "../../lib/bevel/bevelClassifier";

describe("Coke Drum Weld Bevel Classifier Engine", () => {
  it("should contain exactly 8 authentic bevel configurations (Rows D–G)", () => {
    expect(ALL_BEVEL_TYPES.length).toBe(8);
    expect(Object.keys(BEVEL_DEFINITIONS).length).toBe(8);
  });

  describe("Auto-Detection from Weld Names", () => {
    it("should classify standard girth welds C2-C7 and long welds L8-L9 as Type A", () => {
      expect(detectBevelTypeFromWeldName("C2")).toBe("TYPE_A_STANDARD");
      expect(detectBevelTypeFromWeldName("C4")).toBe("TYPE_A_STANDARD");
      expect(detectBevelTypeFromWeldName("C7")).toBe("TYPE_A_STANDARD");
      expect(detectBevelTypeFromWeldName("L8A")).toBe("TYPE_A_STANDARD");
      expect(detectBevelTypeFromWeldName("L9")).toBe("TYPE_A_STANDARD");
    });

    it("should classify lower longitudinal welds L1-L7 as Type B (GTAW Root Pass)", () => {
      expect(detectBevelTypeFromWeldName("L1A")).toBe("TYPE_B_GTAW_ROOT");
      expect(detectBevelTypeFromWeldName("L2B")).toBe("TYPE_B_GTAW_ROOT");
      expect(detectBevelTypeFromWeldName("L7D")).toBe("TYPE_B_GTAW_ROOT");
      expect(detectBevelTypeFromWeldName("L3")).toBe("TYPE_B_GTAW_ROOT");
    });

    it("should classify circumferential seam C8 as Type C (1:10 OD Taper)", () => {
      expect(detectBevelTypeFromWeldName("C8")).toBe("TYPE_C_TAPER_C8");
      expect(detectBevelTypeFromWeldName("C08")).toBe("TYPE_C_TAPER_C8");
      expect(detectBevelTypeFromWeldName("Weld C8")).toBe("TYPE_C_TAPER_C8");
    });

    it("should classify circumferential seams C1, C9, C10, C11 as Type D (Head/Cone 1:10 Taper)", () => {
      expect(detectBevelTypeFromWeldName("C1")).toBe("TYPE_D_TAPER_HEAD");
      expect(detectBevelTypeFromWeldName("C9")).toBe("TYPE_D_TAPER_HEAD");
      expect(detectBevelTypeFromWeldName("C10")).toBe("TYPE_D_TAPER_HEAD");
      expect(detectBevelTypeFromWeldName("C11")).toBe("TYPE_D_TAPER_HEAD");
    });

    it("should classify skirt welds SL1, SL2, SC2 as Type E (Unclad + Convex Cap)", () => {
      expect(detectBevelTypeFromWeldName("SL1A")).toBe("TYPE_E_SKIRT_UNCLAD");
      expect(detectBevelTypeFromWeldName("SL2B")).toBe("TYPE_E_SKIRT_UNCLAD");
      expect(detectBevelTypeFromWeldName("SC2")).toBe("TYPE_E_SKIRT_UNCLAD");
      expect(detectBevelTypeFromWeldName("Skirt Weld")).toBe("TYPE_E_SKIRT_UNCLAD");
    });

    it("should classify circumferential seam C12 as Type F (1:10 Taper + MAX 2mm Heavy ID Crown)", () => {
      expect(detectBevelTypeFromWeldName("C12")).toBe("TYPE_F_HEAVY_CROWN_C12");
      expect(detectBevelTypeFromWeldName("Weld C12")).toBe("TYPE_F_HEAVY_CROWN_C12");
    });

    it("should classify head 1 welds H1A-K as Type G (45° OD / 60° ID Double-V)", () => {
      expect(detectBevelTypeFromWeldName("H1A")).toBe("TYPE_G_HEAD_H1");
      expect(detectBevelTypeFromWeldName("H1K")).toBe("TYPE_G_HEAD_H1");
      expect(detectBevelTypeFromWeldName("H1")).toBe("TYPE_G_HEAD_H1");
    });

    it("should classify head 2 and 3 welds H2/H3 as Type H (45° OD / 50° ID Double-V, 36mm Plate)", () => {
      expect(detectBevelTypeFromWeldName("H2A")).toBe("TYPE_H_HEAD_H2_H3");
      expect(detectBevelTypeFromWeldName("H3D")).toBe("TYPE_H_HEAD_H2_H3");
      expect(detectBevelTypeFromWeldName("H2")).toBe("TYPE_H_HEAD_H2_H3");
    });

    it("should fallback gracefully to Type A for unknown seam names", () => {
      expect(detectBevelTypeFromWeldName("UNKNOWN_WELD")).toBe("TYPE_A_STANDARD");
      expect(detectBevelTypeFromWeldName("")).toBe("TYPE_A_STANDARD");
      expect(detectBevelTypeFromWeldName(undefined)).toBe("TYPE_A_STANDARD");
    });
  });

  describe("Engineering Specification Rules", () => {
    it("should enforce unclad plate with 0.0mm clad and convex cap on Skirt Type E", () => {
      const def = getBevelDefinition("TYPE_E_SKIRT_UNCLAD");
      expect(def.hasCladding).toBe(false);
      expect(def.defaultCladThicknessMm).toBe(0.0);
      expect(def.odCapStyle).toBe("CONVEX");
      expect(def.inconelOverlay).toBe(false);
    });

    it("should enforce 1:10 OD taper on Types C, D, and F", () => {
      const typeC = getBevelDefinition("TYPE_C_TAPER_C8");
      const typeD = getBevelDefinition("TYPE_D_TAPER_HEAD");
      const typeF = getBevelDefinition("TYPE_F_HEAVY_CROWN_C12");

      expect(typeC.hasTaper).toBe(true);
      expect(typeC.taperSlope).toBe("1:10");

      expect(typeD.hasTaper).toBe(true);
      expect(typeD.taperSlope).toBe("1:10");

      expect(typeF.hasTaper).toBe(true);
      expect(typeF.idCapProtrusionMaxMm).toBe(2.0);
    });

    it("should enforce GTAW root pass flag on Type B", () => {
      const def = getBevelDefinition("TYPE_B_GTAW_ROOT");
      expect(def.gtawRootPass).toBe(true);
      expect(def.backChipWidthMm).toBe(6.5);
    });

    it("should enforce asymmetric Double-V angles on Types G and H", () => {
      const typeG = getBevelDefinition("TYPE_G_HEAD_H1");
      const typeH = getBevelDefinition("TYPE_H_HEAD_H2_H3");

      expect(typeG.isDoubleV).toBe(true);
      expect(typeG.grooveAngleDeg).toBe(45.0);
      expect(typeG.idGrooveAngleDeg).toBe(60.0);
      expect(typeG.defaultWallThicknessMm).toBe(32.0);

      expect(typeH.isDoubleV).toBe(true);
      expect(typeH.grooveAngleDeg).toBe(45.0);
      expect(typeH.idGrooveAngleDeg).toBe(50.0);
      expect(typeH.defaultWallThicknessMm).toBe(36.0);
    });
  });
});