/**
 * Validation utilities for fuel consumption inputs
 */

export type ConsumptionValidationResult = 
  | { valid: true }
  | { valid: false; type: "excessive" | "tooLow"; value: number };

/**
 * Validates fuel consumption (gasoline/diesel) in L/100km
 * @param value - Consumption in L/100km
 * @returns Validation result
 */
export function validateFuelConsumption(value: number | null | undefined): ConsumptionValidationResult {
  if (value == null || !Number.isFinite(value)) {
    return { valid: true }; // null/undefined is allowed (will use fallback)
  }
  
  if (value > 50) {
    return { valid: false, type: "excessive", value };
  }
  
  if (value < 3 && value > 0) {
    return { valid: false, type: "tooLow", value };
  }
  
  return { valid: true };
}

/**
 * Validates EV consumption in kWh/100km
 * @param value - Consumption in kWh/100km
 * @returns Validation result
 */
export function validateEvConsumption(value: number | null | undefined): ConsumptionValidationResult {
  if (value == null || !Number.isFinite(value)) {
    return { valid: true }; // null/undefined is allowed (will use fallback)
  }
  
  if (value > 35) {
    return { valid: false, type: "excessive", value };
  }
  
  if (value < 10 && value > 0) {
    return { valid: false, type: "tooLow", value };
  }
  
  return { valid: true };
}

/**
 * Gets user-friendly error message for consumption validation failure
 */
export function getConsumptionErrorMessage(
  result: ConsumptionValidationResult,
  isEv: boolean
): string | null {
  if (result.valid) return null;
  
  // Type assertion: we know result is the error variant
  const errorResult = result as { valid: false; type: "excessive" | "tooLow"; value: number };
  const unit = isEv ? "kWh/100km" : "L/100km";
  const maxValue = isEv ? 35 : 50;
  const minValue = isEv ? 10 : 3;
  
  if (errorResult.type === "excessive") {
    return `Consumo excesivo: ${errorResult.value} ${unit}. El máximo permitido es ${maxValue} ${unit}.`;
  }
  
  // errorResult.type === "tooLow"
  return `Consumo demasiado bajo: ${errorResult.value} ${unit}. El mínimo realista es ${minValue} ${unit}.`;
}
