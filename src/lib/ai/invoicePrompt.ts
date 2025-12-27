export const invoiceExtractionSchema = {
  type: "object",
  properties: {
    totalAmount: {
      type: "number",
      description: "Total amount of the invoice (numeric value only, without currency symbol)"
    },
    currency: {
      type: "string",
      description: "Currency code (EUR, USD, GBP, etc.). Default to EUR if not found."
    },
    invoiceNumber: {
      type: "string",
      description: "Invoice number or reference"
    },
    invoiceDate: {
      type: "string",
      description: "Invoice date in YYYY-MM-DD format"
    },
    vendorName: {
      type: "string",
      description: "Name of the vendor or company issuing the invoice"
    },
    purpose: {
      type: "string",
      description: "Short purpose / concept if clearly stated on the invoice (e.g. 'Fuel', 'Hotel', 'Toll', 'Parking', 'Car rental')."
    }
  },
  required: ["totalAmount"]
};

export function buildInvoiceExtractorPrompt(content: string): string {
  return `You are an expert invoice data extractor. Extract the following information from the invoice document:

REQUIRED:
- totalAmount: The total amount to pay (just the number, no currency symbol)
- currency: The currency code (EUR, USD, GBP, etc.)

OPTIONAL (but extract if present):
- invoiceNumber: Invoice number or reference
- invoiceDate: Date in YYYY-MM-DD format
- vendorName: Name of the company/vendor
- purpose: A short purpose/concept ONLY if clearly stated (e.g. "Concepto", "Descripción", "Motivo", "Service", "Item"). Keep it brief (max ~8 words). If unclear, return null.

IMPORTANT RULES:
- For totalAmount, extract ONLY the final total amount (not subtotals or line items)
- If multiple totals exist (before/after tax), use the final amount including all taxes
- Remove all currency symbols, commas, and spaces from the amount
- Convert commas to dots for decimal separator (e.g., "1.234,56" becomes 1234.56)
- If currency is not explicit, default to "EUR"
- Return ONLY valid JSON matching the schema
- If data is unclear or missing, return null for optional fields

Document content:
${content}`;
}
