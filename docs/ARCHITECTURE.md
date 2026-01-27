# 🏗️ Architecture Documentation

## System Overview

The Kumii Collaboration Module is a full-stack application built with a three-tier architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT TIER                              │
│  React + Vite + Bootstrap 5 + React Query + Supabase Client    │
│                     (apps/web/)                                  │
└─────────────────┬───────────────────────────────────────────────┘
                  │ HTTP/WebSocket
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION TIER                            │
│     Node.js + Express + TypeScript + Zod + Resend              │
│                     (apps/api/)                                  │
└─────────────────┬───────────────────────────────────────────────┘
                  │ PostgreSQL Protocol
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                         DATA TIER                                │
│  Supabase (PostgreSQL + Auth + Realtime + Storage + RLS)       │
│                  (packages/db/)                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Security Architecture

### Authentication Flow
```
1. User → Frontend: Login credentials
2. Frontend → Supabase Auth: signInWithPassword()
3. Supabase Auth → Frontend: JWT access token
4. Frontend → Backend API: Request with Bearer token
5. Backend → Supabase: Verify token
6. Supabase → Backend: User ID + role
7. Backend: Check RLS policies
8. PostgreSQL: Execute query with user context
9. Backend → Frontend: JSON response
```

### Row Level Security (RLS)

Every table has RLS enabled with policies for:
- **SELECT**: Who can read data
- **INSERT**: Who can create data
- **UPDATE**: Who can modify data
- **DELETE**: Who can remove data

Example: Messages table
```sql
-- Users can only view messages in conversations they're part of
CREATE POLICY "messages_select_participant"
    ON messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants
            WHERE conversation_participants.conversation_id = messages.conversation_id
            AND conversation_participants.user_id = auth.uid()
        )
    );
```

### RBAC (Role-Based Access Control)

Five roles with escalating permissions:

1. **entrepreneur** (default)
   - Create conversations, posts, threads
   - Join public forums
   - Vote and comment

2. **funder** (verified)
   - All entrepreneur permissions
   - Access private investor boards
   - Verified badge displayed

3. **advisor** (verified)
   - All entrepreneur permissions
   - Access advisor-only boards
   - Offer mentorship

4. **moderator**
   - All above permissions
   - Access moderation queue
   - Take moderation actions
   - View reports

5. **admin**
   - All system permissions
   - Manage categories/boards
   - Assign roles
   - View audit logs

## Data Flow Patterns

### 1. Realtime Chat Messages

```
User A sends message:
  Frontend A → API → Database → Trigger → Realtime broadcast
                                              ↓
                                        Frontend B receives
```

Implementation:
```typescript
// Subscribe to realtime updates
const channel = supabase
  .channel(`conversation:${id}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `conversation_id=eq.${id}`
  }, (payload) => {
    setMessages(prev => [...prev, payload.new]);
  })
  .subscribe();
```

### 2. Mention Notifications

```
User posts with @mention:
  1. API extracts mentions from content
  2. Creates in-app notification (async)
  3. Sends email via Resend (async, with retry)
  4. Returns success to user immediately
```

Implementation:
```typescript
// Non-blocking notification dispatch
setImmediate(async () => {
  for (const user of mentionedUsers) {
    await createNotification(user.id, content);
    await sendMentionEmail(user.email, content);
  }
});
```

### 3. Forum Voting & Reputation

```
User upvotes post:
  1. Insert vote record
  2. Database trigger calculates reputation
  3. Update author's reputation_score
  4. Broadcast reputation change (realtime)
```

Database trigger:
```sql
CREATE TRIGGER trigger_forum_vote_reputation
    AFTER INSERT ON forum_votes
    FOR EACH ROW
    EXECUTE FUNCTION handle_forum_vote_reputation();
```

## Database Schema Design

### Entity Relationships

```
profiles ──┬── conversations (creator)
           ├── messages (sender)
           ├── forum_threads (author)
           ├── forum_posts (author)
           ├── reports (reporter)
           └── moderation_actions (moderator)

conversations ──┬── conversation_participants
                └── messages ──┬── message_reads
                               ├── message_reactions
                               └── attachments

forum_categories → forum_boards → forum_threads → forum_posts
                                       ↓              ↓
                                   forum_votes    forum_votes
```

### Indexing Strategy

Performance-critical indexes:
```sql
-- Conversation list query
CREATE INDEX idx_conv_participants_user 
    ON conversation_participants(user_id, left_at);

-- Message thread query
CREATE INDEX idx_messages_conversation 
    ON messages(conversation_id, created_at DESC);

-- Forum threads list
CREATE INDEX idx_forum_threads_board 
    ON forum_threads(board_id, last_post_at DESC);

-- Unread notifications
CREATE INDEX idx_notifications_unread 
    ON notifications(user_id, read) WHERE read = FALSE;
