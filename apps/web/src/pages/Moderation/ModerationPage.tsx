import React from 'react';
import { Card } from 'react-bootstrap';

export default function ModerationPage() {
  return (
    <div>
      <h2 className="mb-4">Moderation Dashboard</h2>
      <Card>
        <Card.Body>
          <p>Moderation interface (requires moderator/admin role):</p>
          <ul>
            <li>Reports queue</li>
            <li>Moderation actions history</li>
            <li>User reputation management</li>
            <li>Content removal tools</li>
            <li>Audit log viewer</li>
          </ul>
          <p className="text-muted">
            Connect to: <code>GET /api/moderation/queue</code>
          </p>
        </Card.Body>
      </Card>
    </div>
  );
}
