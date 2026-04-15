import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL || '';
  if (!apiOrigin) {
    return NextResponse.json(
      {
        success: false,
        message: 'NEXT_PUBLIC_API_URL não configurada na Vercel.',
      },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`${apiOrigin.replace(/\/$/, '')}/health`, {
      method: 'GET',
      cache: 'no-store',
    });

    const data = await res.json().catch(() => null);
    return NextResponse.json(
      {
        success: res.ok,
        frontend: 'ok',
        backend: data ?? { status: res.status },
        apiOrigin,
      },
      { status: res.ok ? 200 : 502 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        success: false,
        frontend: 'ok',
        message: 'Falha ao conectar no backend (Render).',
        error: String(e?.message || e),
        apiOrigin,
      },
      { status: 502 }
    );
  }
}

