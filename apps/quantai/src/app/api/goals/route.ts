import { NextRequest } from 'next/server';
import { proxyGoals } from './_lib';

export async function GET(request: NextRequest) {
  return proxyGoals(request, 'GET', '/goals');
}

export async function POST(request: NextRequest) {
  return proxyGoals(request, 'POST', '/goals');
}
