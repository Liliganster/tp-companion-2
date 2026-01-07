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
 * Gets structured error data for consumption validation failure
 * Returns data that can be used with i18n translations
 */
export type ConsumptionErrorData = {
  type: "excessive" | "tooLow";
  value: number;
  unit: string;
  max: number;
  min: number;
};

export function getConsumptionErrorData(
  result: ConsumptionValidationResult,
  isEv: boolean
): ConsumptionErrorData | null {
  if (result.valid) return null;
  
  // Type assertion: we know result is the error variant
  const errorResult = result as { valid: false; type: "excessive" | "tooLow"; value: number };
  const unit = isEv ? "kWh/100km" : "L/100km";
  const maxValue = isEv ? 35 : 50;
  const minValue = isEv ? 10 : 3;
  
  return {
    type: errorResult.type,
    value: errorResult.value,
    unit,
    max: maxValue,
    min: minValue,
  };
}
