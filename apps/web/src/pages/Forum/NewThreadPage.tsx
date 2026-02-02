import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Card, Form, Button, Alert, Spinner, Badge, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiSend, FiPlus } from 'react-icons/fi';
import api from '../../lib/api';

interface Category {
  id: string;
  name: string;
  description: string;
  slug: string;
}

interface Board {
  id: string;
  name: string;
  description: string;
  slug: string;
  category_id: string;
}

export default function NewThreadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBoardModal, setShowBoardModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('');
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDescription, setNewBoardDescription] = useState('');
  const [modalError, setModalError] = useState('');

  // Fetch categories
  const { data: categories, isLoading: loadingCategories } = useQuery(
    'forum-categories',
    async () => {
      const response = await api.get('/forum/categories');
      return response.data.data as Category[];
    }
  );

  // Fetch boards for selected category
  const { data: boards, isLoading: loadingBoards } = useQuery(
    ['forum-boards', selectedCategoryId],
    async () => {
      if (!selectedCategoryId) return [];
      const response = await api.get(`/forum/categories/${selectedCategoryId}/boards`);
      return response.data.data as Board[];
    },
    { enabled: !!selectedCategoryId }
  );

  // Create thread mutation
  const createThreadMutation = useMutation(
    async (data: { boardId: string; title: string; content: string; tags?: string[] }) => {
      console.log('🔵 Creating thread with data:', data);
      const response = await api.post('/forum/threads', data);
      console.log('🟢 Thread creation response:', response.data);
      // Backend returns { success: true, data: { thread: {...} } }
      return response.data.data.thread;
    },
    {
      onSuccess: (thread) => {
        console.log('✅ Thread created successfully:', thread);
        queryClient.invalidateQueries('forum-threads');
        queryClient.invalidateQueries('forum-trending');
        queryClient.invalidateQueries('forum-recent');
        navigate(`/forum/threads/${thread.id}`);
      },
      onError: (err: any) => {
        console.error('❌ Thread creation error:', {
          fullError: err,
          response: err.response,
          responseData: err.response?.data,
          message: err.response?.data?.message,
          errorMessage: err.message,
          status: err.response?.status,
          validationDetails: err.response?.data?.details
        });
        
        // Format error message with validation details
        let errorMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to create thread';
        
        // If there are validation details, show them
        if (err.response?.data?.details && Array.isArray(err.response.data.details)) {
          const validationErrors = err.response.data.details
            .map((detail: any) => `${detail.field}: ${detail.message}`)
            .join(', ');
          errorMsg = `Validation failed: ${validationErrors}`;
        }
        
        setError(errorMsg);
      },
    }
  );

  // Create category mutation
  const createCategoryMutation = useMutation(
    async (data: { name: string; description: string; icon?: string }) => {
      console.log('🔵 Creating category with data:', data);
      const response = await api.post('/forum/categories', data);
      console.log('🟢 Category creation response:', response.data);
      return response.data.data;
    },
    {
      onSuccess: (data) => {
        console.log('✅ Category created successfully:', data);
        queryClient.invalidateQueries('forum-categories');
        setSelectedCategoryId(data.id);
        setShowCategoryModal(false);
        setNewCategoryName('');
        setNewCategoryDescription('');
        setNewCategoryIcon('');
        setModalError('');
        setSuccessMessage(`✅ Category "${data.name}" created successfully!`);
        setTimeout(() => setSuccessMessage(''), 5000);
      },
      onError: (err: any) => {
        console.error('❌ Category creation error:', {
          fullError: err,
          response: err.response,
          responseData: err.response?.data,
          message: err.response?.data?.message,
          errorMessage: err.message,
          status: err.response?.status,
          validationDetails: err.response?.data?.details
        });
        
        // Format error message with validation details
        let errorMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to create category';
        
        // If there are validation details, show them
        if (err.response?.data?.details && Array.isArray(err.response.data.details)) {
          const validationErrors = err.response.data.details
            .map((detail: any) => `${detail.field}: ${detail.message}`)
            .join(', ');
          errorMsg = `Validation failed: ${validationErrors}`;
        }
        
        setModalError(errorMsg);
      },
    }
  );

  // Create board mutation
  const createBoardMutation = useMutation(
    async (data: { name: string; description: string; category_id: string }) => {
      console.log('🔵 Creating board with data:', data);
      const response = await api.post('/forum/boards', data);
      console.log('🟢 Board creation response:', response.data);
      return response.data.data;
    },
    {
      onSuccess: (data) => {
        console.log('✅ Board created successfully:', data);
        queryClient.invalidateQueries(['forum-boards', selectedCategoryId]);
        setSelectedBoardId(data.id);
        setShowBoardModal(false);
        setNewBoardName('');
        setNewBoardDescription('');
        setModalError('');
        setSuccessMessage(`✅ Board "${data.name}" created successfully!`);
        setTimeout(() => setSuccessMessage(''), 5000);
      },
      onError: (err: any) => {
        console.error('❌ Board creation error:', {
          fullError: err,
          response: err.response,
          responseData: err.response?.data,
          message: err.response?.data?.message,
          errorMessage: err.message,
          status: err.response?.status,
          validationDetails: err.response?.data?.details
        });
        
        // Format error message with validation details
        let errorMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to create board';
        
        // If there are validation details, show them
        if (err.response?.data?.details && Array.isArray(err.response.data.details)) {
          const validationErrors = err.response.data.details
            .map((detail: any) => `${detail.field}: ${detail.message}`)
            .join(', ');
          errorMsg = `Validation failed: ${validationErrors}`;
        }
        
        setModalError(errorMsg);
      },
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!selectedBoardId) {
      setError('Please select a board');
      return;
    }
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }
    if (!content.trim()) {
      setError('Please enter content');
      return;
    }

    // Parse tags
    const tagArray = tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    createThreadMutation.mutate({
      boardId: selectedBoardId,  // Changed from board_id to boardId (camelCase)
      title: title.trim(),
      content: content.trim(),
      tags: tagArray.length > 0 ? tagArray : undefined,
    });
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setSelectedBoardId(''); // Reset board selection when category changes
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 0' }}>
      <div className="mb-4">
        <Button
          variant="link"
          className="p-0 mb-3"
          onClick={() => navigate('/forum')}
        >
          <FiArrowLeft className="me-2" />
          Back to Forum
        </Button>
        <h2 className="mb-0">Start a New Discussion</h2>
        <p className="text-muted">
          Share your ideas, ask questions, or start a conversation with the community
        </p>
      </div>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success" dismissible onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}

      <Card>
        <Card.Body className="p-4">
          <Form onSubmit={handleSubmit}>
            {/* Category Selection */}
            <Form.Group className="mb-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <Form.Label className="mb-0">
                  Category <span className="text-danger">*</span>
                </Form.Label>
                <Button
                  variant="outline-success"
                  size="sm"
                  onClick={() => setShowCategoryModal(true)}
                  style={{ borderRadius: '20px' }}
                >
                  <FiPlus className="me-1" />
                  Add New Category
                </Button>
              </div>
              {loadingCategories ? (
                <div className="text-center py-3">
                  <Spinner animation="border" size="sm" />
                </div>
              ) : (
                <div className="d-flex flex-wrap gap-2">
                  {categories?.map((category) => (
                    <div key={category.id}>
                      <input
                        type="radio"
                        className="btn-check"
                        name="category"
                        id={`category-${category.id}`}
                        autoComplete="off"
                        checked={selectedCategoryId === category.id}
                        onChange={() => handleCategoryChange(category.id)}
                      />
                      <label
                        className="btn btn-outline-primary"
                        htmlFor={`category-${category.id}`}
                        style={{ borderRadius: '20px' }}
                      >
                        {category.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <Form.Text className="text-muted">
                Select the main category for your discussion
              </Form.Text>
            </Form.Group>

            {/* Board Selection */}
            {selectedCategoryId && (
              <Form.Group className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Form.Label className="mb-0">
                    Board <span className="text-danger">*</span>
                  </Form.Label>
                  <Button
                    variant="outline-success"
                    size="sm"
                    onClick={() => setShowBoardModal(true)}
                    style={{ borderRadius: '20px' }}
                  >
                    <FiPlus className="me-1" />
                    Add New Board
                  </Button>
                </div>
                {loadingBoards ? (
                  <div className="text-center py-3">
                    <Spinner animation="border" size="sm" />
                  </div>
                ) : boards && boards.length > 0 ? (
                  <div className="d-flex flex-wrap gap-2">
                    {boards.map((board) => (
                      <div key={board.id}>
                        <input
                          type="radio"
                          className="btn-check"
                          name="board"
                          id={`board-${board.id}`}
                          autoComplete="off"
                          checked={selectedBoardId === board.id}
                          onChange={() => setSelectedBoardId(board.id)}
                        />
                        <label
                          className="btn btn-outline-success"
                          htmlFor={`board-${board.id}`}
                          style={{ borderRadius: '20px' }}
                        >
                          {board.name}
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Alert variant="info" className="mb-0">
                    No boards available in this category
                  </Alert>
                )}
                <Form.Text className="text-muted">
                  Choose the specific board within the category
                </Form.Text>
              </Form.Group>
            )}

            {/* Title */}
            <Form.Group className="mb-4">
              <Form.Label>
                Discussion Title <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter a clear and descriptive title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
              />
              <Form.Text className="text-muted">
                {title.length}/200 characters
              </Form.Text>
            </Form.Group>

            {/* Content */}
            <Form.Group className="mb-4">
              <Form.Label>
                Content <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={12}
                placeholder="Share your thoughts, ideas, or questions in detail..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                style={{ resize: 'vertical' }}
              />
              <Form.Text className="text-muted">
                Provide detailed information to help others understand your discussion topic
              </Form.Text>
            </Form.Group>

            {/* Tags */}
            <Form.Group className="mb-4">
              <Form.Label>Tags (Optional)</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., startup, funding, advice"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
              <Form.Text className="text-muted">
                Separate tags with commas. Tags help others find your discussion.
              </Form.Text>
              {tags && (
                <div className="mt-2">
                  {tags.split(',').filter(t => t.trim()).map((tag, idx) => (
                    <Badge key={idx} bg="secondary" className="me-2">
                      {tag.trim()}
                    </Badge>
                  ))}
                </div>
              )}
            </Form.Group>

            {/* Submit Buttons */}
            <div className="d-flex gap-2 justify-content-end">
              <Button
                variant="outline-secondary"
                onClick={() => navigate('/forum')}
                disabled={createThreadMutation.isLoading}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                type="submit"
                disabled={createThreadMutation.isLoading || !selectedBoardId || !title || !content}
              >
                {createThreadMutation.isLoading ? (
                  <>
                    <Spinner
                      as="span"
                      animation="border"
                      size="sm"
                      role="status"
                      aria-hidden="true"
                      className="me-2"
                    />
                    Creating...
                  </>
                ) : (
                  <>
                    <FiSend className="me-2" />
                    Create Discussion
                  </>
                )}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      {/* Guidelines */}
      <Card className="mt-4" style={{ background: '#f8f9fa' }}>
        <Card.Body>
          <h6 className="fw-bold mb-3">Discussion Guidelines</h6>
          <ul className="mb-0" style={{ fontSize: '14px' }}>
            <li>Be respectful and constructive in your discussions</li>
            <li>Use clear and descriptive titles</li>
            <li>Provide enough context for others to understand your topic</li>
            <li>Choose the most appropriate category and board</li>
            <li>Add relevant tags to help others discover your discussion</li>
            <li>Search existing discussions before creating duplicates</li>
          </ul>
        </Card.Body>
      </Card>

      {/* Add Category Modal */}
      <Modal show={showCategoryModal} onHide={() => setShowCategoryModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Add New Category</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {modalError && (
            <Alert variant="danger" dismissible onClose={() => setModalError('')}>
              {modalError}
            </Alert>
          )}
          <Form onSubmit={(e) => {
            e.preventDefault();
            if (!newCategoryName.trim()) {
              setModalError('Category name is required');
              return;
            }
            createCategoryMutation.mutate({
              name: newCategoryName.trim(),
              description: newCategoryDescription.trim(),
              icon: newCategoryIcon.trim() || undefined,
            });
          }}>
            <Form.Group className="mb-3">
              <Form.Label>Category Name <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., General Discussion, Funding, Resources"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                autoFocus
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>
                Description <span className="text-danger">*</span>
                <small className="text-muted ms-2">
                  ({newCategoryDescription.length}/500 characters)
                </small>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder="Describe what this category is for..."
                value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
                maxLength={500}
                required
              />
              {newCategoryDescription.length >= 450 && (
                <Form.Text className={newCategoryDescription.length >= 500 ? 'text-danger' : 'text-warning'}>
                  {500 - newCategoryDescription.length} characters remaining
                </Form.Text>
              )}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Icon (Optional)</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., 💬 🚀 💡 (single emoji)"
                value={newCategoryIcon}
                onChange={(e) => setNewCategoryIcon(e.target.value)}
                maxLength={2}
              />
              <Form.Text className="text-muted">
                Add a single emoji to represent this category
              </Form.Text>
            </Form.Group>

            <div className="d-flex gap-2 justify-content-end">
              <Button
                variant="outline-secondary"
                onClick={() => {
                  setShowCategoryModal(false);
                  setNewCategoryName('');
                  setNewCategoryDescription('');
                  setNewCategoryIcon('');
                  setModalError('');
                }}
                disabled={createCategoryMutation.isLoading}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                type="submit"
                disabled={createCategoryMutation.isLoading || !newCategoryName.trim() || !newCategoryDescription.trim()}
              >
                {createCategoryMutation.isLoading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FiPlus className="me-2" />
                    Create Category
                  </>
                )}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>

      {/* Add Board Modal */}
      <Modal show={showBoardModal} onHide={() => setShowBoardModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Add New Board</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {modalError && (
            <Alert variant="danger" dismissible onClose={() => setModalError('')}>
              {modalError}
            </Alert>
          )}
          <Form onSubmit={(e) => {
            e.preventDefault();
            if (!newBoardName.trim()) {
              setModalError('Board name is required');
              return;
            }
            if (!selectedCategoryId) {
              setModalError('Please select a category first');
              return;
            }
            createBoardMutation.mutate({
              name: newBoardName.trim(),
              description: newBoardDescription.trim(),
              category_id: selectedCategoryId,
            });
          }}>
            <Form.Group className="mb-3">
              <Form.Label>Board Name <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., Startup Ideas, Pitch Deck Reviews"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                autoFocus
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>
                Description <span className="text-danger">*</span>
                <small className="text-muted ms-2">
                  ({newBoardDescription.length}/500 characters)
                </small>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder="Describe what this board is for..."
                value={newBoardDescription}
                onChange={(e) => setNewBoardDescription(e.target.value)}
                maxLength={500}
                required
              />
              {newBoardDescription.length >= 450 && (
                <Form.Text className={newBoardDescription.length >= 500 ? 'text-danger' : 'text-warning'}>
                  {500 - newBoardDescription.length} characters remaining
                </Form.Text>
              )}
            </Form.Group>

            <Alert variant="info" className="mb-3">
              This board will be added to the "{categories?.find(c => c.id === selectedCategoryId)?.name}" category
            </Alert>

            <div className="d-flex gap-2 justify-content-end">
              <Button
                variant="outline-secondary"
                onClick={() => {
                  setShowBoardModal(false);
                  setNewBoardName('');
                  setNewBoardDescription('');
                  setModalError('');
                }}
                disabled={createBoardMutation.isLoading}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                type="submit"
                disabled={createBoardMutation.isLoading || !newBoardName.trim() || !newBoardDescription.trim()}
              >
                {createBoardMutation.isLoading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FiPlus className="me-2" />
                    Create Board
                  </>
                )}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
}
