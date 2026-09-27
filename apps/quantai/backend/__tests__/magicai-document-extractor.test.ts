import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import extractorRoutes from '../routes/extractor';
import {
  documentExtractorService,
  extractFromTextContent,
  parseCsvToTable,
  formatExtractedMarkdown,
  type ExtractedDocumentResult,
} from '../services/document-extractor.service';

describe('MagicAI Document & Spreadsheet Data Extractor Engine', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await app.register(extractorRoutes, { prefix: '/api/ai' });
    await app.ready();
  });

  describe('Service: extractFromTextContent', () => {
    it('extracts invoice data from raw text string identifying Invoice #, Grand Total, and Due Date', () => {
      const rawInvoice = `
        TAX INVOICE
        Invoice #: INV-2026-8942
        Date: 2026-09-25
        Due Date: 2026-10-25
        Bill To: Acme Corporation
        From: Quant Cloud Services Inc.

        Item, Quantity, Rate, Amount
        High-Perf GPU Node, 2, 450.00, 900.00
        Sovereign Storage 10TB, 1, 150.00, 150.00

        Subtotal: $1,050.00
        Tax (10%): $105.00
        Grand Total: $1,155.00
      `;

      const result = extractFromTextContent(rawInvoice);

      expect(result).toBeDefined();
      expect(result.documentType).toBe('invoice');
      expect(result.title).toContain('INV-2026-8942');
      expect(result.summary).toContain('INV-2026-8942');

      // Key Values Verification
      expect(result.keyValues.invoiceNumber).toBe('INV-2026-8942');
      expect(result.keyValues.dueDate).toBe('2026-10-25');
      expect(result.keyValues.date).toBe('2026-09-25');
      expect(result.keyValues.grandTotal).toBe(1155);
      expect(result.keyValues.subtotal).toBe(1050);
      expect(result.keyValues.tax).toBe(105);
      expect(result.keyValues.customerName).toBe('Acme Corporation');
      expect(result.keyValues.vendorName).toBe('Quant Cloud Services Inc.');

      // Confidence score between 0.85 and 0.99
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.85);
      expect(result.confidenceScore).toBeLessThanOrEqual(0.99);

      // Embedded Table Check
      expect(result.tables).toBeDefined();
      expect(result.tables!.length).toBeGreaterThan(0);
      expect(result.tables![0].columns.length).toBe(4);
      expect(result.tables![0].rows.length).toBe(2);
    });

    it('extracts receipt data and detects receipt document type', () => {
      const rawReceipt = `
        STORE RECEIPT
        Vendor: Supermart Downtown
        Date: 2026-09-27
        Subtotal: $45.00
        Tax: $4.50
        Total: $49.50
      `;

      const result = extractFromTextContent(rawReceipt);

      expect(result.documentType).toBe('receipt');
      expect(result.keyValues.vendorName).toBe('Supermart Downtown');
      expect(result.keyValues.grandTotal).toBe(49.5);
      expect(result.keyValues.tax).toBe(4.5);
      expect(result.title).toContain('Supermart Downtown');
    });

    it('supports explicit documentType override', () => {
      const text = 'Some generic document content without keywords.';
      const result = extractFromTextContent(text, 'invoice');

      expect(result.documentType).toBe('invoice');
    });

    it('falls back to unstructured document type when no keywords are present', () => {
      const text = 'Just random notes about upcoming team sync.';
      const result = extractFromTextContent(text);

      expect(result.documentType).toBe('unstructured');
      expect(result.confidenceScore).toBe(0.85);
    });
  });

  describe('Service: parseCsvToTable', () => {
    it('parses headers, detects types (number vs string vs currency vs date), and populates rows', () => {
      const csv = `
        Product,Units,UnitPrice,DeliveredAt
        Alpha Cluster,10,$250.00,2026-09-25
        Beta Storage,5,$50.00,2026-09-26
        Gamma Bandwidth,100,$2.50,2026-09-27
      `;

      const result = parseCsvToTable(csv);

      expect(result.columns).toHaveLength(4);
      expect(result.rows).toHaveLength(3);

      // Column definitions
      expect(result.columns[0]).toEqual({ name: 'Product', type: 'string' });
      expect(result.columns[1]).toEqual({ name: 'Units', type: 'number' });
      expect(result.columns[2]).toEqual({ name: 'UnitPrice', type: 'currency' });
      expect(result.columns[3]).toEqual({ name: 'DeliveredAt', type: 'date' });

      // Rows population
      expect(result.rows[0].Product).toBe('Alpha Cluster');
      expect(result.rows[0].Units).toBe(10);
      expect(result.rows[0].UnitPrice).toBe('$250.00');
      expect(result.rows[0].DeliveredAt).toBe('2026-09-25');

      expect(result.rows[2].Units).toBe(100);
    });

    it('parses Markdown formatted tables', () => {
      const markdownTable = `
        | Feature | Status | Priority |
        | :--- | :---: | ---: |
        | Voice Mode | Complete | 1 |
        | Data Extractor | In Progress | 2 |
      `;

      const result = parseCsvToTable(markdownTable);

      expect(result.columns).toHaveLength(3);
      expect(result.columns.map((c) => c.name)).toEqual(['Feature', 'Status', 'Priority']);
      expect(result.columns[2].type).toBe('number');
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].Feature).toBe('Voice Mode');
      expect(result.rows[0].Priority).toBe(1);
    });

    it('handles empty input gracefully', () => {
      const result = parseCsvToTable('');
      expect(result.columns).toEqual([]);
      expect(result.rows).toEqual([]);
    });
  });

  describe('Service: formatExtractedMarkdown', () => {
    it('renders clean readable Markdown table', () => {
      const mockResult: ExtractedDocumentResult = {
        documentType: 'invoice',
        title: 'Invoice #INV-2026-101',
        summary: 'Extracted invoice for Acme Corp with grand total of 1500.',
        confidenceScore: 0.95,
        keyValues: {
          invoiceNumber: 'INV-2026-101',
          dueDate: '2026-10-30',
          grandTotal: 1500,
        },
        tables: [
          {
            columns: [
              { name: 'Item', type: 'string' },
              { name: 'Price', type: 'number' },
            ],
            rows: [
              { Item: 'Database Cluster', Price: 1000 },
              { Item: 'Support Plan', Price: 500 },
            ],
          },
        ],
        extractedAt: '2026-09-27T15:30:00.000Z',
      };

      const md = formatExtractedMarkdown(mockResult);

      expect(md).toContain('# Invoice #INV-2026-101');
      expect(md).toContain('**Type:** INVOICE');
      expect(md).toContain('95%');
      expect(md).toContain('> Extracted invoice for Acme Corp');
      expect(md).toContain('### Key Details');
      expect(md).toContain('| Field | Value |');
      expect(md).toContain('| Invoice Number | INV-2026-101 |');
      expect(md).toContain('| Due Date | 2026-10-30 |');
      expect(md).toContain('| Grand Total | 1500 |');
      expect(md).toContain('### Table 1 (2 rows)');
      expect(md).toContain('| Item | Price |');
      expect(md).toContain('| Database Cluster | 1000 |');
      expect(md).toContain('| Support Plan | 500 |');
    });
  });

  describe('Fastify Extractor Routes', () => {
    it('POST /api/ai/extract/document returns successful structured extraction', async () => {
      const invoiceText = `
        INVOICE
        Invoice No: INV-7788
        Due Date: 2026-11-01
        Total Due: $850.00
      `;

      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/extract/document',
        payload: {
          rawText: invoiceText,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.data.documentType).toBe('invoice');
      expect(json.data.keyValues.invoiceNumber).toBe('INV-7788');
      expect(json.data.keyValues.dueDate).toBe('2026-11-01');
      expect(json.data.keyValues.grandTotal).toBe(850);
      expect(json.data.confidenceScore).toBeGreaterThanOrEqual(0.85);
    });

    it('POST /api/ai/extract/document validates required rawText', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/extract/document',
        payload: {
          rawText: '',
        },
      });

      expect(response.statusCode).toBe(400);
      const json = JSON.parse(response.body);
      expect(json.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/ai/extract/table parses CSV and returns columns and rows', async () => {
      const csv = `ID,Name,Amount\n1,Alpha,100\n2,Beta,200`;

      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/extract/table',
        payload: {
          csvContent: csv,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);
      expect(json.success).toBe(true);
      expect(json.data.columns).toHaveLength(3);
      expect(json.data.rows).toHaveLength(2);
      expect(json.data.rows[0].Name).toBe('Alpha');
      expect(json.data.rows[0].Amount).toBe(100);
    });

    it('POST /api/ai/extract/table validates required csvContent', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ai/extract/table',
        payload: {
          csvContent: '',
        },
      });

      expect(response.statusCode).toBe(400);
      const json = JSON.parse(response.body);
      expect(json.code).toBe('VALIDATION_ERROR');
    });
  });
});
