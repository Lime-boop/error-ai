'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const SUPABASE_URL = 'https://eghkbgjebsoiybojvoak.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3euAUhIGpr_qgTr-rgtiaQ_SDHdPJ5U';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function getFunctionErrorMessage(error, fallback) {
  try {
    if (error?.context && typeof error.context.clone === 'function') {
      const body = await error.context.clone().json();
      if (body?.error) return body.error;
    }
  } catch {}

  return error?.message || fallback;
}

export default function Home() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [errorText, setErrorText] = useState('');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const { data: invokeData, error } = await supabase.functions.invoke('error-ai', {
        method: 'GET',
      });

      if (error) {
        throw new Error(
          await getFunctionErrorMessage(error, '기록을 불러오지 못했습니다.')
        );
      }
      const data = invokeData || {};
      if (data.error) throw new Error(data.error);
      setHistory(data.items || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => { loadHistory(); }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(selectedFile) {
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith('image/')) {
      setMessage('PNG, JPG, WEBP 등 이미지 파일을 선택해주세요.');
      return;
    }
    if (selectedFile.size > MAX_IMAGE_SIZE) {
      setMessage('이미지는 10MB 이하만 업로드할 수 있습니다.');
      return;
    }
    setFile(selectedFile);
    setResult(null);
    setMessage('');
  }

  async function handleAnalyze() {
    if (busy || (!file && !errorText.trim())) return;
    setBusy(true);
    setResult(null);
    setMessage('AI가 에러를 분석하고 있습니다...');

    try {
      const form = new FormData();
      if (file) form.append('image', file);
      form.append('errorText', errorText.trim());
      form.append('context', context.trim());

      const { data: invokeData, error } = await supabase.functions.invoke('error-ai', {
        body: form,
      });

      if (error) {
        throw new Error(
          await getFunctionErrorMessage(error, '에러 분석에 실패했습니다.')
        );
      }
      const data = invokeData || {};

      if (!data.success) {
        throw new Error(data.error || '에러 분석에 실패했습니다.');
      }

      setResult(data.analysis);
      setMessage('분석이 완료되었습니다.');
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  }

  function clearInput() {
    setFile(null);
    setErrorText('');
    setContext('');
    setResult(null);
    setMessage('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="page">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-icon">&lt;/&gt;</div>
            <div>
              <strong>Error AI</strong>
              <span>Developer Assistant</span>
            </div>
          </div>
          <div className="header-pill">Gemini Analysis</div>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <div className="hero-badge">AI Error Debugger</div>
          <h1>에러 화면을 올리면<br /><span>원인부터 해결까지.</span></h1>
          <p>캡처 이미지 또는 에러 메시지를 입력하면 AI가 오류 종류, 원인, 해결 순서와 수정 코드까지 정리합니다.</p>
        </section>

        <section className="input-card">
          <div className="input-grid">
            <div className="capture-panel">
              <div className="panel-title">에러 캡처</div>
              <label className="upload-zone">
                {previewUrl ? (
                  <img className="preview" src={previewUrl} alt="에러 캡처 미리보기" />
                ) : (
                  <>
                    <div className="upload-icon">⌁</div>
                    <strong>에러 화면을 올려주세요</strong>
                    <span>PNG · JPG · WEBP / 최대 10MB</span>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => selectFile(event.target.files?.[0])}
                />
              </label>
              {file && (
                <div className="selected-file">
                  <span>{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} disabled={busy}>제거</button>
                </div>
              )}
            </div>

            <div className="text-panel">
              <label>
                <span className="panel-title">에러 메시지</span>
                <textarea
                  value={errorText}
                  onChange={(event) => setErrorText(event.target.value)}
                  placeholder={'예: TypeError: Cannot read properties of undefined...\n\n캡처가 있다면 비워둬도 됩니다.'}
                  rows={7}
                />
              </label>
              <label>
                <span className="field-label">상황 설명 · 선택사항</span>
                <textarea
                  className="context-input"
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  placeholder="예: Next.js에서 로그인 버튼을 누른 뒤 발생했습니다."
                  rows={3}
                />
              </label>
            </div>
          </div>

          <div className="action-row">
            <button type="button" className="secondary-button" onClick={clearInput} disabled={busy}>초기화</button>
            <button
              type="button"
              className="primary-button"
              onClick={handleAnalyze}
              disabled={busy || (!file && !errorText.trim())}
            >
              {busy ? '분석 중...' : '에러 분석하기'}
            </button>
          </div>
          {message && <div className="message">{message}</div>}
        </section>

        {result && (
          <section className="result-card">
            <div className="result-head">
              <div>
                <span className={`severity severity-${result.severity || 'medium'}`}>
                  {result.severity_label || '확인 필요'}
                </span>
                <h2>{result.title}</h2>
              </div>
              <span className="error-type">{result.error_type}</span>
            </div>

            <div className="result-meta">
              <div><span>추정 기술</span><strong>{result.language || '확인되지 않음'}</strong></div>
              <div><span>분석 신뢰도</span><strong>{result.confidence || '보통'}</strong></div>
            </div>

            <div className="analysis-section"><h3>무슨 오류인가요?</h3><p>{result.explanation}</p></div>
            <div className="analysis-section"><h3>가능성이 높은 원인</h3><p>{result.cause}</p></div>

            <div className="analysis-section">
              <h3>해결 순서</h3>
              <ol className="solution-list">
                {(result.solution_steps || []).map((step, index) => (
                  <li key={`${step}-${index}`}><span>{index + 1}</span><p>{step}</p></li>
                ))}
              </ol>
            </div>

            {result.code_example && (
              <div className="analysis-section">
                <h3>수정 코드 예시</h3>
                <pre className="code-box"><code>{result.code_example}</code></pre>
              </div>
            )}

            {result.prevention && (
              <div className="analysis-section"><h3>다음에 예방하려면</h3><p>{result.prevention}</p></div>
            )}
          </section>
        )}

        <section className="history-section">
          <div className="section-title"><h2>최근 분석</h2><p>최근 분석한 에러를 다시 확인할 수 있습니다.</p></div>
          {loadingHistory ? (
            <div className="empty-state">기록을 불러오는 중입니다.</div>
          ) : history.length === 0 ? (
            <div className="empty-state">아직 분석한 에러가 없습니다.</div>
          ) : (
            <div className="history-grid">
              {history.map((item) => (
                <article className="history-card" key={item.id}>
                  <div className="history-top">
                    <span className={`severity severity-${item.severity || 'medium'}`}>{item.severity_label || '확인 필요'}</span>
                    <span className="history-date">{new Date(item.created_at).toLocaleString('ko-KR')}</span>
                  </div>
                  <h3>{item.title || '분석 대기 중'}</h3>
                  <p>{item.error_type || item.status}</p>
                  {item.cause && <div className="history-cause">{item.cause}</div>}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">Error AI · Capture. Understand. Fix.</footer>
    </div>
  );
}
