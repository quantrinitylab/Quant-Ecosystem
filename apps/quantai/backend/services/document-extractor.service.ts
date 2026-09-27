export interface ExtractedTableColumn {
  name: string;
  type: 'string' | 'number' | 'date' | 'currency';
}

export interface ExtractedTableRow {
  [key: string]: any;
}

export interface ExtractedDocumentResult {
  documentType: 'invoice' | 'receipt' | 'table' | 'unstructured';
  title?: string;
  summary: string;
  confidenceScore: number;
  keyValues: Record<string, string | number>;
  tables?: Array<{
    columns: ExtractedTableColumn[];
    rows: ExtractedTableRow[];
  }>;
  extractedAt: string;
}

/**
 * Builds table columns with inferred types and structured rows from raw cell values.
 */
function buildTableFromRaw(
  rawHeaders: string[],
  rawRows: string[][],
): { columns: ExtractedTableColumn[]; rows: ExtractedTableRow[] } {
  const headerNames = rawHeaders.map(
    (h, i) => h.replace(/^["']|["']$/g, '').trim() || `col_${i + 1}`,
  );

  const colTypes: ('string' | 'number' | 'date' | 'currency')[] = headerNames.map((_, colIdx) => {
    const nonBlankValues = rawRows
      .map((r) => r[colIdx]?.trim())
      .filter((v): v is string => Boolean(v && v.length > 0));

    if (nonBlankValues.length === 0) {
      return 'string';
    }

    // Check currency: e.g. $100, $1,200.50, €45, ₹500, 100.00 USD
    const isCurrency = nonBlankValues.every((val) => {
      return (
        /^[$€£₹]\s*-?[\d,]+(?:\.\d+)?$/.test(val) ||
        /^-?[\d,]+(?:\.\d+)?\s*[$€£₹]$/.test(val) ||
        /^-?[\d,]+(?:\.\d+)?\s*(USD|EUR|GBP|INR|CAD|AUD)$/i.test(val)
      );
    });
    if (isCurrency) return 'currency';

    // Check number: e.g. 10, -5.4, 1,234.56, 42
    const isNumber = nonBlankValues.every((val) => {
      const cleaned = val.replace(/,/g, '');
      return /^-?\d+(?:\.\d+)?$/.test(cleaned);
    });
    if (isNumber) return 'number';

    // Check date: e.g. 2026-09-25, 09/25/2026, 25-09-2026, 2026/09/25, Sep 25, 2026
    const isDate = nonBlankValues.every((val) => {
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(val)) return true;
      if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(val)) return true;
      if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(val)) return true;
      const parsed = Date.parse(val);
      return !isNaN(parsed) && (val.includes('-') || val.includes('/') || val.includes(','));
    });
    if (isDate) return 'date';

    return 'string';
  });

  const columns: ExtractedTableColumn[] = headerNames.map((name, i) => ({
    name,
    type: colTypes[i],
  }));

  const rows: ExtractedTableRow[] = rawRows.map((r) => {
    const rowObj: ExtractedTableRow = {};
    columns.forEach((col, colIdx) => {
      const rawVal = r[colIdx]?.replace(/^["']|["']$/g, '').trim() ?? '';
      if (col.type === 'number') {
        const cleaned = rawVal.replace(/,/g, '');
        rowObj[col.name] = rawVal !== '' && !isNaN(Number(cleaned)) ? Number(cleaned) : rawVal;
      } else {
        rowObj[col.name] = rawVal;
      }
    });
    return rowObj;
  });

  return { columns, rows };
}

/**
 * Parses raw CSV or Markdown tabular text into structured columns and rows with detected data types.
 */
export function parseCsvToTable(csvContent: string): {
  columns: ExtractedTableColumn[];
  rows: ExtractedTableRow[];
} {
  if (!csvContent || typeof csvContent !== 'string') {
    return { columns: [], rows: [] };
  }

  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { columns: [], rows: [] };
  }

  const isMarkdownTable = lines[0].includes('|');

  if (isMarkdownTable) {
    const splitMarkdown = (line: string): string[] => {
      const parts = line.split('|').map((s) => s.trim());
      if (parts[0] === '') parts.shift();
      if (parts[parts.length - 1] === '') parts.pop();
      return parts;
    };

    const rawHeaders = splitMarkdown(lines[0]);
    // Filter out separator lines like | --- | :---: | --- |
    const dataLines = lines.slice(1).filter((l) => !/^\|?\s*[-:]+[-|\s:]*$/.test(l));
    const rawRows = dataLines.map(splitMarkdown);

    return buildTableFromRaw(rawHeaders, rawRows);
  }

  // Detect delimiter
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t') && !firstLine.includes(',')) {
    delimiter = '\t';
  } else if (firstLine.includes(';') && !firstLine.includes(',')) {
    delimiter = ';';
  }

  const splitDelimited = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const rawHeaders = splitDelimited(lines[0]);
  const dataLines = lines.slice(1);
  const rawRows = dataLines.map(splitDelimited);

  return buildTableFromRaw(rawHeaders, rawRows);
}

