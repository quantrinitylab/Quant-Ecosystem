// GET /api/quanty/mcp/catalog — curated consumer connector catalog.
// Spec: { providers: [{ id, name, icon, category, description, authType, deviceSource? }] }
import { NextResponse } from 'next/server';
import { toCatalogPayload } from '../../../../../lib/connectors/catalog';

export async function GET() {
  return NextResponse.json(toCatalogPayload());
}
