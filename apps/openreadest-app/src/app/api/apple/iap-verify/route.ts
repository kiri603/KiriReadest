import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    { error: 'KiriReadest has disabled payment and subscription services.', purchase: null },
    { status: 410 },
  );
}
