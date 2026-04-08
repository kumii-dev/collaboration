import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Card, Button, Form, InputGroup, Spinner, Badge, Alert } from 'react-bootstrap';
import { FiSend, FiRefreshCw, FiTrendingUp, FiTrash2 } from 'react-icons/fi';
import AnimatedWordCloud from './AnimatedWordCloud';
import { wordCloudApi, WordEntry } from '../../lib/wordCloudApi';
import { useWordCloudRealtime } from '../../hooks/useWordCloudRealtime';

interface Props {
  /** Category slug or event UUID — used as the Supabase channel / DB context key */
  contextId: string;
  /** Display title shown in the header */
  title?: string;
  /** Whether the current user is admin/moderator (shows clear button) */
  isAdmin?: boolean;
}

/** Client-side debounce guard: at least 2 s between submissions */
const MIN_SUBMIT_INTERVAL_MS = 2_000;

export default function TrendsTab({ contextId, title, isAdmin }: Props) {
  const [inputValue,  setInputValue]  = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null);
  const [successMsg,  setSuccessMsg]  = useState<string | null>(null);
  const [clearing,    setClearing]    = useState(false);
  const lastSubmitTs = useRef(0);
  const queryClient  = useQueryClient();

  const qKey = ['wordcloud', contextId] as const;

  // ── Initial fetch ─────────────────────────────────────────────────────────
  const { data: words = [], isLoading } = useQuery<WordEntry[]>(
    qKey,
    () => wordCloudApi.getCloud(contextId),
    { staleTime: 30_000, retry: 2 }
  );

  // ── Real-time delta merge via Supabase Broadcast ──────────────────────────
  const handleUpdate = useCallback(
    ({ word, count }: WordEntry) => {
      queryClient.setQueryData<WordEntry[]>(qKey, (prev = []) => {
        const idx = prev.findIndex((w) => w.word === word);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { word, count };
          return next;
        }
        return [...prev, { word, count }];
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contextId, queryClient]
  );

  const handleReset = useCallback(() => {
    queryClient.setQueryData<WordEntry[]>(qKey, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextId, queryClient]);

  useWordCloudRealtime(contextId, handleUpdate, handleReset);

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // Client-side debounce guard
    const now = Date.now();
    if (now - lastSubmitTs.current < MIN_SUBMIT_INTERVAL_MS) {
      setErrorMsg('Please wait a moment before submitting again.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await wordCloudApi.submitWord(contextId, trimmed);
      lastSubmitTs.current = now;
      setInputValue('');
      setSuccessMsg(`"${trimmed}" added to the cloud!`);
      setTimeout(() => setSuccessMsg(null), 3_000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })
          ?.response?.data?.error ?? 'Submission failed. Please try again.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Clear handler (admin only) ────────────────────────────────────────────
  const handleClear = async () => {
    if (!window.confirm('Clear the entire word cloud for this community? This cannot be undone.')) return;
    setClearing(true);
    try {
      await wordCloudApi.clearCloud(contextId);
      queryClient.setQueryData<WordEntry[]>(qKey, []);
    } catch {
      setErrorMsg('Failed to clear word cloud.');
    } finally {
      setClearing(false);
    }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const sortedWords = [...words].sort((a, b) => b.count - a.count);
  const topWords    = sortedWords.slice(0, 10);
  const totalVotes  = words.reduce((s, w) => s + w.count, 0);

  return (
    <div>
      {/* ── Section header ── */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <FiTrendingUp size={20} color="#7a8567" />
          <h5 className="mb-0" style={{ fontWeight: 600 }}>
            {title ?? 'Community Trends'}
          </h5>
          <Badge
            bg="light"
            text="dark"
            style={{ border: '1px solid #dee2e6', fontWeight: 500, fontSize: 12 }}
          >
            {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
            {words.length > 0 && ` · ${words.length} unique ${words.length === 1 ? 'word' : 'words'}`}
          </Badge>
        </div>

        <div className="d-flex gap-2">
          {isAdmin && (
            <Button
              variant="outline-danger"
              size="sm"
              style={{ borderRadius: 20 }}
              onClick={handleClear}
              disabled={clearing || words.length === 0}
            >
              {clearing
                ? <Spinner animation="border" size="sm" />
                : <><FiTrash2 size={13} className="me-1" />Clear</>}
            </Button>
          )}
          <Button
            variant="outline-secondary"
            size="sm"
            style={{ borderRadius: 20 }}
            onClick={() => queryClient.invalidateQueries(qKey)}
          >
            <FiRefreshCw size={13} className="me-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Submission form ── */}
      <Card className="mb-4" style={{ border: '1px solid #E5E5E3', borderRadius: 12 }}>
        <Card.Body>
          <p className="text-muted mb-3" style={{ fontSize: 14 }}>
            What word or short phrase best describes this community right now?{' '}
            <span style={{ color: '#7a8567', fontWeight: 500 }}>
              Submit and watch the cloud grow in real time.
            </span>
          </p>

          <Form onSubmit={handleSubmit}>
            <InputGroup>
              <Form.Control
                type="text"
                placeholder="Enter a word or short phrase…"
                value={inputValue}
                onChange={(e) => {
                  setErrorMsg(null);
                  setInputValue(e.target.value.slice(0, 100));
                }}
                maxLength={100}
                disabled={submitting}
                style={{ borderRadius: '8px 0 0 8px', border: '1px solid #dee2e6' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
              />
              <Button
                type="submit"
                disabled={submitting || !inputValue.trim()}
                style={{
                  background: '#7a8567',
                  borderColor: '#7a8567',
                  borderRadius: '0 8px 8px 0',
                  padding: '0 20px',
                }}
              >
                {submitting
                  ? <Spinner animation="border" size="sm" />
                  : <><FiSend size={13} className="me-1" />Submit</>}
              </Button>
            </InputGroup>
          </Form>

          {errorMsg && (
            <Alert variant="warning" className="mt-2 mb-0 py-2 px-3" style={{ fontSize: 13 }}>
              {errorMsg}
            </Alert>
          )}
          {successMsg && (
            <Alert variant="success" className="mt-2 mb-0 py-2 px-3" style={{ fontSize: 13 }}>
              ✓ {successMsg}
            </Alert>
          )}
        </Card.Body>
      </Card>

      {/* ── Word cloud canvas ── */}
      {isLoading ? (
        <div className="text-center py-5">
          <Spinner animation="border" style={{ color: '#7a8567' }} />
        </div>
      ) : (
        <AnimatedWordCloud words={words} height={380} />
      )}

      {/* ── Top-10 leaderboard ── */}
      {topWords.length > 0 && (
        <Card className="mt-4" style={{ border: '1px solid #E5E5E3', borderRadius: 12 }}>
          <Card.Body>
            <h6 className="mb-3" style={{ fontWeight: 600, color: '#7a8567', fontSize: 14 }}>
              🏆 Top Trending Words
            </h6>
            <div className="d-flex flex-wrap gap-2">
              {topWords.map((w, i) => (
                <div
                  key={w.word}
                  className="d-flex align-items-center gap-1 px-3 py-1"
                  style={{
                    borderRadius: 20,
                    background: i < 3 ? '#7a8567' : '#f0f4ea',
                    color: i < 3 ? 'white' : '#444',
                    fontSize: 13,
                    fontWeight: 500,
                    border: '1px solid #E5E5E3',
                  }}
                >
                  <span style={{ opacity: 0.7, fontSize: 11 }}>#{i + 1}</span>
                  <span>{w.word}</span>
                  <Badge
                    bg={i < 3 ? 'light' : 'secondary'}
                    text={i < 3 ? 'dark' : 'light'}
                    style={{ fontSize: 11 }}
                  >
                    {w.count}
                  </Badge>
                </div>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  );
}
