import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Form, Button, ListGroup, Badge, Spinner, Modal } from 'react-bootstrap';
import { FiSend, FiPaperclip, FiSmile, FiMoreVertical, FiSearch } from 'react-icons/fi';
import { format } from 'date-fns';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  sender?: {
    full_name: string;
    avatar_url?: string;
  };
  reactions?: Array<{
    emoji: string;
    count: number;
  }>;
}

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  last_message_at: string;
  unread_count?: number;
  participants: Array<{
    user_id: string;
    full_name: string;
    avatar_url?: string;
  }>;
  last_message?: {
    content: string;
    sender_name: string;
  };
}

export default function ChatPage() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch conversations
  const { data: conversations, isLoading: loadingConversations, error: conversationsError } = useQuery(
    'conversations',
    async () => {
      const response = await api.get('/chat/conversations');
      // API returns { data: { conversations: [...], total, limit, offset } }
      return response.data.data.conversations as Conversation[];
    },
    { 
      refetchInterval: 30000, // Refetch every 30 seconds
      retry: 1,
      onError: (error: any) => {
        console.error('❌ Failed to load conversations:', error);
      }
    }
  );

  // Fetch messages for selected conversation
  const { data: messages, isLoading: loadingMessages, error: messagesError } = useQuery(
    ['messages', selectedConversation],
    async () => {
      if (!selectedConversation) return [];
      const response = await api.get(`/chat/conversations/${selectedConversation}/messages`, {
        params: { limit: 50 }
      });
      return response.data.data as Message[];
    },
    {
      enabled: !!selectedConversation,
      refetchInterval: 5000, // Refetch every 5 seconds
      retry: 1,
      onError: (error: any) => {
        console.error('❌ Failed to load messages:', error);
      }
    }
  );

  // Send message mutation
  const sendMessageMutation = useMutation(
    async (content: string) => {
      if (!selectedConversation) throw new Error('No conversation selected');
      const response = await api.post(`/chat/conversations/${selectedConversation}/messages`, {
        content
      });
      return response.data;
    },
    {
      onSuccess: () => {
        setMessageText('');
        queryClient.invalidateQueries(['messages', selectedConversation]);
        queryClient.invalidateQueries('conversations');
        scrollToBottom();
      }
    }
  );

  // Search users query
  const { data: users, isLoading: searchingUsers } = useQuery(
    ['users', userSearch],
    async () => {
      if (!userSearch || userSearch.length < 2) return [];
      const response = await api.get('/users/search', {
        params: { q: userSearch }
      });
      return response.data.data;
    },
    { enabled: userSearch.length >= 2 }
  );

  // Create conversation mutation
  const createConversationMutation = useMutation(
    async (participantId: string) => {
      const response = await api.post('/chat/conversations', {
        participantIds: [participantId],
        type: 'direct'
      });
      return response.data.data.conversation;
    },
    {
      onSuccess: (conversation) => {
        queryClient.invalidateQueries('conversations');
        setShowNewChatModal(false);
        setUserSearch('');
        setSelectedUser(null);
        setSelectedConversation(conversation.id);
      }
    }
  );

  const handleCreateConversation = () => {
    if (selectedUser) {
      createConversationMutation.mutate(selectedUser);
    }
  };

  // Subscribe to realtime updates
  useEffect(() => {
    if (!selectedConversation) return;

    const channel = supabase
      .channel(`conversation:${selectedConversation}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversation}`
        },
        () => {
          queryClient.invalidateQueries(['messages', selectedConversation]);
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversation, queryClient]);

  // Handle typing indicator
  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 3000);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedConversation) return;

    sendMessageMutation.mutate(messageText.trim());
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const selectedConvData = conversations?.find(c => c.id === selectedConversation);

  // Show error if conversations failed to load
  if (conversationsError) {
    return (
      <div className="chat-container">
        <div className="alert alert-danger m-4" role="alert">
          <h5>Failed to load conversations</h5>
          <p className="mb-0">
            {(conversationsError as any)?.response?.status === 403 
              ? 'You do not have permission to access chat. Please make sure your user profile is set up correctly.'
              : 'An error occurred while loading your conversations. Please try refreshing the page.'}
          </p>
          <button className="btn btn-danger mt-3" onClick={() => window.location.reload()}>
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="row g-0" style={{ height: 'calc(100vh - 100px)' }}>
        {/* Conversations List */}
        <div className="col-md-4 border-end">
          <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
            <h5 className="mb-0">Messages</h5>
            <Button variant="primary" size="sm" onClick={() => setShowNewChatModal(true)}>
              New Chat
            </Button>
          </div>

          <div className="conversation-list" style={{ overflowY: 'auto', height: 'calc(100% - 60px)' }}>
            {loadingConversations && (
              <div className="text-center p-4">
                <Spinner animation="border" size="sm" />
              </div>
            )}

            {conversations && conversations.length === 0 && (
              <div className="text-center p-4 text-muted">
                <p>No conversations yet</p>
                <small>Start a new chat to get started</small>
              </div>
            )}

            <ListGroup variant="flush">
              {conversations?.map((conversation) => (
                <ListGroup.Item
                  key={conversation.id}
                  action
                  active={selectedConversation === conversation.id}
                  onClick={() => setSelectedConversation(conversation.id)}
                  className="conversation-item"
                >
                  <div className="d-flex align-items-start">
                    <div className="avatar-placeholder me-3">
                      {conversation.participants[0]?.full_name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <h6 className="mb-0">
                          {conversation.name || conversation.participants[0]?.full_name || 'Unknown'}
                        </h6>
                        <small className="text-muted">
                          {conversation.last_message_at
                            ? format(new Date(conversation.last_message_at), 'MMM d')
                            : ''}
                        </small>
                      </div>
                      <div className="d-flex justify-content-between align-items-center">
                        <small className="text-muted text-truncate" style={{ maxWidth: '200px' }}>
                          {conversation.last_message?.content || 'No messages yet'}
                        </small>
                        {conversation.unread_count && conversation.unread_count > 0 && (
                          <Badge bg="primary" pill>
                            {conversation.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </div>
        </div>

        {/* Message Thread */}
        <div className="col-md-8">
          {!selectedConversation ? (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted">
              <div className="text-center">
                <h4>Select a conversation</h4>
                <p>Choose a conversation from the list to start messaging</p>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation Header */}
              <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
                <div className="d-flex align-items-center">
                  <div className="avatar-placeholder me-3">
                    {selectedConvData?.participants[0]?.full_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <h6 className="mb-0">
                      {selectedConvData?.name || selectedConvData?.participants[0]?.full_name || 'Unknown'}
                    </h6>
                    <small className="text-muted">
                      {selectedConvData?.participants.length || 0} participants
                    </small>
                  </div>
                </div>
                <Button variant="link" className="text-muted">
                  <FiMoreVertical />
                </Button>
              </div>

              {/* Messages */}
              <div
                className="messages-container p-3"
                style={{
                  overflowY: 'auto',
                  height: 'calc(100% - 140px)',
                  backgroundColor: '#f8f9fa'
                }}
              >
                {loadingMessages && (
                  <div className="text-center p-4">
                    <Spinner animation="border" size="sm" />
                  </div>
                )}

                {messages?.map((message) => {
                  const isOwnMessage = message.sender_id === localStorage.getItem('user_id');
                  
                  return (
                    <div
                      key={message.id}
                      className={`message-bubble mb-3 ${isOwnMessage ? 'own-message' : 'other-message'}`}
                    >
                      <div className={`d-flex ${isOwnMessage ? 'justify-content-end' : 'justify-content-start'}`}>
                        {!isOwnMessage && (
                          <div className="avatar-placeholder avatar-sm me-2">
                            {message.sender?.full_name?.charAt(0) || '?'}
                          </div>
                        )}
                        <div style={{ maxWidth: '70%' }}>
                          {!isOwnMessage && (
                            <small className="text-muted d-block mb-1">
                              {message.sender?.full_name || 'Unknown'}
                            </small>
                          )}
                          <div
                            className={`p-3 rounded ${
                              isOwnMessage ? 'bg-primary text-white' : 'bg-white'
                            }`}
                          >
                            <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                              {message.content}
                            </p>
                          </div>
                          <small className="text-muted d-block mt-1">
                            {format(new Date(message.created_at), 'HH:mm')}
                          </small>
                        </div>
                        {isOwnMessage && (
                          <div className="avatar-placeholder avatar-sm ms-2">
                            {message.sender?.full_name?.charAt(0) || '?'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <div className="message-composer p-3 border-top bg-white">
                <Form onSubmit={handleSendMessage}>
                  <div className="d-flex align-items-center gap-2">
                    <Button variant="link" className="text-muted p-2">
                      <FiPaperclip size={20} />
                    </Button>
                    <Form.Control
                      type="text"
                      placeholder="Type a message..."
                      value={messageText}
                      onChange={(e) => {
                        setMessageText(e.target.value);
                        handleTyping();
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e);
                        }
                      }}
                    />
                    <Button variant="link" className="text-muted p-2">
                      <FiSmile size={20} />
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!messageText.trim() || sendMessageMutation.isLoading}
                    >
                      {sendMessageMutation.isLoading ? (
                        <Spinner animation="border" size="sm" />
                      ) : (
                        <FiSend size={18} />
                      )}
                    </Button>
                  </div>
                </Form>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      <Modal show={showNewChatModal} onHide={() => setShowNewChatModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Start New Conversation</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>Search for a user</Form.Label>
            <div className="position-relative">
              <FiSearch 
                className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" 
                size={18}
              />
              <Form.Control
                type="text"
                placeholder="Type name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
                autoFocus
              />
            </div>
          </Form.Group>

          {userSearch.length < 2 && (
            <div className="text-center text-muted py-3">
              <small>Type at least 2 characters to search</small>
            </div>
          )}

          {searchingUsers && (
            <div className="text-center py-3">
              <Spinner animation="border" size="sm" />
            </div>
          )}

          {userSearch.length >= 2 && !searchingUsers && users && users.length === 0 && (
            <div className="text-center text-muted py-3">
              <small>No users found</small>
            </div>
          )}

          {users && users.length > 0 && (
            <ListGroup>
              {users.map((user: any) => (
                <ListGroup.Item
                  key={user.id}
                  action
                  active={selectedUser === user.id}
                  onClick={() => setSelectedUser(user.id)}
                  className="d-flex align-items-center"
                >
                  <div className="avatar-placeholder me-3">
                    {user.full_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div className="fw-medium">{user.full_name || 'Unknown User'}</div>
                    <small className="text-muted">{user.email}</small>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowNewChatModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreateConversation}
            disabled={!selectedUser || createConversationMutation.isLoading}
          >
            {createConversationMutation.isLoading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Starting...
              </>
            ) : (
              'Start Conversation'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
