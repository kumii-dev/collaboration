import React, { useState } from 'react';
import {
  Container, Row, Col, Card, Button, Table, Badge, Modal, Form, Spinner, Alert, Tabs, Tab,
} from 'react-bootstrap';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  FiPlus, FiEdit2, FiTrash2, FiArrowLeft, FiRefreshCw, FiLock, FiUnlock,
  FiStar, FiEyeOff, FiEye, FiAlertTriangle,
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  sort_order: number;
  archived: boolean;
}

interface Board {
  id: string;
  name: string;
  description: string;
  category_id: string;
  is_private: boolean;
  required_role: string | null;
  sort_order: number;
}

interface Thread {
  id: string;
  title: string;
  is_pinned: boolean;
  is_locked: boolean;
  deleted: boolean;
  deleted_at: string | null;
  reply_count: number;
  vote_score: number;
  view_count: number;
  created_at: string;
  board: { id: string; name: string; category_id: string } | null;
  author: { id: string; full_name: string; email: string } | null;
}

interface ThreadMeta { total: number; limit: number; offset: number }

// ─── API helpers ─────────────────────────────────────────────────────────────

interface AdminCategory extends Category { board_count: number }

const api = {
  // Categories — use admin endpoint so archived rows are included
  listCategories: () =>
    apiClient.get('/forum/admin/categories').then((r: { data: { data: AdminCategory[] } }) => r.data.data),
  createCategory: (body: Partial<Category>) =>
    apiClient.post('/forum/admin/categories', body).then((r: { data: unknown }) => r.data),
  updateCategory: (id: string, body: Partial<Category> & { archived?: boolean }) =>
    apiClient.put(`/forum/admin/categories/${id}`, body).then((r: { data: unknown }) => r.data),

  // Boards
  listBoards: (categoryId: string) =>
    apiClient.get(`/forum/categories/${categoryId}/boards`).then((r: { data: { data: Board[] } }) => r.data.data),
  createBoard: (body: Partial<Board>) =>
    apiClient.post('/forum/admin/boards', body).then((r: { data: unknown }) => r.data),
  updateBoard: (id: string, body: Partial<Omit<Board, 'category_id'>>) =>
    apiClient.put(`/forum/admin/boards/${id}`, body).then((r: { data: unknown }) => r.data),
  deleteBoard: (id: string) =>
    apiClient.delete(`/forum/admin/boards/${id}`).then((r: { data: unknown }) => r.data),

  // Threads
  listThreads: (params: Record<string, string>) =>
    apiClient.get('/forum/admin/threads', { params }).then((r: { data: { success: boolean; data: Thread[]; meta: ThreadMeta } }) => r.data),
  patchThread: (id: string, body: Record<string, unknown>) =>
    apiClient.patch(`/forum/admin/threads/${id}`, body).then((r: { data: unknown }) => r.data),
  deleteThread: (id: string) =>
    apiClient.delete(`/forum/threads/${id}`).then((r: { data: unknown }) => r.data),
};

// ─── Confirm Modal ───────────────────────────────────────────────────────────

const ConfirmModal: React.FC<{
  show: boolean;
  title: string;
  message: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onHide: () => void;
  loading?: boolean;
}> = ({ show, title, message, variant = 'danger', onConfirm, onHide, loading }) => (
  <Modal show={show} onHide={onHide} centered>
    <Modal.Header closeButton>
      <Modal.Title className="fs-6 fw-semibold">{title}</Modal.Title>
    </Modal.Header>
    <Modal.Body>
      <div className="d-flex gap-2 align-items-start">
        <FiAlertTriangle className={`text-${variant} mt-1 flex-shrink-0`} size={20} />
        <p className="mb-0 text-muted small">{message}</p>
      </div>
    </Modal.Body>
    <Modal.Footer className="border-0">
      <Button variant="outline-secondary" size="sm" onClick={onHide} disabled={loading}>Cancel</Button>
      <Button variant={variant} size="sm" onClick={onConfirm} disabled={loading}>
        {loading ? <Spinner size="sm" animation="border" /> : 'Confirm'}
      </Button>
    </Modal.Footer>
  </Modal>
);

// ─── Category Form Modal ─────────────────────────────────────────────────────

