import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Badge, Button, Form, Spinner, Alert, Dropdown, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { 
  FiArrowLeft, 
  FiThumbsUp, 
  FiThumbsDown, 
  FiMessageSquare, 
  FiStar, 
  FiFlag, 
  FiShare2, 
  FiBookmark,
  FiMoreVertical,
  FiEdit,
  FiTrash2,
  FiEye,
  FiClock,
  FiAward,
  FiCheckCircle,
  FiLock
} from 'react-icons/fi';
import { format, formatDistanceToNow } from 'date-fns';
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
        voteValue: voteType === 'up' ? '1' : '-1'
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['thread', threadId]);
      },
      onError: (error: any) => {
        console.error('Failed to vote on thread:', error);
        alert('Failed to vote. Please try again.');
      }
    }
  );

  // Vote on post mutation
  const votePostMutation = useMutation(
    async ({ postId, voteType }: { postId: string; voteType: 'up' | 'down' }) => {
      const response = await api.post(`/forum/posts/${postId}/vote`, {
        voteValue: voteType === 'up' ? '1' : '-1'
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['thread-posts', threadId]);
      },
      onError: (error: any) => {
        console.error('Failed to vote on post:', error);
        alert('Failed to vote. Please try again.');
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
        // Scroll to replies section to see the new reply
        const repliesSection = document.getElementById('replies-section');
        if (repliesSection) {
          repliesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
      onError: (error: any) => {
        console.error('Failed to post reply:', error);
        alert('Failed to post reply. Please try again.');
      }
    }
  );

  // Mark solution mutation
  const markSolutionMutation = useMutation(
    async (postId: string) => {
      const response = await api.post(`/forum/posts/${postId}/mark-solution`);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['thread-posts', threadId]);
      },
      onError: (error: any) => {
        console.error('Failed to mark solution:', error);
        alert(error.response?.data?.error || 'Failed to mark solution');
      }
    }
  );

  // Edit post mutation
  const editPostMutation = useMutation(
    async ({ postId, content }: { postId: string; content: string }) => {
      const response = await api.put(`/forum/posts/${postId}`, { content });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['thread-posts', threadId]);
      },
      onError: (error: any) => {
        console.error('Failed to edit post:', error);
        alert('Failed to edit post. Please try again.');
      }
    }
  );

  // Delete post mutation
  const deletePostMutation = useMutation(
    async (postId: string) => {
      const response = await api.delete(`/forum/posts/${postId}`);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['thread-posts', threadId]);
        queryClient.invalidateQueries(['thread', threadId]);
      },
      onError: (error: any) => {
        console.error('Failed to delete post:', error);
        alert('Failed to delete post. Please try again.');
      }
    }
  );

  // Bookmark thread mutation
  const bookmarkMutation = useMutation(
    async () => {
      const response = await api.post(`/forum/threads/${threadId}/bookmark`);
      return response.data;
    },
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries(['thread', threadId]);
        alert(data.data.message);
      },
      onError: (error: any) => {
        console.error('Failed to bookmark:', error);
        alert('Failed to bookmark thread.');
      }
    }
  );

  const handleVoteThread = (voteType: 'up' | 'down') => {
    voteThreadMutation.mutate({ voteType });
  };

  const handleVotePost = (postId: string, voteType: 'up' | 'down') => {
    votePostMutation.mutate({ postId, voteType });
  };

  const handleMarkSolution = (postId: string) => {
    if (confirm('Mark this reply as the solution?')) {
      markSolutionMutation.mutate(postId);
    }
  };

  const handleEditPost = (postId: string, currentContent: string) => {
    const newContent = prompt('Edit your post:', currentContent);
    if (newContent && newContent.trim() && newContent !== currentContent) {
      editPostMutation.mutate({ postId, content: newContent.trim() });
    }
  };

  const handleDeletePost = (postId: string) => {
    if (confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
      deletePostMutation.mutate(postId);
    }
  };

  const handleBookmark = () => {
    bookmarkMutation.mutate();
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
      className={`mb-3 shadow-sm border-0 ${isNested ? 'ms-4 ms-md-5' : ''}`}
      style={{ 
        borderLeft: post.is_solution ? '4px solid #28a745' : isNested ? '3px solid #e9ecef' : 'none',
        backgroundColor: post.is_solution ? '#f8fff8' : 'white'
      }}
    >
      <Card.Body className="p-4">
        <div className="d-flex gap-3">
          {/* Enhanced Vote Controls */}
          <div className="d-flex flex-column align-items-center" style={{ minWidth: '48px' }}>
            <Button
              variant="link"
              size="sm"
              className="p-1 text-muted"
              onClick={() => handleVotePost(post.id, 'up')}
              disabled={votePostMutation.isLoading}
              style={{ transition: 'all 0.2s' }}
            >
              <FiThumbsUp size={20} />
            </Button>
            <strong 
              className={`my-1 ${post.vote_score > 0 ? 'text-success' : post.vote_score < 0 ? 'text-danger' : 'text-muted'}`}
              style={{ fontSize: '1.1rem' }}
            >
              {post.vote_score}
            </strong>
            <Button
              variant="link"
              size="sm"
              className="p-1 text-muted"
              onClick={() => handleVotePost(post.id, 'down')}
              disabled={votePostMutation.isLoading}
              style={{ transition: 'all 0.2s' }}
            >
              <FiThumbsDown size={20} />
            </Button>
          </div>

          {/* Post Content */}
          <div className="flex-grow-1">
            {/* Author Header */}
            <div className="d-flex justify-content-between align-items-start mb-3">
              <div className="d-flex align-items-center gap-3">
                <div 
                  className="avatar-placeholder" 
                  style={{ 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '50%', 
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    flexShrink: 0
                  }}
                >
                  {post.author_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <strong style={{ fontSize: '1rem' }}>{post.author_name}</strong>
                    {post.author_role !== 'user' && (
                      <Badge bg={getRoleBadge(post.author_role)} className="text-capitalize">
                        {post.author_role}
                      </Badge>
                    )}
                    {post.is_solution && (
                      <Badge bg="success" className="d-flex align-items-center gap-1">
                        <FiCheckCircle size={14} /> Solution
                      </Badge>
                    )}
                  </div>
                  <small className="text-muted">
                    {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                    {post.created_at !== post.updated_at && ' (edited)'}
                  </small>
                </div>
              </div>
              
              {/* Post Actions Dropdown */}
              <Dropdown align="end">
                <Dropdown.Toggle 
                  variant="link" 
                  size="sm" 
                  className="text-muted p-0"
                  style={{ boxShadow: 'none' }}
                >
                  <FiMoreVertical size={18} />
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item onClick={() => handleEditPost(post.id, post.content)}>
                    <FiEdit className="me-2" /> Edit
                  </Dropdown.Item>
                  <Dropdown.Item><FiFlag className="me-2" /> Report</Dropdown.Item>
                  <Dropdown.Item onClick={() => handleMarkSolution(post.id)}>
                    <FiCheckCircle className="me-2" /> {post.is_solution ? 'Unmark Solution' : 'Mark as Solution'}
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item 
                    className="text-danger"
                    onClick={() => handleDeletePost(post.id)}
                  >
                    <FiTrash2 className="me-2" /> Delete
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </div>

            {/* Post Content Text */}
            <div 
              className="post-content mb-3" 
              style={{ 
                whiteSpace: 'pre-wrap',
                fontSize: '0.95rem',
                lineHeight: '1.6',
                color: '#333'
              }}
            >
              {post.content}
            </div>

            {/* Post Action Buttons */}
            <div className="d-flex gap-2 align-items-center">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setReplyToPostId(post.id)}
                className="d-flex align-items-center gap-1"
              >
                <FiMessageSquare size={14} /> Reply
              </Button>
              <Button 
                variant="outline-secondary" 
                size="sm"
                className="d-flex align-items-center gap-1"
              >
                <FiShare2 size={14} /> Share
              </Button>
              
              {/* Reply count indicator */}
              {post.replies && post.replies.length > 0 && (
                <Badge bg="secondary" className="ms-2">
                  {post.replies.length} {post.replies.length === 1 ? 'reply' : 'replies'}
                </Badge>
              )}
            </div>

            {/* Nested Replies */}
            {post.replies && post.replies.length > 0 && (
              <div className="mt-4">
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
    <div className="thread-detail-page">
      {/* Enhanced Breadcrumb Navigation */}
      <Card className="mb-3 border-0 bg-light">
        <Card.Body className="py-2">
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <Button 
                variant="link" 
                className="p-0 text-decoration-none d-flex align-items-center" 
                onClick={() => navigate('/forum')}
              >
                <FiArrowLeft className="me-2" />
                Forum
              </Button>
              <span className="text-muted">/</span>
              <span className="text-primary fw-semibold">{thread.board_name}</span>
            </div>
            <div className="d-flex gap-2">
              <OverlayTrigger placement="top" overlay={<Tooltip>Share thread</Tooltip>}>
                <Button variant="outline-secondary" size="sm">
                  <FiShare2 />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={<Tooltip>Bookmark</Tooltip>}>
                <Button 
                  variant="outline-secondary" 
                  size="sm"
                  onClick={handleBookmark}
                  disabled={bookmarkMutation.isLoading}
                >
                  <FiBookmark />
                </Button>
              </OverlayTrigger>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Enhanced Thread Header */}
      <Card className="mb-4 shadow-sm border-0">
        <Card.Body className="p-4">
          {/* Badges and Status Row */}
          <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
            {thread.is_pinned && (
              <Badge bg="warning" className="d-flex align-items-center gap-1">
                <FiStar size={14} /> Pinned
              </Badge>
            )}
            {thread.is_locked && (
              <Badge bg="secondary" className="d-flex align-items-center gap-1">
                <FiLock size={14} /> Locked
              </Badge>
            )}
            {thread.tags?.map((tag) => (
              <Badge key={tag} bg="primary" className="px-3 py-2" style={{ fontWeight: 'normal' }}>
                #{tag}
              </Badge>
            ))}
          </div>

          {/* Thread Title */}
          <h1 className="mb-4" style={{ fontSize: '2rem', fontWeight: '700', lineHeight: '1.3' }}>
            {thread.title}
          </h1>

          {/* Author Info and Metadata */}
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
            <div className="d-flex align-items-center gap-3">
              <div 
                className="avatar-placeholder" 
                style={{ 
                  width: '48px', 
                  height: '48px', 
                  borderRadius: '50%', 
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}
              >
                {thread.author_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="d-flex align-items-center gap-2">
                  <strong style={{ fontSize: '1.1rem' }}>{thread.author_name}</strong>
                  <Badge bg="info" className="d-flex align-items-center gap-1">
                    <FiAward size={12} /> Author
                  </Badge>
                </div>
                <div className="text-muted small d-flex align-items-center gap-2">
                  <FiClock size={14} />
                  <span>{format(new Date(thread.created_at), 'MMMM d, yyyy • h:mm a')}</span>
                  {thread.created_at !== thread.updated_at && (
                    <span className="text-muted">(edited)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Thread Stats */}
            <div className="d-flex gap-4">
              <div className="text-center">
                <div className="text-muted small"><FiEye size={16} /></div>
                <strong>{thread.view_count}</strong>
                <div className="text-muted small">views</div>
              </div>
              <div className="text-center">
                <div className="text-muted small"><FiMessageSquare size={16} /></div>
                <strong>{thread.reply_count}</strong>
                <div className="text-muted small">replies</div>
              </div>
              <div className="text-center">
                <div className="text-muted small"><FiThumbsUp size={16} /></div>
                <strong className={thread.vote_score > 0 ? 'text-success' : thread.vote_score < 0 ? 'text-danger' : ''}>
                  {thread.vote_score}
                </strong>
                <div className="text-muted small">votes</div>
              </div>
            </div>
          </div>

          {/* Thread Content */}
          <div 
            className="thread-content p-4 mb-4" 
            style={{ 
              whiteSpace: 'pre-wrap',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              fontSize: '1.05rem',
              lineHeight: '1.7',
              border: '1px solid #e9ecef'
            }}
          >
            {thread.content}
          </div>

          {/* Voting and Actions */}
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex gap-2">
              {/* Vote Buttons */}
              <div className="btn-group shadow-sm" role="group">
                <Button
                  variant="outline-secondary"
                  onClick={() => handleVoteThread('up')}
                  disabled={thread.is_locked || voteThreadMutation.isLoading}
                  className="d-flex align-items-center gap-2"
                >
                  <FiThumbsUp size={18} />
                  <span>Upvote</span>
                  <Badge bg="secondary" text="dark">
                    {thread.vote_score >= 0 ? thread.vote_score : 0}
                  </Badge>
                </Button>
                <Button
                  variant="outline-secondary"
                  onClick={() => handleVoteThread('down')}
                  disabled={thread.is_locked || voteThreadMutation.isLoading}
                  className="d-flex align-items-center gap-2"
                >
                  <FiThumbsDown size={18} />
                  <span>Downvote</span>
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="d-flex gap-2">
              <Button variant="outline-secondary" size="sm">
                <FiFlag className="me-1" /> Report
              </Button>
              <Dropdown align="end">
                <Dropdown.Toggle variant="outline-secondary" size="sm">
                  <FiMoreVertical />
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item><FiEdit className="me-2" /> Edit</Dropdown.Item>
                  <Dropdown.Item onClick={handleBookmark}>
                    <FiBookmark className="me-2" /> Bookmark
                  </Dropdown.Item>
                  <Dropdown.Item><FiShare2 className="me-2" /> Share</Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item className="text-danger"><FiTrash2 className="me-2" /> Delete</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* Replies Section */}
      <div id="replies-section" className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="mb-0 d-flex align-items-center gap-2">
          <FiMessageSquare size={24} />
          <span>{thread.reply_count} {thread.reply_count === 1 ? 'Reply' : 'Replies'}</span>
        </h4>
        <Dropdown>
          <Dropdown.Toggle variant="outline-secondary" size="sm">
            Sort by: Newest
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item>Newest First</Dropdown.Item>
            <Dropdown.Item>Oldest First</Dropdown.Item>
            <Dropdown.Item>Most Upvoted</Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>

      {loadingPosts && (
        <div className="text-center p-5">
          <Spinner animation="border" variant="primary" />
          <p className="mt-3 text-muted">Loading replies...</p>
        </div>
      )}

      {posts && posts.length === 0 && !loadingPosts && (
        <Card className="mb-4 border-0 bg-light">
          <Card.Body className="text-center py-5">
            <FiMessageSquare size={48} className="text-muted mb-3" />
            <h5>No replies yet</h5>
            <p className="text-muted">Be the first to respond to this thread!</p>
          </Card.Body>
        </Card>
      )}

      {posts?.map((post) => renderPost(post))}

      {/* Enhanced Reply Form */}
      {!thread.is_locked ? (
        <Card className="mt-4 shadow-sm border-0" style={{ position: 'sticky', bottom: '20px', zIndex: 10 }}>
          <Card.Header className="bg-primary text-white">
            <h6 className="mb-0 d-flex align-items-center gap-2">
              <FiMessageSquare />
              {replyToPostId ? 'Reply to Comment' : 'Add Your Reply'}
            </h6>
          </Card.Header>
          <Card.Body className="p-4">
            {replyToPostId && (
              <Alert 
                variant="info" 
                className="d-flex justify-content-between align-items-center mb-3"
                style={{ borderLeft: '4px solid #0dcaf0' }}
              >
                <span className="d-flex align-items-center gap-2">
                  <FiMessageSquare />
                  <strong>Replying to a specific comment</strong>
                </span>
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
                  rows={6}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Share your thoughts, insights, or questions..."
                  style={{
                    fontSize: '0.95rem',
                    lineHeight: '1.6',
                    borderRadius: '8px',
                    border: '2px solid #e9ecef',
                    resize: 'vertical'
                  }}
                  className="form-control-lg"
                />
                <Form.Text className="text-muted">
                  Markdown formatting supported
                </Form.Text>
              </Form.Group>

              <div className="d-flex justify-content-between align-items-center">
                <div className="d-flex gap-2 align-items-center">
                  <small className="text-muted">
                    {replyContent.length} characters
                  </small>
                  {replyContent.length > 1000 && (
                    <Badge bg="warning">Long reply</Badge>
                  )}
                </div>
                <div className="d-flex gap-2">
                  {replyToPostId && (
                    <Button
                      variant="outline-secondary"
                      onClick={() => {
                        setReplyToPostId(null);
                        setReplyContent('');
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    disabled={!replyContent.trim() || replyMutation.isLoading}
                    className="px-4"
                  >
                    {replyMutation.isLoading ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        Posting...
                      </>
                    ) : (
                      <>
                        <FiMessageSquare className="me-2" /> Post Reply
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Form>
          </Card.Body>
        </Card>
      ) : (
        <Alert variant="warning" className="d-flex align-items-center gap-3 shadow-sm">
          <FiLock size={32} color="#856404" />
          <div>
            <strong>This thread is locked</strong>
            <p className="mb-0 small">No new replies can be added. The discussion has been closed by a moderator.</p>
          </div>
        </Alert>
      )}
    </div>
  );
}
