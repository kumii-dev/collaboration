# Kumii Collaboration Module

A full-stack Chat & Forum based business networking platform built with modern web technologies, ISO 27001-aligned security controls, and POPIA-aware data handling.

## 🎯 Overview

The Kumii Collaboration Module enables:
- **Private 1:1 Chat** with realtime messaging, read receipts, reactions, and file attachments
- **Group Chat** with role-based permissions (owner/moderator/member)
- **Forums** with categories, boards, threads, and nested replies
- **Moderation System** with reports queue, reputation scoring, and content moderation
- **Notifications** (in-app + email via Resend)
- **Role-based Access Control** (entrepreneur, funder, advisor, moderator, admin)

## 🏗️ Architecture

```
/collaboration
├── apps/
│   ├── api/                 # Node.js + Express backend
│   │   ├── src/
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── middleware/  # Auth, validation, error handling
│   │   │   ├── services/    # Email, notifications
│   │   │   └── utils/       # Helpers
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                 # React + Vite frontend
│       ├── src/
│       │   ├── components/  # Reusable UI components
│       │   ├── pages/       # Route pages
│       │   ├── hooks/       # Custom React hooks
│       │   ├── lib/         # Supabase, API clients
│       │   └── styles/      # CSS files
│       ├── package.json
│       └── vite.config.ts
├── packages/
│   └── db/
│       ├── migrations/      # SQL migrations with RLS
│       ├── seeds/           # Demo data
│       └── types/           # TypeScript types
└── docs/                    # Documentation
```

## 🚀 Tech Stack

### Frontend
- **React 18** + **TypeScript**
- **Vite** (build tool)
- **Bootstrap 5** (UI framework)
- **React Router** (routing)
- **React Query** (data fetching)
- **Supabase Client** (auth + realtime)

### Backend
- **Node.js** + **Express**
- **TypeScript**
- **Supabase** (Postgres + Auth + Realtime + Storage + RLS)
- **Zod** (validation)
- **Resend** (transactional email)
- **Winston** (logging)

### Database
- **PostgreSQL** (via Supabase)
- **Row Level Security (RLS)** on all tables
- Full audit logging
- Soft deletes with archive flags

### Hosting
- **Vercel** (frontend + backend)
- **Supabase** (database + auth + storage)

## 📋 Prerequisites

- **Node.js** 18+ and npm/yarn/pnpm
- **Supabase account** (free tier works)
- **Resend account** (for email)
- **Git**

## 🛠️ Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd collaboration
```

### 2. Database Setup (Supabase)

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** in the Supabase dashboard
3. Run the migrations in order:
   ```sql
   -- Copy and paste packages/db/migrations/001_initial_schema.sql
   -- Then run packages/db/migrations/002_rls_policies.sql
   ```
4. Create a storage bucket for attachments:
   - Go to **Storage** → **Create a new bucket**
   - Name: `collaboration-attachments`
   - Public: `false`
   - Set RLS policies for the bucket

5. (Optional) Run seed data:
   ```sql
   -- Copy and paste packages/db/seeds/001_demo_data.sql
   ```

### 3. Backend Setup

```bash
cd apps/api
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your credentials:
# - SUPABASE_URL
# - SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY (from Supabase Settings → API)
# - RESEND_API_KEY (from resend.com)
# - JWT_SECRET (generate: openssl rand -base64 32)
# - SESSION_SECRET (generate: openssl rand -base64 32)

# Start development server
npm run dev
```

The API will run on `http://localhost:3001`

### 4. Frontend Setup

```bash
cd apps/web
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your credentials:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - VITE_API_URL=http://localhost:3001/api

# Start development server
npm run dev
```

The web app will run on `http://localhost:5173`

### 5. Create Your First User

1. Navigate to `http://localhost:5173/login`
2. Sign up with email/password or use magic link
3. The profile will be auto-created in the `profiles` table
4. (Optional) Manually set your role to `admin` in the database to access moderation features:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
   ```

## 📝 Environment Variables

### Backend (apps/api/.env)
```bash
NODE_ENV=development
PORT=3001
API_URL=http://localhost:3001

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

JWT_SECRET=<32+ character secret>
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@kumii.com