const CategoryModal: React.FC<{
  show: boolean;
  initial?: Partial<Category>;
  onHide: () => void;
  onSave: (data: Partial<Category>) => void;
  loading?: boolean;
}> = ({ show, initial, onHide, onSave, loading }) => {
  const [form, setForm] = useState({ name: '', description: '', icon: '', sort_order: 0 });

  React.useEffect(() => {
    if (show) {
      setForm({
        name: initial?.name ?? '',
        description: initial?.description ?? '',
        icon: initial?.icon ?? '',
        sort_order: initial?.sort_order ?? 0,
      });
    }
  }, [show, initial]);

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: k === 'sort_order' ? parseInt(e.target.value) || 0 : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...form, icon: form.icon || undefined });
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6 fw-semibold">{initial?.id ? 'Edit Category' : 'New Category'}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-flex flex-column gap-3">
          <Form.Group>
            <Form.Label className="small fw-semibold">Name <span className="text-danger">*</span></Form.Label>
            <Form.Control size="sm" value={form.name} onChange={field('name')} required maxLength={100} placeholder="e.g. General Discussion" />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small fw-semibold">Description <span className="text-danger">*</span></Form.Label>
            <Form.Control as="textarea" size="sm" rows={2} value={form.description} onChange={field('description')} required maxLength={500} />
          </Form.Group>
          <Row className="g-2">
            <Col xs={4}>
              <Form.Group>
                <Form.Label className="small fw-semibold">Icon (emoji)</Form.Label>
                <Form.Control size="sm" value={form.icon} onChange={field('icon')} maxLength={10} placeholder="💬" />
              </Form.Group>
            </Col>
            <Col xs={8}>
              <Form.Group>
                <Form.Label className="small fw-semibold">Sort Order</Form.Label>
                <Form.Control size="sm" type="number" min={0} value={form.sort_order} onChange={field('sort_order')} />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button variant="outline-secondary" size="sm" onClick={onHide} disabled={loading}>Cancel</Button>
          <Button type="submit" size="sm" style={{ background: 'linear-gradient(135deg,#4a6741,#7a9e6e)', border: 'none' }} disabled={loading}>
            {loading ? <Spinner size="sm" animation="border" /> : 'Save'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

// ─── Board Form Modal ────────────────────────────────────────────────────────

const BoardModal: React.FC<{
  show: boolean;
  initial?: Partial<Board>;
  categories: Category[];
  onHide: () => void;
  onSave: (data: Partial<Board>) => void;
  loading?: boolean;
}> = ({ show, initial, categories, onHide, onSave, loading }) => {
  const [form, setForm] = useState({ name: '', description: '', category_id: '', is_private: false, required_role: '', sort_order: 0 });

  React.useEffect(() => {
    if (show) {
      setForm({
        name: initial?.name ?? '',
        description: initial?.description ?? '',
        category_id: initial?.category_id ?? (categories[0]?.id ?? ''),
        is_private: initial?.is_private ?? false,
        required_role: initial?.required_role ?? '',
        sort_order: initial?.sort_order ?? 0,
      });
    }
  }, [show, initial, categories]);

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: k === 'sort_order' ? parseInt((e.target as HTMLInputElement).value) || 0 : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      required_role: form.required_role || null,
    });
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6 fw-semibold">{initial?.id ? 'Edit Board' : 'New Board'}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-flex flex-column gap-3">
          <Form.Group>
            <Form.Label className="small fw-semibold">Name <span className="text-danger">*</span></Form.Label>
            <Form.Control size="sm" value={form.name} onChange={field('name')} required maxLength={100} />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small fw-semibold">Description <span className="text-danger">*</span></Form.Label>
            <Form.Control as="textarea" size="sm" rows={2} value={form.description} onChange={field('description')} required maxLength={500} />
          </Form.Group>
          {!initial?.id && (
            <Form.Group>
              <Form.Label className="small fw-semibold">Category <span className="text-danger">*</span></Form.Label>
              <Form.Select size="sm" value={form.category_id} onChange={field('category_id')} required>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
              </Form.Select>
            </Form.Group>
          )}
          <Row className="g-2">
            <Col xs={6}>
              <Form.Group>
                <Form.Label className="small fw-semibold">Required Role</Form.Label>
                <Form.Control size="sm" value={form.required_role} onChange={field('required_role')} placeholder="member, moderator…" />
              </Form.Group>
            </Col>
            <Col xs={6}>
              <Form.Group>
                <Form.Label className="small fw-semibold">Sort Order</Form.Label>
                <Form.Control size="sm" type="number" min={0} value={form.sort_order} onChange={field('sort_order')} />
              </Form.Group>
            </Col>
          </Row>
          <Form.Check
            type="switch"
            id="is_private"
            label="Private board"
            checked={form.is_private}
            onChange={e => setForm(f => ({ ...f, is_private: e.target.checked }))}
          />
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button variant="outline-secondary" size="sm" onClick={onHide} disabled={loading}>Cancel</Button>
          <Button type="submit" size="sm" style={{ background: 'linear-gradient(135deg,#4a6741,#7a9e6e)', border: 'none' }} disabled={loading}>
            {loading ? <Spinner size="sm" animation="border" /> : 'Save'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

// ─── Categories Tab ───────────────────────────────────────────────────────────

const CategoriesTab: React.FC = () => {
  const qc = useQueryClient();
  const [catModal, setCatModal] = useState<{ show: boolean; initial?: Partial<Category> }>({ show: false });
  const [confirm, setConfirm] = useState<{ show: boolean; id?: string; action?: 'archive' | 'unarchive' }>({ show: false });
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [], isLoading } = useQuery<AdminCategory[]>('admin-categories', api.listCategories);

  // Fix #3 — pass id+data together to avoid stale closure
  const saveMut = useMutation(
    ({ id, data }: { id?: string; data: Partial<Category> }) =>
      id ? api.updateCategory(id, data) : api.createCategory(data),
    {
      onSuccess: () => { qc.invalidateQueries('admin-categories'); setCatModal({ show: false }); },
      onError: () => setError('Failed to save category'),
    }
  );

  // Fix #1 & #2 — archive/unarchive both use PUT endpoint with archived flag
  const archiveMut = useMutation(
    ({ id, archived }: { id: string; archived: boolean }) => api.updateCategory(id, { archived }),
    {
      onSuccess: () => { qc.invalidateQueries('admin-categories'); setConfirm({ show: false }); },
      onError: () => setError('Failed to update category'),
    }
  );

  const activeCount   = categories.filter(c => !c.archived).length;
  const archivedCount = categories.filter(c =>  c.archived).length;

  return (
    <>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)} className="small py-2">{error}</Alert>}
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <span className="text-muted small">
          {activeCount} active{archivedCount > 0 ? `, ${archivedCount} archived` : ''}
        </span>
        <Button size="sm" style={{ background: 'linear-gradient(135deg,#4a6741,#7a9e6e)', border: 'none' }}
          onClick={() => setCatModal({ show: true })}>
          <FiPlus className="me-1" /> New Category
        </Button>
      </div>
      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" size="sm" /></div>
      ) : categories.length === 0 ? (
        <div className="text-center py-5 text-muted small">
          <div style={{ fontSize: 32 }}>📂</div>
          <p className="mt-2">No categories yet. Create your first one.</p>
        </div>
      ) : (
        <Table hover size="sm" className="align-middle small">
          <thead className="table-light">
            <tr>
              <th>Icon</th><th>Name</th><th>Description</th><th className="text-center">Boards</th><th className="text-center">Order</th><th className="text-center">Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <tr key={cat.id} className={cat.archived ? 'text-muted' : ''}>
                <td className="fs-5">{cat.icon || '—'}</td>
                <td className="fw-semibold">{cat.name}</td>
                <td className="text-muted" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.description}</td>
                <td className="text-center">{cat.board_count}</td>
                <td className="text-center">{cat.sort_order}</td>
                <td className="text-center">
                  {cat.archived
                    ? <Badge bg="secondary" className="small">Archived</Badge>
                    : <Badge bg="success" className="small">Active</Badge>}
                </td>
                <td>
                  <div className="d-flex gap-1 justify-content-end">
                    <Button variant="outline-secondary" size="sm" className="py-0 px-2"
                      onClick={() => setCatModal({ show: true, initial: cat })}>
                      <FiEdit2 size={13} />
                    </Button>
                    {cat.archived ? (
                      <Button variant="outline-success" size="sm" className="py-0 px-2" title="Unarchive"
                        onClick={() => setConfirm({ show: true, id: cat.id, action: 'unarchive' })}>
                        <FiEye size={13} />
                      </Button>
                    ) : (
                      <Button variant="outline-danger" size="sm" className="py-0 px-2" title="Archive"
                        onClick={() => setConfirm({ show: true, id: cat.id, action: 'archive' })}>
                        <FiEyeOff size={13} />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <CategoryModal
        show={catModal.show}
        initial={catModal.initial}
        onHide={() => setCatModal({ show: false })}
        onSave={data => saveMut.mutate({ id: catModal.initial?.id, data })}
        loading={saveMut.isLoading}
      />
      <ConfirmModal
        show={confirm.show}
        title={confirm.action === 'unarchive' ? 'Unarchive Category' : 'Archive Category'}
        message={confirm.action === 'unarchive'
          ? 'This will make the category and all its boards visible to users again.'
          : 'This will hide the category from all users. Boards and threads inside it remain intact and can be restored by unarchiving.'}
        variant="warning"
        onConfirm={() => confirm.id && archiveMut.mutate({ id: confirm.id, archived: confirm.action === 'archive' })}
        onHide={() => setConfirm({ show: false })}
        loading={archiveMut.isLoading}
      />
    </>
  );
};

