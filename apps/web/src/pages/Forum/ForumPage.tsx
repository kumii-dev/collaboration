import React from 'react';
import { Card } from 'react-bootstrap';

export default function ForumPage() {
  return (
    <div>
      <h2 className="mb-4">Forum & Discussions</h2>
      <Card>
        <Card.Body>
          <p>Forum interface will be implemented here with:</p>
          <ul>
            <li>Categories and boards listing</li>
            <li>Thread list with sorting/filtering</li>
            <li>Thread view with nested replies</li>
            <li>Rich text editor for posts</li>
            <li>Upvote/downvote system</li>
            <li>Tags and mentions</li>
          </ul>
          <p className="text-muted">
            Connect to: <code>GET /api/forum/categories</code>
          </p>
        </Card.Body>
      </Card>
    </div>
  );
}
