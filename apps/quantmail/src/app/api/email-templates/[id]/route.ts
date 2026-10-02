import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/email-templates/${id}`, { method: 'GET' });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/email-templates/${id}`, { method: 'PUT' });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/email-templates/${id}`, { method: 'DELETE' });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToBackend(request, `/email-templates/${id}/render`, { method: 'POST' });
}