// ─── Boards Tab ───────────────────────────────────────────────────────────────

const BoardsTab: React.FC = () => {
  const qc = useQueryClient();
  const [boardModal, setBoardModal] = useState<{ show: boolean; initial?: Partial<Board> }>({ show: false });
  const [confirm, setConfirm] = useState<{ show: boolean; id?: string }>({ show: false });
  const [selectedCat, setSelectedCat] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery<Category[]>('admin-categories', api.listCategories);

  const activeCatId = selectedCat || categories[0]?.id || '';

  const { data: boards = [], isLoading } = useQuery<Board[]>(
    ['admin-boards', activeCatId],
    () => api.listBoards(activeCatId),
    { enabled: !!activeCatId }
  );

  // Fix #3 — pass id+data together to avoid stale closure
  const saveMut = useMutation(
    ({ id, data }: { id?: string; data: Partial<Board> }) =>
      id ? api.updateBoard(id, data) : api.createBoard(data),
    {
      onSuccess: () => { qc.invalidateQueries(['admin-boards', activeCatId]); setBoardModal({ show: false }); },
      onError: () => setError('Failed to save board'),
    }
  );

  const deleteMut = useMutation((id: string) => api.deleteBoard(id), {
    onSuccess: () => { qc.invalidateQueries(['admin-boards', activeCatId]); setConfirm({ show: false }); },
    onError: () => setError('Failed to delete board'),
  });

  return (
    <>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)} className="small py-2">{error}</Alert>}
      <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
        <Form.Select size="sm" style={{ width: 'auto' }} value={activeCatId} onChange={e => setSelectedCat(e.target.value)}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
        </Form.Select>
        <Button size="sm" className="ms-auto" style={{ background: 'linear-gradient(135deg,#4a6741,#7a9e6e)', border: 'none' }}
          onClick={() => setBoardModal({ show: true, initial: { category_id: activeCatId } })}>
          <FiPlus className="me-1" /> New Board
        </Button>
      </div>
      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" size="sm" /></div>
      ) : (
        <Table hover size="sm" className="align-middle small">
          <thead className="table-light">
            <tr><th>Name</th><th>Description</th><th>Role</th><th className="text-center">Private</th><th className="text-center">Order</th><th></th></tr>
          </thead>
          <tbody>
            {boards.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted py-4">No boards in this category</td></tr>
            )}
            {boards.map(board => (
              <tr key={board.id}>
                <td className="fw-semibold">{board.name}</td>
                <td className="text-muted" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.description}</td>
                <td>{board.required_role ? <Badge bg="info" text="dark" className="small">{board.required_role}</Badge> : <span className="text-muted">—</span>}</td>
                <td className="text-center">{board.is_private ? <FiEyeOff size={13} className="text-warning" /> : <FiEye size={13} className="text-success" />}</td>
                <td className="text-center">{board.sort_order}</td>
                <td>
                  <div className="d-flex gap-1 justify-content-end">
                    <Button variant="outline-secondary" size="sm" className="py-0 px-2"
                      onClick={() => setBoardModal({ show: true, initial: board })}>
                      <FiEdit2 size={13} />
                    </Button>
                    <Button variant="outline-danger" size="sm" className="py-0 px-2"
                      onClick={() => setConfirm({ show: true, id: board.id })}>
                      <FiTrash2 size={13} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <BoardModal
        show={boardModal.show}
        initial={boardModal.initial}
        categories={categories}
        onHide={() => setBoardModal({ show: false })}
        onSave={data => saveMut.mutate({ id: boardModal.initial?.id, data })}
        loading={saveMut.isLoading}
      />
      <ConfirmModal
        show={confirm.show}
        title="Delete Board"
        message="This will permanently delete the board and all of its threads and posts. This cannot be undone."
        onConfirm={() => confirm.id && deleteMut.mutate(confirm.id)}
        onHide={() => setConfirm({ show: false })}
        loading={deleteMut.isLoading}
      />
    </>
  );
};

