export interface ColorScaleTier {
  id: string;
  label: string;
  minDepthMm: number;
  maxDepthMm: number | null; // null represents unbound upper tier (e.g. above 10mm)
  color: string; // Hex color
  textColor?: string;
  badgeBg?: string;
}

export interface ColorScaleConfig {
  id?: string;
  name: string;
  clientId?: number;
  drumId?: number;
  soundWallColor: string; // Default Green for "No crack"
  tiers: ColorScaleTier[];
}

/**
 * Standard Default 5-Tier Color Scale matching Client & SEZ Reference Drawing:
 * Green: No crack
 * Yellow: 0.5 to 3mm
 * Orange: 3.1 to 6mm
 * Red: 6.1 to 10mm
 * Maroon: above 10mm
 */
export const DEFAULT_COLOR_SCALE: ColorScaleConfig = {
  name: "Standard PAUT Reference Scale",
  soundWallColor: "#7CFC00", // Solid bright light green
  tiers: [
    {
      id: "tier-1",
      label: "0.5 to 3mm",
      minDepthMm: 0.5,
      maxDepthMm: 3.0,
      color: "#eab308", // Yellow
      textColor: "#854d0e",
      badgeBg: "#fef9c3",
    },
    {
      id: "tier-2",
      label: "3.1 to 6mm",
      minDepthMm: 3.1,
      maxDepthMm: 6.0,
      color: "#f97316", // Orange
      textColor: "#9a3412",
      badgeBg: "#ffedd5",
    },
    {
      id: "tier-3",
      label: "6.1 to 10mm",
      minDepthMm: 6.1,
      maxDepthMm: 10.0,
      color: "#dc2626", // Red
      textColor: "#991b1b",
      badgeBg: "#fee2e2",
    },
    {
      id: "tier-4",
      label: "above 10mm",
      minDepthMm: 10.1,
      maxDepthMm: null,
      color: "#800000", // Dark Maroon
      textColor: "#450a0a",
      badgeBg: "#fecdd3",
    },
  ],
};

const STORAGE_KEY_ADMIN_OVERRIDE = "paut_admin_color_scale_override";
const STORAGE_KEY_CLIENT_PREFIX = "paut_client_color_scale_";
const STORAGE_KEY_DRUM_PREFIX = "paut_drum_color_scale_";

/**
 * Resolves color for a given crack depth using active or provided scale configuration
 */
export function getFlawDepthColor(
  depth: number,
  customScale?: ColorScaleConfig | null
): string {
  const scale = customScale || getStoredColorScale();
  if (depth <= 0) return scale.soundWallColor;

  for (const tier of scale.tiers) {
    if (tier.maxDepthMm === null) {
      if (depth >= tier.minDepthMm) return tier.color;
    } else {
      if (depth <= tier.maxDepthMm) return tier.color;
    }
  }

  // Fallback to highest tier color or dark red
  return scale.tiers[scale.tiers.length - 1]?.color || "#800000";
}

/**
 * Resolves full tier information for a given crack depth
 */
export function getDepthGrade(
  depth: number,
  customScale?: ColorScaleConfig | null
): {
  label: string;
  fillColor: string;
  textColor: string;
  badgeBg: string;
} {
  const scale = customScale || getStoredColorScale();
  if (depth <= 0) {
    return {
      label: "No crack",
      fillColor: scale.soundWallColor,
      textColor: "#14532d",
      badgeBg: "#dcfce7",
    };
  }

  for (const tier of scale.tiers) {
    if (tier.maxDepthMm === null) {
      if (depth >= tier.minDepthMm) {
        return {
          label: tier.label,
          fillColor: tier.color,
          textColor: tier.textColor || "#ffffff",
          badgeBg: tier.badgeBg || tier.color,
        };
      }
    } else {
      if (depth <= tier.maxDepthMm) {
        return {
          label: tier.label,
          fillColor: tier.color,
          textColor: tier.textColor || "#ffffff",
          badgeBg: tier.badgeBg || tier.color,
        };
      }
    }
  }

  const lastTier = scale.tiers[scale.tiers.length - 1];
  return {
    label: lastTier?.label || "above 10mm",
    fillColor: lastTier?.color || "#800000",
    textColor: lastTier?.textColor || "#ffffff",
    badgeBg: lastTier?.badgeBg || "#800000",
  };
}

/**
 * Retrieve stored color scale for context (checks drum -> client -> admin global -> default)
 */
export function getStoredColorScale(
  clientId?: number | null,
  drumId?: number | null
): ColorScaleConfig {
  if (typeof window === "undefined") return DEFAULT_COLOR_SCALE;

  try {
    // 1. Drum-specific override
    if (drumId) {
      const drumRaw = localStorage.getItem(`${STORAGE_KEY_DRUM_PREFIX}${drumId}`);
      if (drumRaw) return JSON.parse(drumRaw);
    }

    // 2. Client-specific override
    if (clientId) {
      const clientRaw = localStorage.getItem(`${STORAGE_KEY_CLIENT_PREFIX}${clientId}`);
      if (clientRaw) return JSON.parse(clientRaw);
    }

    // 3. Admin global override
    const adminRaw = localStorage.getItem(STORAGE_KEY_ADMIN_OVERRIDE);
    if (adminRaw) return JSON.parse(adminRaw);
  } catch (err) {
    console.warn("Failed to read color scale from storage:", err);
  }

  return DEFAULT_COLOR_SCALE;
}

/**
 * Persist Admin Global Color Scale override
 */
export function saveAdminGlobalColorScale(config: ColorScaleConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_ADMIN_OVERRIDE, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent("paut-color-scale-updated", { detail: config }));
  } catch (err) {
    console.warn("Failed to persist admin color scale:", err);
  }
}

/**
 * Persist Drum-Specific Color Scale override
 */
export function saveDrumColorScale(drumId: number, config: ColorScaleConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY_DRUM_PREFIX}${drumId}`, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent("paut-color-scale-updated", { detail: config }));
  } catch (err) {
    console.warn("Failed to persist drum color scale:", err);
  }
}

/**
 * Persist Client Facility Specific Color Scale override
 */
export function saveClientColorScale(clientId: number, config: ColorScaleConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY_CLIENT_PREFIX}${clientId}`, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent("paut-color-scale-updated", { detail: config }));
  } catch (err) {
    console.warn("Failed to persist client color scale:", err);
  }
}

/**
 * Reset to system default color scale for global admin
 */
export function resetAdminGlobalColorScale(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_ADMIN_OVERRIDE);
    window.dispatchEvent(new CustomEvent("paut-color-scale-updated", { detail: DEFAULT_COLOR_SCALE }));
  } catch (err) {
    console.warn("Failed to reset color scale:", err);
  }
}

/**
 * Reset drum specific color scale
 */
export function resetDrumColorScale(drumId: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${STORAGE_KEY_DRUM_PREFIX}${drumId}`);
    window.dispatchEvent(new CustomEvent("paut-color-scale-updated", { detail: getStoredColorScale() }));
  } catch (err) {
    console.warn("Failed to reset drum color scale:", err);
  }
}

/**
 * Reset client specific color scale
 */
export function resetClientColorScale(clientId: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`${STORAGE_KEY_CLIENT_PREFIX}${clientId}`);
    window.dispatchEvent(new CustomEvent("paut-color-scale-updated", { detail: getStoredColorScale() }));
  } catch (err) {
    console.warn("Failed to reset client color scale:", err);
  }
}
