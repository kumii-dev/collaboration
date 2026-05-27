import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Card, Row, Col, Badge, Button, Table, Form, Spinner, Tabs, Tab, Alert } from 'react-bootstrap';
import { FiAlertCircle, FiCheck, FiX, FiEye, FiShield, FiCalendar } from 'react-icons/fi';
import { format } from 'date-fns';
import api from '../../lib/api';
import { eventsApi, CommunityEvent } from '../../lib/eventsApi';

// Never throws — returns '—' for null/invalid dates
const safeFormat = (dateStr: string | null | undefined, fmt: string): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return format(d, fmt);
  } catch {
    return '—';
  }
};

interface Report {
  id: string;
  report_type: 'message' | 'post' | 'user' | 'group' | 'thread';
  reason: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
  notes?: string;
  content_preview?: string;
  content_title?: string;
  reporter?: { id: string; full_name?: string; email: string };
  reported_user?: { id: string; full_name?: string; email: string };
}

interface ModerationAction {
  id: string;
  report_id?: string;
  action_type: 'warn' | 'remove_content' | 'suspend' | 'ban' | 'restore';
  reason: string;
  duration_days?: number;
  expires_at?: string;
  created_at: string;
  moderator?: { id: string; full_name?: string; email: string };
  target_user?: { id: string; full_name?: string; email: string };
}

interface AuditLog {
  id: string;
  event_type: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  created_at: string;
  actor?: { id: string; full_name?: string; email: string };
}

