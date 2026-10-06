import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.');

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('errors')
      .select(`
        id,
        created_at,
        status,
        error_analyses (
          title,
          error_type,
          severity,
          cause,
          confidence
        )
      `)
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) throw new Error(error.message);

    const labels = { low: '낮음', medium: '보통', high: '높음', critical: '치명적' };

    const items = (data || []).map((row) => {
      const analysis = Array.isArray(row.error_analyses) ? row.error_analyses[0] : row.error_analyses;
      return {
        id: row.id,
        created_at: row.created_at,
        status: row.status,
        title: analysis?.title || null,
        error_type: analysis?.error_type || null,
        severity: analysis?.severity || 'medium',
        severity_label: labels[analysis?.severity] || '확인 필요',
        cause: analysis?.cause || null,
        confidence: analysis?.confidence || null,
      };
    });

    return Response.json({ items });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : '기록을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}
