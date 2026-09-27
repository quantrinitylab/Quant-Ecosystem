import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import {
  formatInvoiceTable,
  formatInvoiceDetails,
  registerInvoiceCommands,
} from '../commands/invoice.js';
import { formatRoomTable, registerRoomCommands } from '../commands/room.js';
import { stripAnsi } from '../git-utils.js';

describe('ERPGo Invoice CLI Helpers & Registration', () => {
  it('formatInvoiceTable properly renders headers and rows with currency and status', () => {
    const mockInvoices = [
      {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-001',
        customerName: 'Acme Corp',
        grandTotal: 1250.5,
        status: 'PAID',
        dueDate: '2026-10-15',
        currency: 'USD',
      },
      {
        id: 'inv-2',
        invoiceNumber: 'INV-2026-002',
        customer: { name: 'Globex Inc' },
        grandTotal: 450.0,
        status: 'SENT',
        dueDate: '2026-10-30',
        currency: 'USD',
      },
    ];

    const tableStr = formatInvoiceTable(mockInvoices);
    const clean = stripAnsi(tableStr);

    expect(clean).toContain('Invoice #');
    expect(clean).toContain('Customer');
    expect(clean).toContain('Grand Total');
    expect(clean).toContain('Status');
    expect(clean).toContain('Due Date');
    expect(clean).toContain('INV-2026-001');
    expect(clean).toContain('Acme Corp');
    expect(clean).toContain('$1,250.50');
    expect(clean).toContain('PAID');
    expect(clean).toContain('Globex Inc');
    expect(clean).toContain('SENT');
  });

  it('formatInvoiceDetails includes customer, line items, and totals', () => {
    const mockInvoice = {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-001',
      customerName: 'Acme Corp',
      customerEmail: 'billing@acme.com',
      status: 'SENT',
      dueDate: '2026-10-15',
      currency: 'USD',
      items: [
        { description: 'Cloud Architecture Audit', quantity: 10, unitPrice: 150, total: 1500 },
        { description: 'DevSecOps Support', quantity: 5, unitPrice: 200, total: 1000 },
      ],
      subtotal: 2500,
      tax: 250,
      grandTotal: 2750,
    };

    const detailsStr = formatInvoiceDetails(mockInvoice);
    const clean = stripAnsi(detailsStr);

    expect(clean).toContain('INV-2026-001');
    expect(clean).toContain('Acme Corp');
    expect(clean).toContain('billing@acme.com');
    expect(clean).toContain('SENT');
    expect(clean).toContain('Cloud Architecture Audit');
    expect(clean).toContain('DevSecOps Support');
    expect(clean).toContain('$2,500.00'); // Subtotal
    expect(clean).toContain('$250.00'); // Tax
    expect(clean).toContain('$2,750.00'); // Grand Total
  });

  it('registerInvoiceCommands binds invoice command and subcommands', () => {
    const program = new Command();
    registerInvoiceCommands(program);

    const invoiceCmd = program.commands.find((c) => c.name() === 'invoice');
    expect(invoiceCmd).toBeDefined();

    const subcommands = invoiceCmd!.commands.map((c) => c.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('view');
    expect(subcommands).toContain('create');
  });
});

describe('Chatter Room CLI Helpers & Registration', () => {
  it('formatRoomTable renders room title, topic, and participant counts', () => {
    const mockRooms = [
      {
        id: 'room-101',
        title: 'Deep Agent Architecture Scaling',
        topic: 'Scaling 15 subagent swarms across EKS clusters',
        host: { name: 'Alice Smith' },
        participantsCount: 42,
      },
      {
        id: 'room-102',
        title: 'Next-Gen React Frontend UI',
        topic: 'Tailwind v4 & Realtime WebSockets',
        hostName: 'Bob Builder',
        participantsCount: 18,
      },
    ];

    const tableStr = formatRoomTable(mockRooms);
    const clean = stripAnsi(tableStr);

    expect(clean).toContain('ID');
    expect(clean).toContain('Title');
    expect(clean).toContain('Topic');
    expect(clean).toContain('Host');
    expect(clean).toContain('Participants');
    expect(clean).toContain('room-101');
    expect(clean).toContain('Deep Agent Architecture Scaling');
    expect(clean).toContain('Scaling 15 subagent swarms');
    expect(clean).toContain('Alice Smith');
    expect(clean).toContain('42');
    expect(clean).toContain('room-102');
    expect(clean).toContain('Next-Gen React Frontend UI');
    expect(clean).toContain('Bob Builder');
    expect(clean).toContain('18');
  });

  it('registerRoomCommands binds room command and subcommands', () => {
    const program = new Command();
    registerRoomCommands(program);

    const roomCmd = program.commands.find((c) => c.name() === 'room');
    expect(roomCmd).toBeDefined();

    const subcommands = roomCmd!.commands.map((c) => c.name());
    expect(subcommands).toContain('list');
    expect(subcommands).toContain('create');
    expect(subcommands).toContain('join');
  });
});