// ─── Threads Tab ──────────────────────────────────────────────────────────────

const ThreadsTab: React.FC = () => {
  const qc = useQueryClient();
  const [deletedFilter, setDeletedFilter] = useState<'all' | 'false' | 'true'>('all');
  const [searchInput,   setSearchInput]   = useState('');
  const [search,        setSearch]        = useState('');   // debounced
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const [confirm, setConfirm] = useState<{ show: boolean; id?: string; action?: 'delete' | 'restore' }>({ show: false });
  const [error, setError] = useState<string | null>(null);

  // Debounce search input by 400 ms
  React.useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setOffset(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const qKey = ['admin-threads', deletedFilter, search, offset];
  const { data, isLoading, refetch } = useQuery(
    qKey,
    () => {
      const params: Record<string, string> = {
        deleted: deletedFilter,
        limit: String(limit),
        offset: String(offset),
      };
      if (search) params.q = search;
      return api.listThreads(params);
    },
    { keepPreviousData: true }
  );

  const threads = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const patchMut = useMutation(
    ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patchThread(id, body),
    { onSuccess: () => qc.invalidateQueries(qKey), onError: () => setError('Failed to update thread') }
  );

  const deleteMut = useMutation((id: string) => api.deleteThread(id), {
    onSuccess: () => { qc.invalidateQueries(qKey); setConfirm({ show: false }); },
    onError: () => setError('Failed to delete thread'),
  });

  const handleConfirm = () => {
    if (!confirm.id) return;
    if (confirm.action === 'delete') deleteMut.mutate(confirm.id);
    if (confirm.action === 'restore') patchMut.mutate({ id: confirm.id, body: { deleted: false } });
  };

  const formatDate = (s: string) => new Date(s).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: '2-digit' });

  return (
    <>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)} className="small py-2">{error}</Alert>}
      <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
        <Form.Control
          type="search"
          size="sm"
          placeholder="Search threads…"
          style={{ width: 200 }}
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
        <Form.Select size="sm" style={{ width: 'auto' }} value={deletedFilter} onChange={e => { setDeletedFilter(e.target.value as typeof deletedFilter); setOffset(0); }}>
          <option value="all">All threads</option>
          <option value="false">Active only</option>
          <option value="true">Deleted only</option>
        </Form.Select>
        <span className="text-muted small ms-auto">{total} thread{total !== 1 ? 's' : ''}</span>
        <Button variant="outline-secondary" size="sm" onClick={() => refetch()}><FiRefreshCw size={13} /></Button>
      </div>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" size="sm" /></div>
      ) : (
        <>
          <Table hover size="sm" className="align-middle small">
            <thead className="table-light">
              <tr><th>Title</th><th>Board</th><th>Author</th><th className="text-center">Replies</th><th className="text-center">Score</th><th>Date</th><th>Flags</th><th></th></tr>
            </thead>
            <tbody>
              {threads.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted py-4">No threads found</td></tr>
              )}
              {threads.map(t => (
                <tr key={t.id} className={t.deleted ? 'text-muted' : ''}>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.deleted && <FiTrash2 size={11} className="text-danger me-1" />}
                    {t.title}
                  </td>
                  <td className="text-muted">{t.board?.name ?? '—'}</td>
                  <td className="text-muted">{t.author?.full_name ?? t.author?.email ?? '—'}</td>
                  <td className="text-center">{t.reply_count}</td>
                  <td className="text-center">{t.vote_score}</td>
                  <td className="text-muted">{formatDate(t.created_at)}</td>
                  <td>
                    <div className="d-flex gap-1">
                      {t.is_pinned && <Badge bg="warning" text="dark" className="small">Pinned</Badge>}
                      {t.is_locked && <Badge bg="secondary" className="small">Locked</Badge>}
                    </div>
                  </td>
                  <td>
                    <div className="d-flex gap-1 justify-content-end flex-nowrap">
                      <Button variant="outline-secondary" size="sm" className="py-0 px-1" title={t.is_pinned ? 'Unpin' : 'Pin'}
                        onClick={() => patchMut.mutate({ id: t.id, body: { is_pinned: !t.is_pinned } })}>
                        <FiStar size={12} className={t.is_pinned ? 'text-warning' : ''} />
                      </Button>
                      <Button variant="outline-secondary" size="sm" className="py-0 px-1" title={t.is_locked ? 'Unlock' : 'Lock'}
                        onClick={() => patchMut.mutate({ id: t.id, body: { is_locked: !t.is_locked } })}>
                        {t.is_locked ? <FiUnlock size={12} /> : <FiLock size={12} />}
                      </Button>
                      {t.deleted ? (
                        <Button variant="outline-success" size="sm" className="py-0 px-1" title="Restore"
                          onClick={() => setConfirm({ show: true, id: t.id, action: 'restore' })}>
                          <FiEye size={12} />
                        </Button>
                      ) : (
                        <Button variant="outline-danger" size="sm" className="py-0 px-1" title="Delete"
                          onClick={() => setConfirm({ show: true, id: t.id, action: 'delete' })}>
                          <FiTrash2 size={12} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>

          {/* Pagination */}
          {total > limit && (
            <div className="d-flex justify-content-between align-items-center mt-2">
              <Button variant="outline-secondary" size="sm" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - limit))}>
                ← Prev
              </Button>
              <span className="text-muted small">{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
              <Button variant="outline-secondary" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(o => o + limit)}>
                Next →
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        show={confirm.show}
        title={confirm.action === 'restore' ? 'Restore Thread' : 'Delete Thread'}
        message={confirm.action === 'restore'
          ? 'This will make the thread visible to all users again.'
          : 'This will soft-delete the thread. You can restore it later from the Deleted filter.'}
        variant={confirm.action === 'restore' ? 'warning' : 'danger'}
        onConfirm={handleConfirm}
        onHide={() => setConfirm({ show: false })}
        loading={deleteMut.isLoading || patchMut.isLoading}
      />
    </>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const ForumAdminPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Container fluid className="py-4 px-3 px-md-4" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="d-flex align-items-center gap-2 mb-4">
        <Button variant="link" className="p-0 text-muted" onClick={() => navigate('/dashboard')}>
          <FiArrowLeft size={18} />
        </Button>
        <div>
          <h4 className="mb-0 fw-bold" style={{ color: '#4a6741' }}>Forum Admin</h4>
          <p className="text-muted small mb-0">Manage categories, boards and threads</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          <div style={{ height: 4, background: 'linear-gradient(135deg,#4a6741,#7a9e6e)', borderRadius: '8px 8px 0 0' }} />
          <div className="p-3 p-md-4">
            <Tabs defaultActiveKey="categories" className="mb-3" id="forum-admin-tabs">
              <Tab eventKey="categories" title="Categories">
                <CategoriesTab />
              </Tab>
              <Tab eventKey="boards" title="Boards">
                <BoardsTab />
              </Tab>
              <Tab eventKey="threads" title="Threads">
                <ThreadsTab />
              </Tab>
            </Tabs>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default ForumAdminPage;
