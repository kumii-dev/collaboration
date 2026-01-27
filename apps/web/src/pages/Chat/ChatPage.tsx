import React from 'react';
import { Card } from 'react-bootstrap';

export default function ChatPage() {
  return (
    <div>
      <h2 className="mb-4">Chat & Messaging</h2>
      <Card>
        <Card.Body>
          <p>Chat interface will be implemented here with:</p>
          <ul>
            <li>Conversations list</li>
            <li>Message thread view</li>
            <li>Message composer with attachments</li>
            <li>Realtime updates via Supabase Realtime</li>
            <li>Read receipts and reactions</li>
            <li>Typing indicators</li>
          </ul>
          <p className="text-muted">
            Connect to: <code>GET /api/chat/conversations</code>
          </p>
        </Card.Body>
      </Card>
    </div>
  );
}