export default function ModerationPage() {
  const [selectedTab, setSelectedTab] = useState<string>('reports');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState({
    action_type: 'warn' as 'warn' | 'remove_content' | 'suspend' | 'ban' | 'restore',
    reason: '',
    ban_duration_days: 7,
    target_user_id: '',
  });
  const queryClient = useQueryClient();

  // Fetch pending reports
  // API returns { reports: [], total, limit, offset } — unwrap defensively
  const { data: reports, isLoading: loadingReports, error: reportsError } = useQuery(
    ['moderation-reports', 'pending'],
    async () => {
      const response = await api.get('/moderation/queue', {
        params: { status: 'pending', limit: 50 }
      });
      const raw = response.data?.data ?? response.data;
      const arr = raw?.reports ?? raw?.data ?? raw;
      return (Array.isArray(arr) ? arr : []) as Report[];
    }
  );

  // Fetch moderation actions history
  const { data: actions, isLoading: loadingActions } = useQuery(
    'moderation-actions',
    async () => {
      const response = await api.get('/moderation/actions', {
        params: { limit: 50 }
      });
      const raw = response.data?.data ?? response.data;
      const arr = raw?.actions ?? raw?.data ?? raw;
      return (Array.isArray(arr) ? arr : []) as ModerationAction[];
    }
  );

  // Fetch audit logs
  const { data: auditLogs, isLoading: loadingAuditLogs } = useQuery(
    'moderation-audit-logs',
    async () => {
      const response = await api.get('/moderation/audit-log', {
        params: { limit: 100 }
      });
      const raw = response.data?.data ?? response.data;
      const arr = raw?.logs ?? raw?.data ?? raw;
      return (Array.isArray(arr) ? arr : []) as AuditLog[];
    }
  );

  // Fetch all upcoming events for feature management (admin)
  const { data: allEvents, isLoading: loadingEvents } = useQuery<CommunityEvent[]>(
    'admin-all-events',
    () => eventsApi.list(),
    { staleTime: 60 * 1000 }
  );

  // Feature toggle mutation
  const featureMutation = useMutation(
    ({ eventId, featured }: { eventId: string; featured: boolean }) =>
      eventsApi.feature(eventId, featured),
    {
      onSuccess: () => queryClient.invalidateQueries('admin-all-events'),
    }
  );

  // Handle moderation action mutation
  const handleActionMutation = useMutation(
    async ({ targetUserId, reportId, actionType, reason, durationDays }: {
      targetUserId: string;
      reportId?: string;
      actionType: string;
      reason: string;
      durationDays?: number;
    }) => {
      const response = await api.post('/moderation/actions', {
        targetUserId,
        reportId: reportId || undefined,
        actionType,
        reason,
        durationDays: durationDays || undefined,
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['moderation-reports']);
        queryClient.invalidateQueries('moderation-actions');
        queryClient.invalidateQueries('moderation-audit-logs');
        setSelectedReportId(null);
        setActionForm({ action_type: 'warn', reason: '', ban_duration_days: 7, target_user_id: '' });
      }
    }
  );

  const handleSubmitAction = () => {
    if (!selectedReportId || !actionForm.reason.trim()) {
      alert('Please select a report and provide a reason');
      return;
    }
    const targetUserId = selectedReport?.reported_user?.id ?? actionForm.target_user_id;
    if (!targetUserId) {
      alert('No target user found for this report');
      return;
    }
    handleActionMutation.mutate({
      targetUserId,
      reportId: selectedReportId,
      actionType: actionForm.action_type,
      reason: actionForm.reason,
      durationDays: actionForm.action_type === 'ban' || actionForm.action_type === 'suspend'
        ? actionForm.ban_duration_days
        : undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: 'warning',
      reviewing: 'info',
      resolved: 'success',
      dismissed: 'secondary'
    };
    return <Badge bg={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const getActionTypeBadge = (actionType: string) => {
    const variants: Record<string, string> = {
      warn:           'warning',
      remove_content: 'danger',
      suspend:        'warning',
      ban:            'danger',
      restore:        'success',
    };
    const icons: Record<string, JSX.Element> = {
      warn:           <FiAlertCircle className="me-1" />,
      remove_content: <FiX className="me-1" />,
      suspend:        <FiShield className="me-1" />,
      ban:            <FiShield className="me-1" />,
      restore:        <FiCheck className="me-1" />,
    };
    return (
      <Badge bg={variants[actionType] || 'secondary'}>
        {icons[actionType]}
        {actionType.replace('_', ' ')}
      </Badge>
    );
  };

  const selectedReport = reports?.find(r => r.id === selectedReportId);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-0">Moderation Dashboard</h2>
          <p className="text-muted mb-0">Manage reports and moderate content</p>
        </div>
        <Badge style={{ background: '#7a8567' }} className="fs-6">
          <FiShield className="me-1" />
          Moderator
        </Badge>
      </div>

      <Tabs
        activeKey={selectedTab}
        onSelect={(k) => setSelectedTab(k || 'reports')}
        className="mb-4"
      >
        {/* Reports Queue Tab */}
        <Tab
          eventKey="reports"
          title={
            <span>
              <FiAlertCircle className="me-1" />
              Reports Queue {reports && `(${reports.length})`}
            </span>
          }
        >
          <Row>
            {/* Reports List */}
            <Col md={selectedReportId ? 6 : 12}>
              {reportsError != null && (
                <Alert variant="danger">
                  Failed to load reports. Please refresh the page.
                </Alert>
              )}
              {loadingReports && (
                <div className="text-center p-5">
                  <Spinner animation="border" />
                </div>
              )}

              {reports && reports.length === 0 && (
                <Alert variant="success">
                  <FiCheck className="me-2" />
                  All caught up! No pending reports.
                </Alert>
              )}

              {reports?.map((report) => (
                <Card
                  key={report.id}
                  className={`mb-3 ${selectedReportId === report.id ? 'border-primary' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedReportId(report.id)}
                >
                  <Card.Body>
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div>
                        <Badge bg="light" text="dark" className="me-2">
                          {report.report_type}
                        </Badge>
                        {getStatusBadge(report.status)}
                      </div>
                      <small className="text-muted">
                        {safeFormat(report.created_at, 'MMM d, HH:mm')}
                      </small>
                    </div>

                    <h6 className="mb-2">Reason: {report.reason}</h6>

                    {report.content_title && (
                      <p className="fw-semibold mb-1" style={{ fontSize: '14px' }}>
                        {report.content_title}
                      </p>
                    )}

                    {report.content_preview && (
                      <div className="bg-light p-2 rounded mb-2">
                        <small className="text-muted d-block mb-1">Content Preview:</small>
                        <p className="mb-0" style={{ fontSize: '13px' }}>
                          {report.content_preview}
                        </p>
                      </div>
                    )}

                    <div className="d-flex justify-content-between align-items-center">
                      <small className="text-muted">
                        Reported by: {report.reporter?.full_name ?? report.reporter?.email ?? '—'}
                      </small>
                      {report.reported_user && (
                        <small className="text-muted">
                          Target: {report.reported_user.full_name ?? report.reported_user.email}
                        </small>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              ))}
            </Col>

            {/* Action Form */}
            {selectedReportId && selectedReport && (
              <Col md={6}>
                <Card className="sticky-top" style={{ top: '20px' }}>
                  <Card.Header>
                    <h5 className="mb-0">Take Action</h5>
                  </Card.Header>
                  <Card.Body>
                    <div className="mb-3">
                      <strong>Report Details</strong>
                      <div className="mt-2">
                        <div className="mb-1">
                          <small className="text-muted">Type:</small>{' '}
                          <Badge bg="light" text="dark">
                            {selectedReport.report_type}
                          </Badge>
                        </div>
                        <div className="mb-1">
                          <small className="text-muted">Reason:</small>{' '}
                          {selectedReport.reason}
                        </div>
                        {selectedReport.reported_user && (
                          <div className="mb-1">
                            <small className="text-muted">Target User:</small>{' '}
                            {selectedReport.reported_user.full_name ?? selectedReport.reported_user.email}
                          </div>
                        )}
                      </div>
                    </div>

                    <hr />

                    <Form>
                      <Form.Group className="mb-3">
                        <Form.Label>Action Type</Form.Label>
                        <Form.Select
                          value={actionForm.action_type}
                          onChange={(e) =>
                            setActionForm({
                              ...actionForm,
                              action_type: e.target.value as any
                            })
                          }
                        >
                          <option value="warn">Issue Warning</option>
                          <option value="remove_content">Remove Content</option>
                          <option value="suspend">Suspend User</option>
                          <option value="ban">Ban User</option>
                          <option value="restore">Restore / Unban</option>
                        </Form.Select>
                      </Form.Group>

                      {(actionForm.action_type === 'ban' || actionForm.action_type === 'suspend') && (
                        <Form.Group className="mb-3">
                          <Form.Label>Ban Duration (days)</Form.Label>
                          <Form.Control
                            type="number"
                            value={actionForm.ban_duration_days}
                            onChange={(e) =>
                              setActionForm({
                                ...actionForm,
                                ban_duration_days: parseInt(e.target.value)
                              })
                            }
                            min="1"
                            max="365"
                          />
                          <Form.Text>Leave blank for permanent ban</Form.Text>
                        </Form.Group>
                      )}

                      <Form.Group className="mb-3">
                        <Form.Label>Reason / Notes *</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          value={actionForm.reason}
                          onChange={(e) =>
                            setActionForm({ ...actionForm, reason: e.target.value })
                          }
                          placeholder="Explain your decision..."
                        />
                      </Form.Group>

                      <div className="d-flex gap-2">
                        <Button
                          style={{ background: '#7a8567', borderColor: '#7a8567', color: 'white' }}
                          onClick={handleSubmitAction}
                          disabled={handleActionMutation.isLoading || !actionForm.reason.trim()}
                        >
                          {handleActionMutation.isLoading ? (
                            <>
                              <Spinner animation="border" size="sm" className="me-2" />
                              Processing...
                            </>
                          ) : (
                            'Submit Action'
                          )}
                        </Button>
                        <Button
                          variant="outline-secondary"
                          onClick={() => setSelectedReportId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </Form>
                  </Card.Body>
                </Card>
              </Col>
            )}
          </Row>
        </Tab>

        {/* Action History Tab */}
        <Tab eventKey="history" title="Action History">
          {loadingActions && (
            <div className="text-center p-5">
              <Spinner animation="border" />
            </div>
          )}

          <Card>
            <Table hover responsive>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Moderator</th>
                  <th>Target User</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {actions?.map((action) => (
                  <tr key={action.id}>
                    <td>{safeFormat(action.created_at, 'MMM d, yyyy HH:mm')}</td>
                    <td>{getActionTypeBadge(action.action_type)}</td>
                    <td>{action.moderator?.full_name ?? action.moderator?.email ?? '—'}</td>
                    <td>{action.target_user?.full_name ?? action.target_user?.email ?? '—'}</td>
                    <td>
                      <small className="text-muted">{action.reason}</small>
                    </td>
                    <td>
                      <Button variant="link" size="sm">
                        <FiEye />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {actions && actions.length === 0 && (
            <Alert variant="info">No moderation actions yet.</Alert>
          )}
        </Tab>

        {/* Audit Log Tab */}
        <Tab eventKey="audit" title="Audit Log">
          {loadingAuditLogs && (
            <div className="text-center p-5">
              <Spinner animation="border" />
            </div>
          )}

          <Card>
            <Table hover responsive className="mb-0">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Moderator</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs?.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <small>{safeFormat(log.created_at, 'MMM d, yyyy HH:mm:ss')}</small>
                    </td>
                    <td>{log.actor?.full_name ?? log.actor?.email ?? '—'}</td>
                    <td>
                      <Badge bg="light" text="dark">
                        {log.event_type}
                      </Badge>
                    </td>
                    <td>
                      <small>
                        {log.resource_type ?? '—'}
                        {log.resource_id ? `: ${log.resource_id.slice(0, 8)}…` : ''}
                      </small>
                    </td>
                    <td>
                      <small className="text-muted">
                        {log.details ? JSON.stringify(log.details).slice(0, 80) : '—'}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {auditLogs && auditLogs.length === 0 && (
            <Alert variant="info">No audit logs available.</Alert>
          )}
        </Tab>

        {/* ── Events Feature Management Tab ────────────────────────────────── */}
        <Tab eventKey="events" title={<><FiCalendar className="me-1" />Events</>}>
          <Card style={{ border: '1px solid #E5E5E3', borderRadius: '0 0 12px 12px' }}>
            <Card.Body>
              <h5 className="mb-1" style={{ fontWeight: 700 }}>Event Feature Management</h5>
              <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>
                Toggle the <strong>⭐ Featured</strong> tag on upcoming events. Featured events appear on the Communities landing page.
              </p>
              {loadingEvents ? (
                <div className="text-center py-4"><Spinner animation="border" /></div>
              ) : allEvents && allEvents.length > 0 ? (
                <Table hover responsive className="mb-0">
                  <thead style={{ background: '#f8f9fa' }}>
                    <tr>
                      <th>Event</th>
                      <th>Date</th>
                      <th>Category</th>
                      <th className="text-center">Featured</th>
                      <th className="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allEvents.map((event) => (
                      <tr key={event.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{event.title}</div>
                          {event.is_cancelled && <Badge bg="secondary" className="ms-1">Cancelled</Badge>}
                        </td>
                        <td style={{ fontSize: '0.875rem', color: '#555' }}>
                          {safeFormat(event.starts_at, 'MMM d, yyyy HH:mm')}
                        </td>
                        <td style={{ fontSize: '0.875rem' }}>
                          {event.forum_categories?.name ?? '—'}
                        </td>
                        <td className="text-center">
                          {event.is_featured
                            ? <Badge style={{ background: 'linear-gradient(135deg,#7a8567,#c5df96)' }}>⭐ Featured</Badge>
                            : <Badge bg="light" text="secondary">—</Badge>}
                        </td>
                        <td className="text-center">
                          <Button
                            size="sm"
                            disabled={featureMutation.isLoading}
                            style={{
                              borderRadius: '20px',
                              background: event.is_featured ? '#E5E5E3' : 'linear-gradient(135deg,#7a8567,#c5df96)',
                              border: 'none',
                              color: event.is_featured ? '#555' : '#fff',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              padding: '4px 14px',
                            }}
                            onClick={() => featureMutation.mutate({ eventId: event.id, featured: !event.is_featured })}
                          >
                            {event.is_featured ? 'Unfeature' : '⭐ Feature'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <Alert variant="info">No upcoming events found.</Alert>
              )}
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>
    </div>
  );
}
