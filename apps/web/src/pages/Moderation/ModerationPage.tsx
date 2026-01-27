import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Card, Row, Col, Badge, Button, Table, Form, Spinner, Tabs, Tab, Alert } from 'react-bootstrap';
import { FiAlertCircle, FiCheck, FiX, FiEye, FiShield } from 'react-icons/fi';
import { format } from 'date-fns';
import api from '../../lib/api';

interface Report {
  id: string;
  content_type: 'thread' | 'post' | 'message' | 'user';
  content_id: string;
  reason: string;
  description?: string;
  reporter_name: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
  content_preview?: string;
  reported_user_name?: string;
}

interface ModerationAction {
  id: string;
  report_id: string;
  moderator_name: string;
  action_type: 'warning' | 'content_removal' | 'ban' | 'dismiss';
  reason: string;
  created_at: string;
  target_user_name?: string;
}

interface AuditLog {
  id: string;
  action: string;
  moderator_name: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

export default function ModerationPage() {
  const [selectedTab, setSelectedTab] = useState<string>('reports');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState({
    action_type: 'dismiss' as 'warning' | 'content_removal' | 'ban' | 'dismiss',
    reason: '',
    ban_duration_days: 7
  });
  const queryClient = useQueryClient();

  // Fetch pending reports
  const { data: reports, isLoading: loadingReports } = useQuery(
    ['moderation-reports', 'pending'],
    async () => {
      const response = await api.get('/moderation/queue', {
        params: { status: 'pending' }
      });
      return response.data.data as Report[];
    }
  );

  // Fetch moderation actions history
  const { data: actions, isLoading: loadingActions } = useQuery(
    'moderation-actions',
    async () => {
      const response = await api.get('/moderation/actions', {
        params: { limit: 50 }
      });
      return response.data.data as ModerationAction[];
    }
  );

  // Fetch audit logs
  const { data: auditLogs, isLoading: loadingAuditLogs } = useQuery(
    'moderation-audit-logs',
    async () => {
      const response = await api.get('/moderation/audit-log', {
        params: { limit: 100 }
      });
      return response.data.data as AuditLog[];
    }
  );

  // Handle moderation action mutation
  const handleActionMutation = useMutation(
    async ({ reportId, actionType, reason }: { reportId: string; actionType: string; reason: string }) => {
      const response = await api.post(`/moderation/reports/${reportId}/action`, {
        action_type: actionType,
        reason
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['moderation-reports']);
        queryClient.invalidateQueries('moderation-actions');
        queryClient.invalidateQueries('moderation-audit-logs');
        setSelectedReportId(null);
        setActionForm({ action_type: 'dismiss', reason: '', ban_duration_days: 7 });
      }
    }
  );

  const handleSubmitAction = () => {
    if (!selectedReportId || !actionForm.reason.trim()) {
      alert('Please select a report and provide a reason');
      return;
    }

    handleActionMutation.mutate({
      reportId: selectedReportId,
      actionType: actionForm.action_type,
      reason: actionForm.reason
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
      warning: 'warning',
      content_removal: 'danger',
      ban: 'danger',
      dismiss: 'secondary'
    };
    const icons: Record<string, JSX.Element> = {
      warning: <FiAlertCircle className="me-1" />,
      content_removal: <FiX className="me-1" />,
      ban: <FiShield className="me-1" />,
      dismiss: <FiCheck className="me-1" />
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
        <Badge bg="primary" className="fs-6">
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
                          {report.content_type}
                        </Badge>
                        {getStatusBadge(report.status)}
                      </div>
                      <small className="text-muted">
                        {format(new Date(report.created_at), 'MMM d, HH:mm')}
                      </small>
                    </div>

                    <h6 className="mb-2">Reason: {report.reason}</h6>

                    {report.description && (
                      <p className="text-muted mb-2" style={{ fontSize: '14px' }}>
                        {report.description}
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
                        Reported by: {report.reporter_name}
                      </small>
                      {report.reported_user_name && (
                        <small className="text-muted">
                          Target: {report.reported_user_name}
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
                            {selectedReport.content_type}
                          </Badge>
                        </div>
                        <div className="mb-1">
                          <small className="text-muted">Reason:</small>{' '}
                          {selectedReport.reason}
                        </div>
                        {selectedReport.reported_user_name && (
                          <div className="mb-1">
                            <small className="text-muted">Target User:</small>{' '}
                            {selectedReport.reported_user_name}
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
                          <option value="dismiss">Dismiss Report</option>
                          <option value="warning">Issue Warning</option>
                          <option value="content_removal">Remove Content</option>
                          <option value="ban">Ban User</option>
                        </Form.Select>
                      </Form.Group>

                      {actionForm.action_type === 'ban' && (
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
                          variant="primary"
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
                    <td>{format(new Date(action.created_at), 'MMM d, yyyy HH:mm')}</td>
                    <td>{getActionTypeBadge(action.action_type)}</td>
                    <td>{action.moderator_name}</td>
                    <td>{action.target_user_name || '-'}</td>
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
                      <small>{format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss')}</small>
                    </td>
                    <td>{log.moderator_name}</td>
                    <td>
                      <Badge bg="light" text="dark">
                        {log.action}
                      </Badge>
                    </td>
                    <td>
                      <small>
                        {log.target_type}: {log.target_id.slice(0, 8)}...
                      </small>
                    </td>
                    <td>
                      <small className="text-muted">{log.details}</small>
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
      </Tabs>
    </div>
  );
}