```

### Soft Delete Pattern

All user-generated content uses soft deletes:
```sql
deleted BOOLEAN DEFAULT FALSE,
deleted_at TIMESTAMPTZ,
archived BOOLEAN DEFAULT FALSE
```

Benefits:
- Data recovery possible
- Audit trail maintained
- Compliance with data retention policies
- Can be hard-deleted after retention period

## API Design

### RESTful Endpoints

Convention: `/api/{resource}/{action}`

Example: Chat endpoints
```
GET    /api/chat/conversations          # List
POST   /api/chat/conversations          # Create
GET    /api/chat/conversations/:id/messages  # Read
POST   /api/chat/conversations/:id/messages  # Create
PATCH  /api/chat/messages/:id           # Update
DELETE /api/chat/messages/:id           # Delete
```

### Request/Response Format

All responses follow consistent envelope:
```json
{
  "success": true | false,
  "data": { ... },       // On success
  "error": "message"     // On failure
}
```

### Error Handling

Error hierarchy:
```
ValidationError (400) → Input failed schema validation
AuthError (401) → Missing/invalid token
ForbiddenError (403) → Insufficient permissions
NotFoundError (404) → Resource doesn't exist
ServerError (500) → Unexpected server error
```

## Performance Optimization

### Frontend

1. **Code Splitting**: Routes lazy-loaded
   ```typescript
   const ChatPage = lazy(() => import('./pages/Chat/ChatPage'));
   ```

2. **Query Caching**: React Query caches API responses
   ```typescript
   staleTime: 30000, // 30 seconds
   cacheTime: 300000 // 5 minutes
   ```

3. **Debouncing**: User input debounced (typing indicators, search)
   ```typescript
   const debouncedSearch = useMemo(
     () => debounce(handleSearch, 500),
     []
   );
   ```

### Backend

1. **Connection Pooling**: Supabase manages connection pool
2. **Query Optimization**: 
   - Select only needed columns
   - Use pagination (`limit`/`offset`)
   - Avoid N+1 queries with joins

3. **Rate Limiting**: 
   ```typescript
   windowMs: 15 * 60 * 1000, // 15 minutes
   max: 100 // requests per window
   ```

### Database

1. **Indexes**: All foreign keys and frequent query columns
2. **Materialized Views**: For complex aggregations
3. **Partial Indexes**: For filtered queries
   ```sql
   CREATE INDEX idx_unread_notifications 
   ON notifications(user_id) WHERE read = FALSE;
   ```

## Deployment Architecture

### Production Setup (Vercel + Supabase)

```
┌─────────────────────────────────────────┐
│          Vercel Edge Network             │
│  ┌─────────────┐    ┌─────────────┐    │
│  │   Frontend  │    │     API     │    │
│  │   (Static)  │    │ (Serverless)│    │
│  └─────────────┘    └─────────────┘    │
└─────────────────────────────────────────┘
           │                    │
           ↓                    ↓
┌─────────────────────────────────────────┐
│         Supabase Infrastructure          │
│  ┌──────────┐  ┌────────┐  ┌─────────┐ │
│  │PostgreSQL│  │ Storage│  │Realtime │ │
│  └──────────┘  └────────┘  └─────────┘ │
└─────────────────────────────────────────┘
```

### Environment Separation

Three environments:
1. **Development**: Local (localhost:3001, localhost:5173)
2. **Staging**: Vercel preview deployments
3. **Production**: Vercel production deployment

Each has separate:
- Supabase project
- Environment variables
- Database (can share with different schemas)

## Security Checklist

### ISO 27001 Alignment

- ✅ **Access Control**: RLS + RBAC
- ✅ **Audit Logging**: All security events logged
- ✅ **Data Encryption**: TLS in transit, encrypted at rest
- ✅ **Input Validation**: Zod schemas on all inputs
- ✅ **Output Encoding**: HTML sanitization
- ✅ **Session Management**: JWT with expiry
- ✅ **Error Handling**: No sensitive info in errors
- ✅ **Rate Limiting**: Prevents abuse
- ✅ **CORS**: Strict origin whitelist
- ✅ **Helmet**: Security headers

### POPIA Compliance (South Africa)

- ✅ **Consent**: `consent_data_processing` flag
- ✅ **Purpose**: Data used only for platform functions
- ✅ **Minimization**: Only necessary data collected
- ✅ **Retention**: Soft delete + configurable retention
- ✅ **Access Rights**: Users can view/edit profile
- ✅ **Data Portability**: Export functionality
- ✅ **Breach Notification**: Audit logs enable detection

## Monitoring & Observability

### Application Logs

Winston logger with levels:
- `error`: System errors, exceptions
- `warn`: Authentication failures, suspicious activity
- `info`: Major operations (user signup, role changes)
- `debug`: Detailed operation flow

### Database Metrics

Monitor in Supabase dashboard:
- Query performance
- Connection pool usage
- Storage usage
- Realtime connections

### Audit Trail

All security-relevant events in `audit_logs`:
```sql
- login/logout
- role_change
- data_access (sensitive tables)
- moderation_action
- content_delete
```

## Scaling Considerations

### Current Limits (Supabase Free Tier)
- 500 MB database
- 1 GB file storage
- 2 GB bandwidth/month
- 50,000 monthly active users

### Scale Up Path

1. **0-1K users**: Current setup sufficient
2. **1K-10K users**: 
   - Upgrade Supabase to Pro ($25/mo)
   - Add CDN for assets
3. **10K-100K users**:
   - Database read replicas
   - Redis cache layer
   - Queue for email sending
4. **100K+ users**:
   - Dedicated Postgres instance
   - Microservices architecture
   - Kubernetes orchestration

## Testing Strategy

### Unit Tests
- Services (email, helpers)
- Utilities (sanitization, validation)
- Database functions

### Integration Tests
- API endpoints
- RLS policies
- Database triggers

### E2E Tests
- Critical user flows:
  - Sign up → Login → Send message
  - Create thread → Reply → Vote
  - Report content → Moderate

### Security Tests
- OWASP Top 10 checks
- SQL injection attempts
- XSS attempts
- CSRF protection
- Rate limit verification

---

This architecture is designed for:
- **Security**: Multi-layer defense
- **Scalability**: Horizontal scaling ready
- **Maintainability**: Clear separation of concerns
- **Performance**: Optimized queries and caching
- **Compliance**: ISO 27001 + POPIA aligned
