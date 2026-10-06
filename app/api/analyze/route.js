import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.');

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestGemini(apiKey, body) {
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(MODEL) + ':generateContent';
  const delays = [0, 1000, 2000, 4000];
  let lastMessage = '';

  for (const delay of delays) {
    if (delay) await sleep(delay);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;

    lastMessage = data?.error?.message || data?.message || 'Gemini 요청에 실패했습니다.';
    if (![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(lastMessage);
    }
  }

  throw new Error('Gemini 서버가 혼잡하거나 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요. ' + lastMessage);
}

function extractText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function normalizeAnalysis(value) {
  const allowed = ['low', 'medium', 'high', 'critical'];
  const severity = allowed.includes(value?.severity) ? value.severity : 'medium';
  const labels = { low: '낮음', medium: '보통', high: '높음', critical: '치명적' };

  return {
    title: String(value?.title || '분석된 에러').trim(),
    error_type: String(value?.error_type || 'Unknown Error').trim(),
    language: String(value?.language || '확인되지 않음').trim(),
    severity,
    severity_label: labels[severity],
    explanation: String(value?.explanation || '오류 설명을 확인하지 못했습니다.').trim(),
    cause: String(value?.cause || '명확한 원인을 확인하지 못했습니다.').trim(),
    solution_steps: Array.isArray(value?.solution_steps)
      ? value.solution_steps.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 7)
      : [],
    code_example: typeof value?.code_example === 'string' ? value.code_example.trim() : '',
    prevention: typeof value?.prevention === 'string' ? value.prevention.trim() : '',
    confidence: typeof value?.confidence === 'string' ? value.confidence.trim() : '보통',
  };
}

export async function POST(request) {
  let errorId = null;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

    const form = await request.formData();
    const image = form.get('image');
    const errorText = String(form.get('errorText') || '').trim();
    const context = String(form.get('context') || '').trim();
    const hasImage = image && typeof image !== 'string' && image.size > 0;

    if (!hasImage && !errorText) {
      return Response.json({ success: false, error: '에러 이미지 또는 에러 메시지가 필요합니다.' }, { status: 400 });
    }
    if (hasImage && !image.type.startsWith('image/')) {
      return Response.json({ success: false, error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
    }
    if (hasImage && image.size > MAX_IMAGE_SIZE) {
      return Response.json({ success: false, error: '이미지는 10MB 이하만 업로드할 수 있습니다.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    let imagePath = null;
    let imageBytes = null;

    if (hasImage) {
      const extension = image.name.split('.').pop()?.toLowerCase() || 'png';
      imagePath = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
      imageBytes = Buffer.from(await image.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('error-images')
        .upload(imagePath, imageBytes, {
          contentType: image.type || 'image/png',
          upsert: false,
        });

      if (uploadError) throw new Error('에러 캡처 저장 실패: ' + uploadError.message);
    }

    const { data: errorRow, error: insertError } = await supabase
      .from('errors')
      .insert({
        source_type: hasImage && errorText ? 'image_text' : hasImage ? 'image' : 'text',
        original_text: errorText || null,
        context: context || null,
        image_path: imagePath,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertError) throw new Error('분석 기록 생성 실패: ' + insertError.message);
    errorId = errorRow.id;

    const prompt = `당신은 개발 에러 디버깅 도우미입니다.
사용자가 제공한 실제 에러 화면, 에러 메시지, 상황 설명에 근거해서만 분석하세요.
확인되지 않은 프레임워크, 파일명, 코드 내용을 사실처럼 만들어내지 마세요.
정보가 부족하다면 가장 가능성이 높은 원인을 설명하되 추정이라고 명확히 표현하세요.

사용자 입력:
- 에러 메시지: ${errorText || '(이미지에서 확인)'}
- 상황 설명: ${context || '(없음)'}

출력 기준:
- title: 한눈에 이해되는 한국어 제목
- error_type: 구체적인 오류 종류
- language: 화면/메시지에서 추정 가능한 언어 또는 기술 스택
- severity: low, medium, high, critical 중 하나
- explanation: 초보자도 이해할 수 있는 오류 의미
- cause: 가장 가능성이 높은 원인
- solution_steps: 안전하고 실제로 확인 가능한 해결 순서를 2~7단계
- code_example: 수정 코드가 정말 도움이 될 때만 작성. 불필요하면 빈 문자열
- prevention: 같은 오류를 예방하는 간단한 방법
- confidence: 높음, 보통, 낮음 중 하나`;

    const parts = [{ text: prompt }];
    if (hasImage) {
      parts.push({
        inlineData: {
          mimeType: image.type || 'image/png',
          data: imageBytes.toString('base64'),
        },
      });
    }

    const geminiData = await requestGemini(apiKey, {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            error_type: { type: 'STRING' },
            language: { type: 'STRING' },
            severity: { type: 'STRING', enum: ['low', 'medium', 'high', 'critical'] },
            explanation: { type: 'STRING' },
            cause: { type: 'STRING' },
            solution_steps: { type: 'ARRAY', items: { type: 'STRING' } },
            code_example: { type: 'STRING' },
            prevention: { type: 'STRING' },
            confidence: { type: 'STRING', enum: ['높음', '보통', '낮음'] },
          },
          required: ['title','error_type','language','severity','explanation','cause','solution_steps','code_example','prevention','confidence'],
        },
      },
    });

    const raw = extractText(geminiData);
    if (!raw) throw new Error('Gemini가 분석 결과를 반환하지 않았습니다.');

    const analysis = normalizeAnalysis(JSON.parse(raw));

    const { error: analysisError } = await supabase
      .from('error_analyses')
      .insert({
        error_id: errorId,
        title: analysis.title,
        error_type: analysis.error_type,
        language: analysis.language,
        severity: analysis.severity,
        explanation: analysis.explanation,
        cause: analysis.cause,
        solution_steps: analysis.solution_steps,
        code_example: analysis.code_example || null,
        prevention: analysis.prevention || null,
        confidence: analysis.confidence,
      });

    if (analysisError) throw new Error('분석 결과 저장 실패: ' + analysisError.message);

    await supabase.from('errors').update({ status: 'done' }).eq('id', errorId);

    return Response.json({ success: true, analysis });
  } catch (error) {
    if (errorId) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase.from('errors').update({ status: 'error' }).eq('id', errorId);
      } catch {}
    }

    return Response.json(
      { success: false, error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
