import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Badge, Button, ListGroup, Spinner, Alert, Tabs, Tab } from 'react-bootstrap';
import { FiBell, FiCheck, FiCheckCircle, FiX, FiMessageSquare, FiThumbsUp, FiAlertCircle } from 'react-icons/fi';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';

interface Notification {
  id: string;
  type: 'mention' | 'reply' | 'vote' | 'message' | 'system';
  title: string;
  message: string;
  link?: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
}

export default function NotificationsPage() {
  const [selectedTab, setSelectedTab] = useState('all');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch all notifications
  const { data: notifications, isLoading } = useQuery(
    ['notifications', selectedTab],
    async () => {
      const params: any = { limit: 50 };
      if (selectedTab === 'unread') {
        params.unread_only = true;
      }
      const response = await api.get('/notifications', { params });
      return response.data.data as Notification[];
    }
  );

  // Mark as read mutation
  const markAsReadMutation = useMutation(
    async (notificationId: string) => {
      await api.patch(`/notifications/${notificationId}`, { is_read: true });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('notifications');
      }
    }
  );

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation(
    async () => {
      await api.post('/notifications/mark-all-read');
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('notifications');
      }
    }
  );

  // Delete notification mutation
  const deleteNotificationMutation = useMutation(
    async (notificationId: string) => {
      await api.delete(`/notifications/${notificationId}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('notifications');
      }
    }
  );

  const getNotificationIcon = (type: string) => {
    const icons: Record<string, JSX.Element> = {
      mention: <FiMessageSquare className="text-primary" />,
      reply: <FiMessageSquare className="text-info" />,
      vote: <FiThumbsUp className="text-success" />,
      message: <FiBell className="text-warning" />,
      system: <FiAlertCircle className="text-danger" />
    };
    return icons[type] || <FiBell />;
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-0">Notifications</h2>
          {unreadCount > 0 && (
            <p className="text-muted mb-0">
              You have {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isLoading}
          >
            <FiCheckCircle className="me-1" />
            Mark All as Read
          </Button>
        )}
      </div>

      <Tabs
        activeKey={selectedTab}
        onSelect={(k) => setSelectedTab(k || 'all')}
        className="mb-4"
      >
        <Tab
          eventKey="all"
          title={
            <span>
              <FiBell className="me-1" /> All Notifications
            </span>
          }
        >
          {isLoading && (
            <div className="text-center p-5">
              <Spinner animation="border" />
            </div>
          )}

          {notifications && notifications.length === 0 && (
            <Alert variant="info">
              <FiBell size={48} className="d-block mx-auto mb-3" />
              <p className="text-center mb-0">No notifications yet</p>
            </Alert>
          )}

          <ListGroup>
            {notifications?.map((notification) => (
              <ListGroup.Item
                key={notification.id}
                action
                className={`notification-item ${!notification.is_read ? 'bg-light' : ''}`}
                onClick={() => handleNotificationClick(notification)}
                style={{ cursor: 'pointer' }}
              >
                <div className="d-flex align-items-start gap-3">
                  <div className="mt-1 fs-4">
                    {getNotificationIcon(notification.type)}
                  </div>

                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-start mb-1">
                      <div className="flex-grow-1">
                        <h6 className="mb-1">
                          {notification.title}
                          {!notification.is_read && (
                            <Badge bg="primary" className="ms-2">
                              New
                            </Badge>
                          )}
                        </h6>
                        <p className="text-muted mb-1" style={{ fontSize: '14px' }}>
                          {notification.message}
                        </p>
                        {notification.sender_name && (
                          <small className="text-muted">
                            from <strong>{notification.sender_name}</strong>
                          </small>
                        )}
                      </div>
                      <div className="d-flex flex-column align-items-end gap-2">
                        <small className="text-muted text-nowrap">
                          {format(new Date(notification.created_at), 'MMM d, HH:mm')}
                        </small>
                        <div className="d-flex gap-1">
                          {!notification.is_read && (
                            <Button
                              variant="link"
                              size="sm"
                              className="p-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsReadMutation.mutate(notification.id);
                              }}
                              title="Mark as read"
                            >
                              <FiCheck />
                            </Button>
                          )}
                          <Button
                            variant="link"
                            size="sm"
                            className="p-1 text-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotificationMutation.mutate(notification.id);
                            }}
                            title="Delete"
                          >
                            <FiX />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Tab>

        <Tab
          eventKey="unread"
          title={
            <span>
              <FiBell className="me-1" /> Unread {unreadCount > 0 && `(${unreadCount})`}
            </span>
          }
        >
          {isLoading && (
            <div className="text-center p-5">
              <Spinner animation="border" />
            </div>
          )}

          {notifications && notifications.length === 0 && (
            <Alert variant="success">
              <FiCheckCircle size={48} className="d-block mx-auto mb-3" />
              <p className="text-center mb-0">All caught up! No unread notifications.</p>
            </Alert>
          )}

          <ListGroup>
            {notifications?.map((notification) => (
              <ListGroup.Item
                key={notification.id}
                action
                className="notification-item bg-light"
                onClick={() => handleNotificationClick(notification)}
                style={{ cursor: 'pointer' }}
              >
                <div className="d-flex align-items-start gap-3">
                  <div className="mt-1 fs-4">
                    {getNotificationIcon(notification.type)}
                  </div>

                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-start mb-1">
                      <div className="flex-grow-1">
                        <h6 className="mb-1">
                          {notification.title}
                          <Badge bg="primary" className="ms-2">
                            New
                          </Badge>
                        </h6>
                        <p className="text-muted mb-1" style={{ fontSize: '14px' }}>
                          {notification.message}
                        </p>
                        {notification.sender_name && (
                          <small className="text-muted">
                            from <strong>{notification.sender_name}</strong>
                          </small>
                        )}
                      </div>
                      <div className="d-flex flex-column align-items-end gap-2">
                        <small className="text-muted text-nowrap">
                          {format(new Date(notification.created_at), 'MMM d, HH:mm')}
                        </small>
                        <div className="d-flex gap-1">
                          <Button
                            variant="link"
                            size="sm"
                            className="p-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsReadMutation.mutate(notification.id);
                            }}
                            title="Mark as read"
                          >
                            <FiCheck />
                          </Button>
                          <Button
                            variant="link"
                            size="sm"
                            className="p-1 text-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotificationMutation.mutate(notification.id);
                            }}
                            title="Delete"
                          >
                            <FiX />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Tab>
      </Tabs>
    </div>
  );
}