/**
 * Extracts structured data, key-value pairs, tables, and confidence scores from raw document text.
 */
export function extractFromTextContent(
  rawText: string,
  docType: 'invoice' | 'receipt' | 'table' | 'unstructured' | 'auto' = 'auto',
): ExtractedDocumentResult {
  const text = rawText || '';
  const lower = text.toLowerCase();

  // 1. Detect Document Type
  let detectedType: 'invoice' | 'receipt' | 'table' | 'unstructured' = 'unstructured';

  if (docType && docType !== 'auto') {
    if (
      docType === 'invoice' ||
      docType === 'receipt' ||
      docType === 'table' ||
      docType === 'unstructured'
    ) {
      detectedType = docType;
    }
  } else {
    const invoiceKeywords = [
      'invoice',
      'tax invoice',
      'bill to',
      'due date',
      'invoice #',
      'inv #',
      'invoice no',
      'payment terms',
      'po #',
      'purchase order',
      'balance due',
    ];
    const receiptKeywords = [
      'receipt',
      'store receipt',
      'cashier',
      'sales receipt',
      'payment receipt',
      'change due',
      'terminal #',
      'card reader',
    ];

    const hasInvoiceKeywords = invoiceKeywords.some((k) => lower.includes(k));
    const hasReceiptKeywords = receiptKeywords.some((k) => lower.includes(k));

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const commaLines = lines.filter((l) => (l.match(/,/g) || []).length >= 2);
    const pipeLines = lines.filter((l) => (l.match(/\|/g) || []).length >= 2);
    const isPredominantlyTable =
      lines.length >= 2 &&
      (commaLines.length >= Math.ceil(lines.length * 0.6) ||
        pipeLines.length >= Math.ceil(lines.length * 0.6));

    if (hasInvoiceKeywords) {
      detectedType = 'invoice';
    } else if (hasReceiptKeywords) {
      detectedType = 'receipt';
    } else if (isPredominantlyTable) {
      detectedType = 'table';
    } else {
      detectedType = 'unstructured';
    }
  }

  // 2. Extract Key-Values
  const keyValues: Record<string, string | number> = {};

  // Invoice Number (require specific prefix/separator to avoid capturing header labels)
  const invoiceNumMatch = text.match(
    /(?:(?:invoice|inv|bill)\s*(?:#|no\.?|number|id|num)\s*[:#\-]?|(?:invoice|inv|bill)\s*[:#\-])[^\S\r\n]*([A-Za-z0-9\-_]+)/i,
  );
  if (invoiceNumMatch && invoiceNumMatch[1]) {
    keyValues['invoiceNumber'] = invoiceNumMatch[1].trim();
  }

  // Due Date
  const dueDateMatch = text.match(
    /(?:due\s*date|payment\s*due)[^\S\r\n]*[:#\-]?[^\S\r\n]*([A-Za-z0-9\s,\/\-]+?)(?:\r?\n|$|\s{2,})/i,
  );
  if (dueDateMatch && dueDateMatch[1]) {
    keyValues['dueDate'] = dueDateMatch[1].trim();
  }

  // Issue Date / Date (exclude due date)
  const dateMatch = text.match(
    /(?:invoice\s*date|issue\s*date|date\s*of\s*issue|bill\s*date|(?<!due\s*)date)[^\S\r\n]*[:#\-]?[^\S\r\n]*([A-Za-z0-9\s,\/\-]+?)(?:\r?\n|$|\s{2,})/i,
  );
  if (dateMatch && dateMatch[1]) {
    keyValues['date'] = dateMatch[1].trim();
  }

  // Grand Total / Total
  const grandTotalMatch = text.match(
    /(?:grand\s*total|total\s*amount|total\s*due|balance\s*due|amount\s*due)[^\S\r\n]*[:#\-]?[^\S\r\n]*([$€£₹]?\s*[\d,]+(?:\.\d{1,2})?)/i,
  );
  if (grandTotalMatch && grandTotalMatch[1]) {
    const rawTotal = grandTotalMatch[1];
    const num = parseFloat(rawTotal.replace(/[$€£₹,\s]/g, ''));
    keyValues['grandTotal'] = !isNaN(num) ? num : rawTotal.trim();
  } else {
    const totalMatch = text.match(
      /(?:^|\n)[^\S\r\n]*total[^\S\r\n]*[:#\-]?[^\S\r\n]*([$€£₹]?\s*[\d,]+(?:\.\d{1,2})?)/i,
    );
    if (totalMatch && totalMatch[1]) {
      const rawTotal = totalMatch[1];
      const num = parseFloat(rawTotal.replace(/[$€£₹,\s]/g, ''));
      keyValues['grandTotal'] = !isNaN(num) ? num : rawTotal.trim();
    }
  }

  // Subtotal
  const subtotalMatch = text.match(
    /(?:subtotal|sub-total|sub\s*total)[^\S\r\n]*[:#\-]?[^\S\r\n]*([$€£₹]?\s*[\d,]+(?:\.\d{1,2})?)/i,
  );
  if (subtotalMatch && subtotalMatch[1]) {
    const rawSub = subtotalMatch[1];
    const num = parseFloat(rawSub.replace(/[$€£₹,\s]/g, ''));
    keyValues['subtotal'] = !isNaN(num) ? num : rawSub.trim();
  }

  // Tax / VAT / GST
  const taxMatch = text.match(
    /(?:tax|vat|gst|sales\s*tax)\s*(?:\([^)]*\))?[^\S\r\n]*[:#\-]?[^\S\r\n]*([$€£₹]?\s*[\d,]+(?:\.\d{1,2})?)/i,
  );
  if (taxMatch && taxMatch[1]) {
    const rawTax = taxMatch[1];
    const num = parseFloat(rawTax.replace(/[$€£₹,\s]/g, ''));
    keyValues['tax'] = !isNaN(num) ? num : rawTax.trim();
  }

  // Customer Name / Bill To
  const customerMatch = text.match(
    /(?:bill\s*to|billed\s*to|customer\s*(?:name)?|client\s*(?:name)?|recipient)[^\S\r\n]*[:#\-]?[^\S\r\n]*([^\r\n,]+)/i,
  );
  if (customerMatch && customerMatch[1]) {
    keyValues['customerName'] = customerMatch[1].trim();
  }

  // Vendor Name / From
  const vendorMatch = text.match(
    /(?:vendor\s*(?:name)?|merchant\s*(?:name)?|company\s*(?:name)?|issued\s*by|(?<!bill\s*)from)[^\S\r\n]*[:#\-]?[^\S\r\n]*([^\r\n,]+)/i,
  );
  if (vendorMatch && vendorMatch[1]) {
    keyValues['vendorName'] = vendorMatch[1].trim();
  }

  // PO Number
  const poMatch = text.match(
    /(?:po\s*(?:#|no\.?|number)?|purchase\s*order)\s*[:#\-]?\s*([A-Za-z0-9\-_]+)/i,
  );
  if (poMatch && poMatch[1]) {
    keyValues['poNumber'] = poMatch[1].trim();
  }

  // 3. Table / CSV Extraction
  const tables: Array<{ columns: ExtractedTableColumn[]; rows: ExtractedTableRow[] }> = [];

  if (detectedType === 'table') {
    const tableData = parseCsvToTable(text);
    if (tableData.columns.length > 0 && tableData.rows.length > 0) {
      tables.push(tableData);
    }
  } else {
    const lines = text.split(/\r?\n/);
    const tableLines: string[] = [];
    let inTable = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const hasDelimiters =
        trimmed.includes('|') ||
        (trimmed.match(/,/g) || []).length >= 2 ||
        (trimmed.match(/\t/g) || []).length >= 2;

      if (hasDelimiters) {
        tableLines.push(trimmed);
        inTable = true;
      } else if (inTable) {
        if (tableLines.length >= 2) {
          const parsed = parseCsvToTable(tableLines.join('\n'));
          if (parsed.columns.length >= 2 && parsed.rows.length >= 1) {
            tables.push(parsed);
          }
        }
        tableLines.length = 0;
        inTable = false;
      }
    }

    if (tableLines.length >= 2) {
      const parsed = parseCsvToTable(tableLines.join('\n'));
      if (parsed.columns.length >= 2 && parsed.rows.length >= 1) {
        tables.push(parsed);
      }
    }
  }

  // 4. Compute Confidence Score (0.85 to 0.99 based on matched fields)
  let confidenceScore = 0.85;
  if (keyValues['invoiceNumber']) confidenceScore += 0.03;
  if (keyValues['grandTotal'] !== undefined) confidenceScore += 0.03;
  if (keyValues['dueDate']) confidenceScore += 0.02;
  if (keyValues['date']) confidenceScore += 0.02;
  if (keyValues['customerName']) confidenceScore += 0.02;
  if (keyValues['tax'] !== undefined) confidenceScore += 0.01;
  if (keyValues['vendorName']) confidenceScore += 0.01;
  if (tables.length > 0 && tables[0].rows.length > 0) confidenceScore += 0.03;
  if (docType && docType !== 'auto') confidenceScore += 0.01;

  confidenceScore = Math.min(0.99, Math.round(confidenceScore * 100) / 100);

  // 5. Title & Summary
  let title = 'Extracted Document';
  let summary = 'Document data extracted successfully.';

  if (detectedType === 'invoice') {
    title = keyValues['invoiceNumber']
      ? `Invoice #${keyValues['invoiceNumber']}`
      : 'Parsed Invoice';
    summary = `Extracted invoice${
      keyValues['invoiceNumber'] ? ` #${keyValues['invoiceNumber']}` : ''
    }${keyValues['customerName'] ? ` for ${keyValues['customerName']}` : ''} with grand total of ${
      keyValues['grandTotal'] ?? 'N/A'
    }${keyValues['dueDate'] ? ` (Due: ${keyValues['dueDate']})` : ''}.`;
  } else if (detectedType === 'receipt') {
    title = keyValues['vendorName'] ? `Receipt from ${keyValues['vendorName']}` : 'Store Receipt';
    summary = `Extracted receipt${
      keyValues['vendorName'] ? ` from ${keyValues['vendorName']}` : ''
    } with total of ${keyValues['grandTotal'] ?? 'N/A'}.`;
  } else if (detectedType === 'table') {
    const colCount = tables[0]?.columns?.length ?? 0;
    const rowCount = tables[0]?.rows?.length ?? 0;
    title = 'Spreadsheet & Tabular Data';
    summary = `Extracted tabular dataset containing ${colCount} columns and ${rowCount} rows.`;
  } else {
    title = 'Unstructured Document Extraction';
    summary = `Extracted ${
      Object.keys(keyValues).length
    } key entities and fields from unstructured document text.`;
  }

  const result: ExtractedDocumentResult = {
    documentType: detectedType,
    title,
    summary,
    confidenceScore,
    keyValues,
    ...(tables.length > 0 ? { tables } : {}),
    extractedAt: new Date().toISOString(),
  };

  return result;
}

/**
 * Formats extracted document results into clean, readable GitHub-flavored Markdown.
 */
export function formatExtractedMarkdown(result: ExtractedDocumentResult): string {
  const parts: string[] = [];

  // Header & Title
  parts.push(`# ${result.title || 'Extracted Document'}\n`);
  parts.push(
    `**Type:** ${result.documentType.toUpperCase()} | **Confidence:** ${(
      result.confidenceScore * 100
    ).toFixed(0)}% | **Extracted At:** ${result.extractedAt}\n`,
  );
  parts.push(`> ${result.summary}\n`);

  // Key Values Table
  const kvKeys = Object.keys(result.keyValues);
  if (kvKeys.length > 0) {
    parts.push(`### Key Details\n`);
    parts.push(`| Field | Value |`);
    parts.push(`| :--- | :--- |`);
    for (const key of kvKeys) {
      const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
      parts.push(`| ${label} | ${result.keyValues[key]} |`);
    }
    parts.push('');
  }

  // Tables
  if (result.tables && result.tables.length > 0) {
    result.tables.forEach((table, index) => {
      parts.push(`### Table ${index + 1} (${table.rows.length} rows)\n`);
      const headers = table.columns.map((c) => c.name);
      parts.push(`| ${headers.join(' | ')} |`);
      parts.push(`| ${headers.map(() => '---').join(' | ')} |`);
      for (const row of table.rows) {
        const rowValues = table.columns.map((c) => {
          const val = row[c.name];
          return val !== undefined && val !== null ? String(val) : '';
        });
        parts.push(`| ${rowValues.join(' | ')} |`);
      }
      parts.push('');
    });
  }

  return parts.join('\n');
}

export class DocumentExtractorService {
  public extractFromTextContent(
    rawText: string,
    docType?: 'invoice' | 'receipt' | 'table' | 'unstructured' | 'auto',
  ): ExtractedDocumentResult {
    return extractFromTextContent(rawText, docType);
  }

  public parseCsvToTable(csvContent: string): {
    columns: ExtractedTableColumn[];
    rows: ExtractedTableRow[];
  } {
    return parseCsvToTable(csvContent);
  }

  public formatExtractedMarkdown(result: ExtractedDocumentResult): string {
    return formatExtractedMarkdown(result);
  }
}

export const documentExtractorService = new DocumentExtractorService();