CORS_ORIGIN=http://localhost:5173
SESSION_SECRET=<32+ character secret>
```

### Frontend (apps/web/.env)
```bash
VITE_API_URL=http://localhost:3001/api
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...
VITE_APP_NAME=Kumii Collaboration
```

## 🔐 Security Features

- **Row Level Security (RLS)** enforced on all tables
- **JWT-based authentication** via Supabase
- **Role-based access control** (RBAC)
- **Input validation** with Zod schemas
- **XSS prevention** with HTML sanitization
- **CSRF protection** via same-origin policy
- **Rate limiting** on API endpoints
- **Audit logging** for security-relevant events
- **Helmet.js** security headers
- **CORS** with explicit origin whitelisting

## 📊 Database Schema

Key tables:
- `profiles` - User profiles with roles
- `conversations` & `conversation_participants` - Chat conversations
- `messages`, `message_reads`, `message_reactions` - Chat messages
- `groups` & `group_members` - Group chats
- `forum_categories`, `forum_boards`, `forum_threads`, `forum_posts` - Forum structure
- `forum_votes` - Upvotes/downvotes
- `reports` & `moderation_actions` - Moderation system
- `notifications` - In-app notifications
- `audit_logs` - Security audit trail
- `attachments` - File metadata

All tables have:
- UUID primary keys
- `created_at` timestamps
- `archived` boolean for soft deletes
- Full RLS policies

## 🧪 Testing

```bash
# Backend tests
cd apps/api
npm test

# Frontend tests
cd apps/web
npm test
```

## 🚢 Deployment

### Deploy to Vercel

1. **Backend API:**
   ```bash
   cd apps/api
   vercel --prod
   ```
   - Set all environment variables in Vercel dashboard
   - Update CORS_ORIGIN to your frontend URL

2. **Frontend Web:**
   ```bash
   cd apps/web
   vercel --prod
   ```
   - Set all VITE_* environment variables
   - Update VITE_API_URL to your backend URL

3. **Database migrations:**
   - Already applied during setup
   - For future changes, run migrations via Supabase SQL Editor

## 📚 API Documentation

### Authentication
All API endpoints (except `/health`) require authentication via Bearer token in the `Authorization` header.

Get token after login:
```typescript
const { data: { session } } = await supabase.auth.getSession();
const token = session.access_token;
```

### Endpoints

#### Chat
- `GET /api/chat/conversations` - List conversations
- `POST /api/chat/conversations` - Create conversation
- `GET /api/chat/conversations/:id/messages` - Get messages
- `POST /api/chat/conversations/:id/messages` - Send message
- `PATCH /api/chat/messages/:id` - Edit message
- `DELETE /api/chat/messages/:id` - Delete message
- `POST /api/chat/messages/:id/read` - Mark as read
- `POST /api/chat/messages/:id/reactions` - Add reaction

#### Forum
- `GET /api/forum/categories` - List categories with boards
- `GET /api/forum/boards/:id/threads` - List threads in board
- `GET /api/forum/threads/:id` - Get thread with posts
- `POST /api/forum/threads` - Create thread
- `POST /api/forum/posts` - Create post (reply)
- `POST /api/forum/threads/:id/vote` - Vote on thread
- `POST /api/forum/posts/:id/vote` - Vote on post

#### Moderation (requires moderator/admin role)
- `GET /api/moderation/queue` - Get pending reports
- `POST /api/moderation/reports` - Create report
- `POST /api/moderation/actions` - Take moderation action

#### Notifications
- `GET /api/notifications` - List notifications
- `PATCH /api/notifications/:id/read` - Mark as read
- `POST /api/notifications/mark-all-read` - Mark all as read

### Response Format
All responses follow this structure:
```json
{
  "success": true|false,
  "data": { ... },
  "error": "error message" // only if success = false
}
```

## 🔄 Realtime Features

The app uses Supabase Realtime for live updates:

```typescript
// Subscribe to new messages in a conversation
const channel = supabase
  .channel(`conversation:${conversationId}`)
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => {
      // Handle new message
    }
  )
  .subscribe();
```

## 🛡️ Compliance & Governance

- **ISO 27001 aligned** security controls
- **POPIA-aware** data handling (South African data protection)
- **TOGAF ADM Phase H** change management
- **Audit logging** for all security-relevant events
- **Data retention** policies (configurable)
- **User consent** flags for data processing

## 🐛 Troubleshooting

### Database Connection Issues
- Verify Supabase URL and keys in `.env`
- Check if your IP is allowed in Supabase (Settings → Database → Connection Pooling)

### RLS Policy Errors
- Ensure migrations are applied in correct order
- Check if service role key is being used for admin operations

### Email Not Sending
- Verify Resend API key
- Check Resend dashboard for error logs
- Ensure FROM email is verified in Resend

### CORS Errors
- Update CORS_ORIGIN in backend `.env` to match frontend URL
- For production, use exact domain (no wildcards)

## 📖 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Express.js Guide](https://expressjs.com/)
- [Resend Documentation](https://resend.com/docs)
- [Vercel Deployment](https://vercel.com/docs)

## 📄 License

PROPRIETARY - Kumii Platform

## 👥 Support

For issues or questions, please contact the Kumii development team.

---

**Built with ❤️ for the Kumii Platform**
