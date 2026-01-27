import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Badge, Button, Form, Spinner, Alert } from 'react-bootstrap';
import { FiArrowLeft, FiThumbsUp, FiThumbsDown, FiMessageSquare, FiStar, FiFlag } from 'react-icons/fi';
import { format } from 'date-fns';
import api from '../../lib/api';

interface Thread {
  id: string;
  title: string;
  content: string;
  author_id: string;
  author_name: string;
  board_id: string;
  board_name: string;
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  reply_count: number;
  vote_score: number;
  tags?: string[];
  user_vote?: 'up' | 'down' | null;
}

interface Post {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_role: string;
  created_at: string;
  updated_at: string;
  vote_score: number;
  user_vote?: 'up' | 'down' | null;
  is_solution: boolean;
  parent_post_id?: string;
  replies?: Post[];
}

export default function ThreadDetailPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const [replyContent, setReplyContent] = useState('');
  const [replyToPostId, setReplyToPostId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch thread details
  const { data: thread, isLoading: loadingThread, error: threadError } = useQuery(
    ['thread', threadId],
    async () => {
      const response = await api.get(`/forum/threads/${threadId}`);
      return response.data.data as Thread;
    },
    { enabled: !!threadId }
  );

  // Fetch thread posts
  const { data: posts, isLoading: loadingPosts } = useQuery(
    ['thread-posts', threadId],
    async () => {
      const response = await api.get(`/forum/threads/${threadId}/posts`);
      return response.data.data as Post[];
    },
    { enabled: !!threadId }
  );

  // Vote on thread mutation
  const voteThreadMutation = useMutation(
    async ({ voteType }: { voteType: 'up' | 'down' }) => {
      const response = await api.post(`/forum/threads/${threadId}/vote`, {
        vote_type: voteType
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['thread', threadId]);
      }
    }
  );

  // Vote on post mutation
  const votePostMutation = useMutation(
    async ({ postId, voteType }: { postId: string; voteType: 'up' | 'down' }) => {
      const response = await api.post(`/forum/posts/${postId}/vote`, {
        vote_type: voteType
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['thread-posts', threadId]);
      }
    }
  );

  // Reply to thread mutation
  const replyMutation = useMutation(
    async ({ content, parentPostId }: { content: string; parentPostId?: string }) => {
      const response = await api.post(`/forum/threads/${threadId}/posts`, {
        content,
        parent_post_id: parentPostId || null
      });
      return response.data;
    },
    {
      onSuccess: () => {
        setReplyContent('');
        setReplyToPostId(null);
        queryClient.invalidateQueries(['thread-posts', threadId]);
        queryClient.invalidateQueries(['thread', threadId]);
      }
    }
  );

  const handleVoteThread = (voteType: 'up' | 'down') => {
    voteThreadMutation.mutate({ voteType });
  };

  const handleVotePost = (postId: string, voteType: 'up' | 'down') => {
    votePostMutation.mutate({ postId, voteType });
  };

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;

    replyMutation.mutate({
      content: replyContent.trim(),
      parentPostId: replyToPostId || undefined
    });
  };

  const getRoleBadge = (role: string) => {
    const badges: Record<string, string> = {
      admin: 'danger',
      moderator: 'warning',
      entrepreneur: 'primary',
      funder: 'success',
      advisor: 'info'
    };
    return badges[role] || 'secondary';
  };

  const renderPost = (post: Post, isNested = false) => (
    <Card
      key={post.id}
      className={`mb-3 ${isNested ? 'ms-5' : ''} ${post.is_solution ? 'border-success' : ''}`}
    >
      <Card.Body>
        <div className="d-flex gap-3">
          {/* Vote controls */}
          <div className="d-flex flex-column align-items-center">
            <Button
              variant="link"
              size="sm"
              className={`p-0 ${post.user_vote === 'up' ? 'text-success' : 'text-muted'}`}
              onClick={() => handleVotePost(post.id, 'up')}
            >
              <FiThumbsUp size={20} />
            </Button>
            <strong className={post.vote_score > 0 ? 'text-success' : post.vote_score < 0 ? 'text-danger' : ''}>
              {post.vote_score}
            </strong>
            <Button
              variant="link"
              size="sm"
              className={`p-0 ${post.user_vote === 'down' ? 'text-danger' : 'text-muted'}`}
              onClick={() => handleVotePost(post.id, 'down')}
            >
              <FiThumbsDown size={20} />
            </Button>
          </div>

          {/* Post content */}
          <div className="flex-grow-1">
            <div className="d-flex justify-content-between align-items-start mb-2">
              <div className="d-flex align-items-center gap-2">
                <div className="avatar-placeholder avatar-sm">
                  {post.author_name.charAt(0)}
                </div>
                <div>
                  <strong>{post.author_name}</strong>
                  {post.author_role !== 'user' && (
                    <Badge bg={getRoleBadge(post.author_role)} className="ms-2">
                      {post.author_role}
                    </Badge>
                  )}
                  {post.is_solution && (
                    <Badge bg="success" className="ms-2">
                      <FiStar className="me-1" /> Solution
                    </Badge>
                  )}
                </div>
              </div>
              <small className="text-muted">
                {format(new Date(post.created_at), 'MMM d, yyyy HH:mm')}
              </small>
            </div>

            <div className="post-content mb-3" style={{ whiteSpace: 'pre-wrap' }}>
              {post.content}
            </div>

            <div className="d-flex gap-2">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setReplyToPostId(post.id)}
              >
                <FiMessageSquare className="me-1" /> Reply
              </Button>
              <Button variant="outline-secondary" size="sm">
                <FiFlag className="me-1" /> Report
              </Button>
            </div>

            {/* Nested replies */}
            {post.replies && post.replies.length > 0 && (
              <div className="mt-3">
                {post.replies.map((reply) => renderPost(reply, true))}
              </div>
            )}
          </div>
        </div>
      </Card.Body>
    </Card>
  );

  if (loadingThread) {
    return (
      <div className="text-center p-5">
        <Spinner animation="border" />
        <p className="mt-3">Loading thread...</p>
      </div>
    );
  }

  if (threadError || !thread) {
    return (
      <Alert variant="danger">
        <h5>Thread not found</h5>
        <p>The thread you're looking for doesn't exist or has been removed.</p>
        <Button variant="primary" onClick={() => navigate('/forum')}>
          <FiArrowLeft className="me-1" /> Back to Forum
        </Button>
      </Alert>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-3">
        <Button variant="link" className="p-0 text-decoration-none" onClick={() => navigate('/forum')}>
          <FiArrowLeft className="me-1" /> Back to Forum
        </Button>
        <span className="text-muted mx-2">/</span>
        <span className="text-muted">{thread.board_name}</span>
      </div>

      {/* Thread Header */}
      <Card className="mb-4">
        <Card.Body>
          <div className="d-flex gap-3">
            {/* Vote controls */}
            <div className="d-flex flex-column align-items-center">
              <Button
                variant="link"
                size="lg"
                className={`p-0 ${thread.user_vote === 'up' ? 'text-success' : 'text-muted'}`}
                onClick={() => handleVoteThread('up')}
                disabled={thread.is_locked}
              >
                <FiThumbsUp size={24} />
              </Button>
              <strong className={`fs-4 ${thread.vote_score > 0 ? 'text-success' : thread.vote_score < 0 ? 'text-danger' : ''}`}>
                {thread.vote_score}
              </strong>
              <Button
                variant="link"
                size="lg"
                className={`p-0 ${thread.user_vote === 'down' ? 'text-danger' : 'text-muted'}`}
                onClick={() => handleVoteThread('down')}
                disabled={thread.is_locked}
              >
                <FiThumbsDown size={24} />
              </Button>
            </div>

            {/* Thread info */}
            <div className="flex-grow-1">
              <div className="d-flex align-items-center gap-2 mb-2">
                {thread.is_pinned && (
                  <Badge bg="warning">
                    <FiStar className="me-1" /> Pinned
                  </Badge>
                )}
                {thread.is_locked && (
                  <Badge bg="secondary">🔒 Locked</Badge>
                )}
                {thread.tags?.map((tag) => (
                  <Badge key={tag} bg="light" text="dark">
                    {tag}
                  </Badge>
                ))}
              </div>

              <h2 className="mb-3">{thread.title}</h2>

              <div className="post-content mb-3" style={{ whiteSpace: 'pre-wrap' }}>
                {thread.content}
              </div>

              <div className="d-flex align-items-center gap-4 text-muted" style={{ fontSize: '14px' }}>
                <div className="d-flex align-items-center gap-2">
                  <div className="avatar-placeholder avatar-sm">
                    {thread.author_name.charAt(0)}
                  </div>
                  <span>by <strong>{thread.author_name}</strong></span>
                </div>
                <span>•</span>
                <span>{format(new Date(thread.created_at), 'MMMM d, yyyy')}</span>
                <span>•</span>
                <span>{thread.view_count} views</span>
                <span>•</span>
                <span>{thread.reply_count} replies</span>
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Posts/Replies */}
      <h5 className="mb-3">{thread.reply_count} Replies</h5>

      {loadingPosts && (
        <div className="text-center p-4">
          <Spinner animation="border" size="sm" />
        </div>
      )}

      {posts && posts.length === 0 && (
        <Alert variant="info">
          No replies yet. Be the first to respond!
        </Alert>
      )}

      {posts?.map((post) => renderPost(post))}

      {/* Reply Form */}
      {!thread.is_locked ? (
        <Card className="mt-4">
          <Card.Header>
            <h6 className="mb-0">
              {replyToPostId ? 'Reply to Post' : 'Add Your Reply'}
            </h6>
          </Card.Header>
          <Card.Body>
            {replyToPostId && (
              <Alert variant="info" className="d-flex justify-content-between align-items-center">
                <span>Replying to a specific post</span>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setReplyToPostId(null)}
                >
                  Cancel
                </Button>
              </Alert>
            )}

            <Form onSubmit={handleSubmitReply}>
              <Form.Group className="mb-3">
                <Form.Control
                  as="textarea"
                  rows={5}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Write your reply..."
                />
              </Form.Group>

              <div className="d-flex justify-content-between align-items-center">
                <small className="text-muted">
                  {replyContent.length} characters
                </small>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!replyContent.trim() || replyMutation.isLoading}
                >
                  {replyMutation.isLoading ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <FiMessageSquare className="me-1" /> Post Reply
                    </>
                  )}
                </Button>
              </div>
            </Form>
          </Card.Body>
        </Card>
      ) : (
        <Alert variant="warning">
          🔒 This thread is locked. No new replies can be added.
        </Alert>
      )}
    </div>
  );
}
