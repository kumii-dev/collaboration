import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Card, Table, Badge, Button, Form, InputGroup,
  Spinner, Alert, Modal, ButtonGroup,
} from 'react-bootstrap';
import { FiSearch, FiShield, FiUser, FiUsers, FiFilter } from 'react-icons/fi';
import { format } from 'date-fns';
import api from '../../lib/api';
import { useKumii } from '../../lib/KumiiContext';
import { useNavigate } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────
type DBRole = 'entrepreneur' | 'funder' | 'advisor' | 'moderator' | 'admin';

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: DBRole;
  verified: boolean;
  company: string | null;
  sector: string | null;
  avatar_url: string | null;
  reputation_score: number;
  last_seen_at: string | null;
  created_at: string;
}

const ROLE_COLORS: Record<DBRole, string> = {
  admin:       '#dc2626',
  moderator:   '#7a8567',
  entrepreneur:'#3b82f6',
  funder:      '#8b5cf6',
  advisor:     '#f59e0b',
};

const ROLE_LABELS: Record<DBRole, string> = {
  admin:       '⚙️ Admin',
  moderator:   '🛡️ Moderator',
  entrepreneur:'🚀 Entrepreneur',
  funder:      '💰 Funder',
  advisor:     '🎯 Advisor',
};

const ALL_ROLES: DBRole[] = ['admin', 'moderator', 'entrepreneur', 'funder', 'advisor'];

