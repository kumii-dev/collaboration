import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Card, Row, Col, Form, Button, Badge, ListGroup, Spinner, Alert, Tabs, Tab } from 'react-bootstrap';
import { FiEdit2, FiSave, FiX, FiShield, FiAward, FiMail, FiBell, FiLock, FiUser } from 'react-icons/fi';
import { format } from 'date-fns';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  bio?: string;
  role: string;
  is_verified: boolean;
  reputation_score: number;
  created_at: string;
  last_sign_in_at?: string;
}

interface Activity {
  id: string;
  type: 'thread' | 'post' | 'message' | 'vote';
  title: string;
  description: string;
  created_at: string;
}

interface Settings {
  email_notifications: boolean;
  push_notifications: boolean;
  marketing_emails: boolean;
  profile_visibility: 'public' | 'private' | 'contacts';
  show_email: boolean;
  show_online_status: boolean;
}

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTab, setSelectedTab] = useState('profile');
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    bio: '',
    avatar_url: ''
  });
  const [settingsForm, setSettingsForm] = useState<Settings>({
    email_notifications: true,
    push_notifications: true,
    marketing_emails: false,
    profile_visibility: 'public',
    show_email: false,
    show_online_status: true
  });
  const queryClient = useQueryClient();

  // Fetch user profile
  const { data: profile, isLoading: loadingProfile } = useQuery(
    'user-profile',
    async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const response = await api.get(`/users/${user.id}`);
      return response.data.data as UserProfile;
    }
  );

  // Fetch recent activity
  const { data: activities, isLoading: loadingActivities } = useQuery(
    'user-activities',
    async () => {
      const response = await api.get('/users/me/activity', {
        params: { limit: 20 }
      });
      return response.data.data as Activity[];
    }
  );

  // Load settings (mock for now - could be from API)
  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '',
        bio: profile.bio || '',
        avatar_url: profile.avatar_url || ''
      });
    }
  }, [profile]);

  // Update profile mutation
  const updateProfileMutation = useMutation(
    async (data: Partial<UserProfile>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const response = await api.patch(`/users/${user.id}`, data);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('user-profile');
        setIsEditing(false);
      }
    }
  );

  const handleSaveProfile = () => {
    updateProfileMutation.mutate(profileForm);
  };

  const getRoleBadge = (role: string) => {
    const badges: Record<string, { bg: string; icon: JSX.Element }> = {
      admin: { bg: 'danger', icon: <FiShield className="me-1" /> },
      moderator: { bg: 'warning', icon: <FiShield className="me-1" /> },
      entrepreneur: { bg: 'primary', icon: <FiUser className="me-1" /> },
      funder: { bg: 'success', icon: <FiAward className="me-1" /> },
      advisor: { bg: 'info', icon: <FiAward className="me-1" /> },
      user: { bg: 'secondary', icon: <FiUser className="me-1" /> }
    };

    const badge = badges[role] || badges.user;
    return (
      <Badge bg={badge.bg} className="fs-6">
        {badge.icon}
        {role.toUpperCase()}
      </Badge>
    );
  };

  const getActivityIcon = (type: string) => {
    const icons: Record<string, JSX.Element> = {
      thread: <FiMail className="text-primary" />,
      post: <FiMail className="text-info" />,
      message: <FiMail className="text-success" />,
      vote: <FiAward className="text-warning" />
    };
    return icons[type] || <FiMail />;
  };

  if (loadingProfile) {
    return (
      <div className="text-center p-5">
        <Spinner animation="border" />
        <p className="mt-3">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <Alert variant="danger">
        Failed to load profile. Please try again.
      </Alert>
    );
  }

  return (
    <div>
      <Row>
        {/* Profile Header */}
        <Col md={12} className="mb-4">
          <Card>
            <Card.Body>
              <Row className="align-items-center">
                <Col md="auto">
                  <div
                    className="avatar-placeholder"
                    style={{ width: '100px', height: '100px', fontSize: '36px' }}
                  >
                    {profile.full_name?.charAt(0) || profile.email.charAt(0)}
                  </div>
                </Col>
                <Col>
                  <div className="d-flex align-items-center gap-3 mb-2">
                    <h3 className="mb-0">{profile.full_name || 'No name set'}</h3>
                    {getRoleBadge(profile.role)}
                    {profile.is_verified && (
                      <Badge bg="success" className="d-flex align-items-center">
                        <FiShield className="me-1" /> Verified
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted mb-2">{profile.email}</p>
                  <div className="d-flex align-items-center gap-4">
                    <div>
                      <strong className="text-primary fs-4">{profile.reputation_score}</strong>
                      <small className="text-muted ms-1">reputation</small>
                    </div>
                    <div className="vr"></div>
                    <div>
                      <small className="text-muted">
                        Joined {format(new Date(profile.created_at), 'MMMM yyyy')}
                      </small>
                    </div>
                    {profile.last_sign_in_at && (
                      <>
                        <div className="vr"></div>
                        <div>
                          <small className="text-muted">
                            Last active {format(new Date(profile.last_sign_in_at), 'MMM d')}
                          </small>
                        </div>
                      </>
                    )}
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>

        {/* Tabs */}
        <Col md={12}>
          <Tabs
            activeKey={selectedTab}
            onSelect={(k) => setSelectedTab(k || 'profile')}
            className="mb-4"
          >
            {/* Profile Info Tab */}
            <Tab
              eventKey="profile"
              title={
                <span>
                  <FiUser className="me-1" /> Profile Information
                </span>
              }
            >
              <Card>
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">Personal Information</h5>
                  {!isEditing ? (
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                    >
                      <FiEdit2 className="me-1" /> Edit
                    </Button>
                  ) : (
                    <div className="d-flex gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={handleSaveProfile}
                        disabled={updateProfileMutation.isLoading}
                      >
                        {updateProfileMutation.isLoading ? (
                          <Spinner animation="border" size="sm" />
                        ) : (
                          <>
                            <FiSave className="me-1" /> Save
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => {
                          setIsEditing(false);
                          setProfileForm({
                            full_name: profile.full_name || '',
                            bio: profile.bio || '',
                            avatar_url: profile.avatar_url || ''
                          });
                        }}
                      >
                        <FiX className="me-1" /> Cancel
                      </Button>
                    </div>
                  )}
                </Card.Header>
                <Card.Body>
                  <Form>
                    <Form.Group className="mb-3">
                      <Form.Label>Full Name</Form.Label>
                      <Form.Control
                        type="text"
                        value={profileForm.full_name}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, full_name: e.target.value })
                        }
                        disabled={!isEditing}
                        placeholder="Enter your full name"
                      />
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Email Address</Form.Label>
                      <Form.Control
                        type="email"
                        value={profile.email}
                        disabled
                        readOnly
                      />
                      <Form.Text className="text-muted">
                        Email cannot be changed. Contact support if needed.
                      </Form.Text>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Bio</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={4}
                        value={profileForm.bio}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, bio: e.target.value })
                        }
                        disabled={!isEditing}
                        placeholder="Tell us about yourself..."
                      />
                      <Form.Text className="text-muted">
                        {profileForm.bio.length} / 500 characters
                      </Form.Text>
                    </Form.Group>

                    <Form.Group className="mb-3">
                      <Form.Label>Avatar URL</Form.Label>
                      <Form.Control
                        type="url"
                        value={profileForm.avatar_url}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, avatar_url: e.target.value })
                        }
                        disabled={!isEditing}
                        placeholder="https://example.com/avatar.jpg"
                      />
                      <Form.Text className="text-muted">
                        Enter a URL to your profile picture
                      </Form.Text>
                    </Form.Group>

                    <div className="border-top pt-3">
                      <h6 className="text-muted">Account Details</h6>
                      <Row>
                        <Col md={6}>
                          <div className="mb-2">
                            <strong>Role:</strong> {getRoleBadge(profile.role)}
                          </div>
                          <div className="mb-2">
                            <strong>Verification:</strong>{' '}
                            {profile.is_verified ? (
                              <Badge bg="success">Verified</Badge>
                            ) : (
                              <Badge bg="secondary">Not Verified</Badge>
                            )}
                          </div>
                        </Col>
                        <Col md={6}>
                          <div className="mb-2">
                            <strong>Reputation:</strong>{' '}
                            <span className="text-primary">{profile.reputation_score} points</span>
                          </div>
                          <div className="mb-2">
                            <strong>Member Since:</strong>{' '}
                            {format(new Date(profile.created_at), 'MMMM d, yyyy')}
                          </div>
                        </Col>
                      </Row>
                    </div>
                  </Form>
                </Card.Body>
              </Card>
            </Tab>

            {/* Activity Tab */}
            <Tab
              eventKey="activity"
              title={
                <span>
                  <FiBell className="me-1" /> Recent Activity
                </span>
              }
            >
              <Card>
                <Card.Header>
                  <h5 className="mb-0">Recent Activity</h5>
                </Card.Header>
                <ListGroup variant="flush">
                  {loadingActivities && (
                    <ListGroup.Item className="text-center p-4">
                      <Spinner animation="border" size="sm" />
                    </ListGroup.Item>
                  )}

                  {activities && activities.length === 0 && (
                    <ListGroup.Item className="text-center p-4 text-muted">
                      No recent activity
                    </ListGroup.Item>
                  )}

                  {activities?.map((activity) => (
                    <ListGroup.Item key={activity.id}>
                      <div className="d-flex align-items-start gap-3">
                        <div className="mt-1">{getActivityIcon(activity.type)}</div>
                        <div className="flex-grow-1">
                          <div className="d-flex justify-content-between align-items-start">
                            <div>
                              <h6 className="mb-1">{activity.title}</h6>
                              <p className="text-muted mb-0" style={{ fontSize: '14px' }}>
                                {activity.description}
                              </p>
                            </div>
                            <small className="text-muted">
                              {format(new Date(activity.created_at), 'MMM d, HH:mm')}
                            </small>
                          </div>
                        </div>
                      </div>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </Card>
            </Tab>

            {/* Settings Tab */}
            <Tab
              eventKey="settings"
              title={
                <span>
                  <FiLock className="me-1" /> Privacy & Settings
                </span>
              }
            >
              <Card>
                <Card.Header>
                  <h5 className="mb-0">Privacy & Notification Settings</h5>
                </Card.Header>
                <Card.Body>
                  <h6 className="mb-3">Notifications</h6>
                  <Form.Check
                    type="switch"
                    id="email-notifications"
                    label="Email notifications for mentions and replies"
                    checked={settingsForm.email_notifications}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, email_notifications: e.target.checked })
                    }
                    className="mb-2"
                  />
                  <Form.Check
                    type="switch"
                    id="push-notifications"
                    label="Browser push notifications"
                    checked={settingsForm.push_notifications}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, push_notifications: e.target.checked })
                    }
                    className="mb-2"
                  />
                  <Form.Check
                    type="switch"
                    id="marketing-emails"
                    label="Receive marketing and promotional emails"
                    checked={settingsForm.marketing_emails}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, marketing_emails: e.target.checked })
                    }
                    className="mb-4"
                  />

                  <hr />

                  <h6 className="mb-3">Privacy</h6>
                  <Form.Group className="mb-3">
                    <Form.Label>Profile Visibility</Form.Label>
                    <Form.Select
                      value={settingsForm.profile_visibility}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          profile_visibility: e.target.value as any
                        })
                      }
                    >
                      <option value="public">Public - Anyone can view</option>
                      <option value="contacts">Contacts Only</option>
                      <option value="private">Private - Hidden from others</option>
                    </Form.Select>
                  </Form.Group>

                  <Form.Check
                    type="switch"
                    id="show-email"
                    label="Show email address on profile"
                    checked={settingsForm.show_email}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, show_email: e.target.checked })
                    }
                    className="mb-2"
                  />
                  <Form.Check
                    type="switch"
                    id="show-online"
                    label="Show online status to others"
                    checked={settingsForm.show_online_status}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, show_online_status: e.target.checked })
                    }
                    className="mb-4"
                  />

                  <Button variant="primary">
                    <FiSave className="me-1" /> Save Settings
                  </Button>
                </Card.Body>
              </Card>
            </Tab>
          </Tabs>
        </Col>
      </Row>
    </div>
  );
}
