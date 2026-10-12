// AI proxy: POST /api/ai/smart-replies -> backend POST /ai/smart-replies (QC-F-068)
// The backend route (routes/ai.ts) is the cross-app memory consumer: it feeds
// QuantMail-learned style + contact memory into reply suggestions. Until this
// proxy existed the shipped web app could never reach it (every call 404'd).
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../../_lib/proxy';

export async function POST(request: NextRequest) {
  return proxyToBackend(request, '/ai/smart-replies');
}
