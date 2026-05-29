import type { ToolDefinition } from '../types.js';

export const paymentsTools: ToolDefinition[] = [
  {
    id: 'quant-payments.send',
    appId: 'quant-payments',
    name: 'Send Payment',
    description: 'Send a payment to another user',
    inputSchema: {
      recipientId: { type: 'string', required: true, description: 'Recipient user ID' },
      amount: {
        type: 'number',
        required: true,
        description: 'Amount in smallest currency unit (cents)',
      },
      currency: {
        type: 'string',
        required: false,
        description: 'Currency code (USD, EUR)',
        default: 'USD',
      },
      note: { type: 'string', required: false, description: 'Payment note or memo' },
    },
    outputSchema: {
      type: 'object',
      description: 'Payment result',
      fields: {
        transactionId: { type: 'string', description: 'Transaction ID' },
        status: { type: 'string', description: 'Payment status' },
      },
    },
    permissionTier: 3,
    costEstimate: 'high',
    undoRecipe: null,
    tags: ['payments', 'send', 'transfer'],
  },
  {
    id: 'quant-payments.request',
    appId: 'quant-payments',
    name: 'Request Payment',
    description: 'Request a payment from another user',
    inputSchema: {
      fromUserId: { type: 'string', required: true, description: 'User ID to request from' },
      amount: { type: 'number', required: true, description: 'Amount in smallest currency unit' },
      currency: { type: 'string', required: false, description: 'Currency code', default: 'USD' },
      description: { type: 'string', required: true, description: 'Request description' },
    },
    outputSchema: {
      type: 'object',
      description: 'Request result',
      fields: {
        requestId: { type: 'string', description: 'Request ID' },
        status: { type: 'string', description: 'Request status' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['payments', 'request', 'invoice'],
  },
  {
    id: 'quant-payments.invoice',
    appId: 'quant-payments',
    name: 'Create Invoice',
    description: 'Create a professional invoice for a payment',
    inputSchema: {
      recipientEmail: { type: 'string', required: true, description: 'Invoice recipient email' },
      items: {
        type: 'array',
        required: true,
        description: 'Line items with description and amount',
      },
      dueDate: { type: 'string', required: true, description: 'Due date in ISO 8601' },
      currency: { type: 'string', required: false, description: 'Currency code', default: 'USD' },
    },
    outputSchema: {
      type: 'object',
      description: 'Invoice creation result',
      fields: {
        invoiceId: { type: 'string', description: 'Invoice ID' },
        totalAmount: { type: 'number', description: 'Total invoice amount' },
        paymentLink: { type: 'string', description: 'Payment link for recipient' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['payments', 'invoice', 'billing'],
  },
  {
    id: 'quant-payments.refund',
    appId: 'quant-payments',
    name: 'Refund Payment',
    description: 'Issue a refund for a previous transaction',
    inputSchema: {
      transactionId: { type: 'string', required: true, description: 'Original transaction ID' },
      amount: {
        type: 'number',
        required: false,
        description: 'Partial refund amount (omit for full)',
      },
      reason: { type: 'string', required: true, description: 'Refund reason' },
    },
    outputSchema: {
      type: 'object',
      description: 'Refund result',
      fields: {
        refundId: { type: 'string', description: 'Refund ID' },
        status: { type: 'string', description: 'Refund status' },
        amount: { type: 'number', description: 'Refunded amount' },
      },
    },
    permissionTier: 3,
    costEstimate: 'medium',
    undoRecipe: null,
    tags: ['payments', 'refund', 'return'],
  },
  {
    id: 'quant-payments.balance',
    appId: 'quant-payments',
    name: 'Check Balance',
    description: 'Check account balance and recent transactions',
    inputSchema: {
      currency: {
        type: 'string',
        required: false,
        description: 'Currency to check',
        default: 'USD',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Balance information',
      fields: {
        available: { type: 'number', description: 'Available balance' },
        pending: { type: 'number', description: 'Pending amount' },
        currency: { type: 'string', description: 'Currency code' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['payments', 'balance', 'account'],
  },
];