export default function AdminUsersPage() {
  const { role: myRole } = useKumii();
  const navigate          = useNavigate();
  const queryClient       = useQueryClient();

  const [search,      setSearch]      = useState('');
  const [roleFilter,  setRoleFilter]  = useState<DBRole | ''>('');
  const [page,        setPage]        = useState(0);
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null);
  const [newRole,     setNewRole]     = useState<DBRole>('moderator');

  const limit = 20;

  // ── Redirect non-admins ──────────────────────────────────────────────────
  if (myRole !== null && myRole !== 'admin') {
    navigate('/dashboard');
    return null;
  }

  // ── Fetch users ──────────────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery(
    ['admin-users', search, roleFilter, page],
    async () => {
      const params: Record<string, unknown> = { limit, offset: page * limit };
      if (search)     params.search = search;
      if (roleFilter) params.role   = roleFilter;
      const res = await api.get('/admin/users', { params });
      return res.data.data as { users: AdminUser[]; total: number };
    },
    { keepPreviousData: true, staleTime: 30_000 }
  );

  // ── Role-change mutation ─────────────────────────────────────────────────
  const roleMutation = useMutation(
    ({ userId, role }: { userId: string; role: DBRole }) =>
      api.patch(`/admin/users/${userId}/role`, { role }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-users');
        setConfirmUser(null);
      },
    }
  );

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / limit);

  return (
    <div style={{ background: '#F5F5F3', minHeight: 'calc(100vh - 100px)', padding: '2rem 0' }}>
      <div className="container">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="d-flex justify-content-between align-items-start mb-4">
          <div>
            <div className="d-inline-flex align-items-center gap-2 mb-2 px-3 py-1"
                 style={{ background: '#fee2e2', borderRadius: '20px', fontSize: '13px', color: '#dc2626' }}>
              <FiShield size={14} />
              <span>Admin only</span>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 300, color: '#7a8567', letterSpacing: '-0.5px', marginBottom: 0 }}>
              User Management
            </h1>
            <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
              {total} total users · promote, demote, or manage roles
            </p>
          </div>
        </div>

        {/* ── How to bootstrap admin note ─────────────────────────────────── */}
        <Alert variant="info" className="mb-4" style={{ borderRadius: '12px', fontSize: '0.875rem' }}>
          <strong>Bootstrapping admins:</strong> Add email addresses to the{' '}
          <code>ADMIN_EMAILS</code> environment variable (comma-separated) in Vercel.
          Those users will be promoted to <Badge bg="danger">admin</Badge> automatically on their next login.
        </Alert>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="d-flex gap-3 mb-4 flex-wrap">
          <InputGroup style={{ maxWidth: 320 }}>
            <InputGroup.Text style={{ background: '#fff', border: '1px solid #dee2e6' }}>
              <FiSearch size={14} />
            </InputGroup.Text>
            <Form.Control
              placeholder="Search name or email…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              style={{ border: '1px solid #dee2e6' }}
            />
          </InputGroup>

          <InputGroup style={{ maxWidth: 200 }}>
            <InputGroup.Text style={{ background: '#fff', border: '1px solid #dee2e6' }}>
              <FiFilter size={14} />
            </InputGroup.Text>
            <Form.Select
              value={roleFilter}
              onChange={e => { setRoleFilter(e.target.value as DBRole | ''); setPage(0); }}
              style={{ border: '1px solid #dee2e6' }}
            >
              <option value="">All roles</option>
              {ALL_ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Form.Select>
          </InputGroup>

          {(search || roleFilter) && (
            <Button variant="outline-secondary" size="sm" style={{ borderRadius: '8px' }}
                    onClick={() => { setSearch(''); setRoleFilter(''); setPage(0); }}>
              Clear
            </Button>
          )}
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="text-center py-5"><Spinner animation="border" style={{ color: '#7a8567' }} /></div>
        ) : error ? (
          <Alert variant="warning" style={{ borderRadius: '12px' }}>Could not load users.</Alert>
        ) : (
          <Card style={{ border: '1px solid #E5E5E3', borderRadius: '12px', overflow: 'hidden' }}>
            <Table hover responsive className="mb-0">
              <thead style={{ background: '#f8f9fa', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <tr>
                  <th style={{ padding: '12px 16px' }}>User</th>
                  <th style={{ padding: '12px 16px' }}>Role</th>
                  <th style={{ padding: '12px 16px' }}>Company</th>
                  <th style={{ padding: '12px 16px' }}>Joined</th>
                  <th style={{ padding: '12px 16px' }}>Last seen</th>
                  <th style={{ padding: '12px 16px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-5 text-muted">
                      <FiUsers size={32} style={{ marginBottom: 8, opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
                      No users found
                    </td>
                  </tr>
                ) : users.map(user => (
                  <tr key={user.id} style={{ fontSize: '0.875rem' }}>
                    <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                      <div className="d-flex align-items-center gap-2">
                        {user.avatar_url
                          ? <img src={user.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                          : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#c5df96', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', color: '#7a8567' }}>
                              {(user.full_name ?? user.email)[0].toUpperCase()}
                            </div>
                        }
                        <div>
                          <div style={{ fontWeight: 600, color: '#2D2D2D' }}>{user.full_name ?? '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: '#888' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                      <Badge style={{ background: ROLE_COLORS[user.role], fontSize: '0.72rem', fontWeight: 600 }}>
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#555' }}>
                      {user.company ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#555' }}>
                      {format(new Date(user.created_at), 'MMM d, yyyy')}
                    </td>
                    <td style={{ padding: '12px 16px', verticalAlign: 'middle', color: '#555' }}>
                      {user.last_seen_at
                        ? format(new Date(user.last_seen_at), 'MMM d, yyyy')
                        : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                      <Button
                        size="sm"
                        style={{
                          background: 'linear-gradient(135deg,#7a8567,#c5df96)',
                          border: 'none', borderRadius: '8px',
                          fontSize: '0.75rem', fontWeight: 600, color: '#fff',
                        }}
                        onClick={() => {
                          setConfirmUser(user);
                          setNewRole(user.role === 'admin' ? 'moderator' : user.role);
                        }}
                      >
                        <FiUser className="me-1" />Change Role
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            {/* Pagination */}
            {pages > 1 && (
              <div className="d-flex justify-content-between align-items-center px-4 py-3"
                   style={{ borderTop: '1px solid #E5E5E3', fontSize: '0.875rem', color: '#666' }}>
                <span>
                  Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
                </span>
                <ButtonGroup size="sm">
                  <Button variant="outline-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    ← Prev
                  </Button>
                  <Button variant="outline-secondary" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>
                    Next →
                  </Button>
                </ButtonGroup>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* ── Role-change confirmation modal ─────────────────────────────────── */}
      <Modal show={!!confirmUser} onHide={() => setConfirmUser(null)} centered>
        <Modal.Header closeButton style={{ borderBottom: '1px solid #E5E5E3' }}>
          <Modal.Title style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            Change Role — {confirmUser?.full_name ?? confirmUser?.email}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>
            Current role:{' '}
            <Badge style={{ background: ROLE_COLORS[confirmUser?.role ?? 'entrepreneur'], fontSize: '0.72rem' }}>
              {ROLE_LABELS[confirmUser?.role ?? 'entrepreneur']}
            </Badge>
          </p>
          <Form.Group>
            <Form.Label style={{ fontWeight: 600 }}>New role</Form.Label>
            <Form.Select value={newRole} onChange={e => setNewRole(e.target.value as DBRole)}>
              {ALL_ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Form.Select>
          </Form.Group>
          {newRole === 'admin' && (
            <Alert variant="warning" className="mt-3" style={{ fontSize: '0.8rem', borderRadius: '8px' }}>
              ⚠️ This grants full admin access including user management and moderation.
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer style={{ borderTop: '1px solid #E5E5E3' }}>
          <Button variant="light" onClick={() => setConfirmUser(null)}>Cancel</Button>
          <Button
            disabled={roleMutation.isLoading || newRole === confirmUser?.role}
            style={{ background: '#7a8567', border: 'none', fontWeight: 600 }}
            onClick={() => confirmUser && roleMutation.mutate({ userId: confirmUser.id, role: newRole })}
          >
            {roleMutation.isLoading ? <Spinner size="sm" animation="border" className="me-1" /> : null}
            Confirm
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
