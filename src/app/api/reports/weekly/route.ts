import { NextResponse } from 'next/server';
import { buildWeeklyReport, writeWeeklyReport } from '@/lib/reports/weekly';

export async function GET() {
  try {
    return NextResponse.json(buildWeeklyReport());
  } catch (error) {
    console.error('[GET /api/reports/weekly]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json(await writeWeeklyReport());
  } catch (error) {
    console.error('[POST /api/reports/weekly]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
