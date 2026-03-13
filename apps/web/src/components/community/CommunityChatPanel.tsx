import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Form, Button, Spinner, Badge } from 'react-bootstrap';
import { FiSend } from 'react-icons/fi';
import { format } from 'date-fns';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useKumii } from '../../lib/KumiiContext';

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  sender?: {
    full_name: string;
    avatar_url?: string;
  };
}

interface Props {
  categoryId: string;
  categoryName: string;
}

export default function CommunityChatPanel({ categoryId, categoryName }: Props) {
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { profile } = useKumii();

  // Find or create the community conversation
  const { data: communityChat, isLoading: loadingChat, error: chatError } = useQuery(
    ['community-chat', categoryId],
    async () => {
      const response = await api.get(`/chat/conversations/community/${categoryId}`);
      return response.data.data as { conversationId: string };
    },
    { staleTime: Infinity, retry: 2 }
  );

  const conversationId = communityChat?.conversationId ?? null;

  // Fetch messages
  const { data: messagesData, isLoading: loadingMessages } = useQuery(
    ['community-messages', conversationId],
    async () => {
      if (!conversationId) return [];
      const response = await api.get(`/chat/conversations/${conversationId}/messages`, {
        params: { limit: 100 },
      });
      // API returns { data: { messages: [...] } }
      const raw = response.data.data;
      return (Array.isArray(raw) ? raw : raw?.messages ?? []) as Message[];
    },
    {
      enabled: !!conversationId,
      refetchInterval: 8000,
      retry: 1,
    }
  );

  const messages = messagesData ?? [];

  // Send message
  const sendMutation = useMutation(
    async (content: string) => {
      if (!conversationId) throw new Error('No conversation');
      await api.post(`/chat/conversations/${conversationId}/messages`, { content });
    },
    {
      onSuccess: () => {
        setMessageText('');
        queryClient.invalidateQueries(['community-messages', conversationId]);
        scrollToBottom();
      },
    }
  );

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`community-chat:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => {
          queryClient.invalidateQueries(['community-messages', conversationId]);
          scrollToBottom();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  // Get current user id from supabase session
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loadingChat) {
    return (
      <div className="d-flex align-items-center justify-content-center py-5">
        <Spinner animation="border" size="sm" style={{ color: '#7a8567' }} />
        <span className="ms-2 text-muted">Joining community chat…</span>
      </div>
    );
  }

  if (chatError) {
    return (
      <div className="text-center py-5 text-muted">
        <p className="mb-1">Could not load community chat.</p>
        <small>Please try refreshing the page.</small>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '520px',
        border: '1px solid #E5E5E3',
        borderRadius: '12px',
        overflow: 'hidden',
        background: 'white',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #E5E5E3',
          background: 'linear-gradient(135deg, #7a8567 0%, #c5df96 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ fontSize: '18px' }}>💬</span>
        <div>
          <div style={{ fontWeight: '600', fontSize: '14px' }}>{categoryName} Chat</div>
          <div style={{ fontSize: '11px', opacity: 0.85 }}>Community group chat · open to all members</div>
        </div>
        {profile?.persona_type && (
          <Badge
            style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.25)', color: 'white', fontSize: '11px' }}
          >
            {profile.persona_type}
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          background: '#F5F5F3',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {loadingMessages && (
          <div className="text-center py-4">
            <Spinner animation="border" size="sm" style={{ color: '#7a8567' }} />
          </div>
        )}

        {!loadingMessages && messages.length === 0 && (
          <div className="text-center text-muted py-5">
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>💬</div>
            <p className="mb-1" style={{ fontWeight: '500' }}>No messages yet</p>
            <small>Be the first to say something in {categoryName}!</small>
          </div>
        )}

        {messages.map((message) => {
          const isOwn = message.sender_id === currentUserId;
          const name = message.sender?.full_name || (isOwn && profile
            ? [profile.first_name, profile.last_name].filter(Boolean).join(' ')
            : 'Member');
          const initial = (name || '?').charAt(0).toUpperCase();

          return (
            <div
              key={message.id}
              style={{
                display: 'flex',
                flexDirection: isOwn ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: '8px',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: isOwn ? '#7a8567' : '#c5df96',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: '600',
                  flexShrink: 0,
                }}
              >
                {initial}
              </div>

              {/* Bubble */}
              <div style={{ maxWidth: '68%' }}>
                {!isOwn && (
                  <div style={{ fontSize: '11px', color: '#888', marginBottom: '3px', paddingLeft: '4px' }}>
                    {name}
                  </div>
                )}
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: isOwn ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    background: isOwn ? '#7a8567' : 'white',
                    color: isOwn ? 'white' : '#2D2D2D',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    fontSize: '14px',
                    lineHeight: '1.45',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {message.content}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: '#aaa',
                    marginTop: '3px',
                    textAlign: isOwn ? 'right' : 'left',
                    paddingLeft: isOwn ? 0 : '4px',
                    paddingRight: isOwn ? '4px' : 0,
                  }}
                >
                  {format(new Date(message.created_at), 'HH:mm')}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid #E5E5E3', background: 'white' }}>
        <Form onSubmit={handleSend}>
          <div className="d-flex align-items-center gap-2">
            <Form.Control
              type="text"
              placeholder={`Message ${categoryName}…`}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              style={{ borderRadius: '20px', fontSize: '14px', border: '1px solid #E5E5E3' }}
              disabled={sendMutation.isLoading}
            />
            <Button
              type="submit"
              style={{
                background: 'linear-gradient(135deg, #7a8567 0%, #c5df96 100%)',
                border: 'none',
                borderRadius: '50%',
                width: '38px',
                height: '38px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              disabled={!messageText.trim() || sendMutation.isLoading}
            >
              {sendMutation.isLoading ? (
                <Spinner animation="border" size="sm" style={{ color: 'white' }} />
              ) : (
                <FiSend size={15} color="white" />
              )}
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
