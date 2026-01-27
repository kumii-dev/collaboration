# Contributing to Kumii Collaboration Module

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## 🚀 Quick Start for Contributors

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/collaboration.git
   cd collaboration
   ```
3. **Install dependencies**
   ```bash
   ./setup.sh
   # Or manually:
   cd apps/api && npm install
   cd ../web && npm install
   ```
4. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
5. **Make your changes**
6. **Test your changes**
7. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: Add your feature description"
   git push origin feature/your-feature-name
   ```
8. **Create a Pull Request**

## 📝 Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

**Examples:**
```
feat: Add real-time typing indicators to chat
fix: Resolve RLS policy blocking forum posts
docs: Update API documentation for chat endpoints
refactor: Optimize message query performance
```

## 🎯 What to Contribute

### High Priority
- [ ] Implement full Chat UI (conversation list, message thread)
- [ ] Implement full Forum UI (thread list, post composer)
- [ ] Add realtime subscriptions (WebSocket)
- [ ] Implement file upload functionality
- [ ] Add unit and integration tests
- [ ] Create E2E tests

### Medium Priority
- [ ] Rich text editor for forum posts
- [ ] Advanced search functionality
- [ ] User profile editing UI
- [ ] Notification preferences
- [ ] Dark mode theme
- [ ] Mobile responsive improvements

### Nice to Have
- [ ] Export conversations to PDF
- [ ] Email digest notifications
- [ ] User reputation leaderboard
- [ ] Forum thread bookmarking
- [ ] Chat message search
- [ ] Emoji reactions picker UI

## 🏗️ Code Guidelines

### TypeScript
- Use strict TypeScript
- Define proper types (avoid `any`)
- Use interfaces for objects
- Use type unions for enums

### React
- Functional components with hooks
- Use TypeScript for props
- Keep components small and focused
- Extract reusable logic to hooks

### Backend
- Validate all inputs with Zod
- Sanitize HTML content
- Use proper error handling
- Log important operations
- Follow RESTful conventions

### Database
- Always write RLS policies for new tables
- Add indexes for foreign keys
- Use soft deletes (archived flag)
- Document complex queries

### CSS
- Use Bootstrap classes first
- Custom styles in main.css
- Follow BEM naming for custom classes
- Mobile-first responsive design

## 🧪 Testing

### Before Submitting PR
- [ ] Code compiles without errors
- [ ] No ESLint warnings
- [ ] Tested locally in both apps
- [ ] Database migrations run successfully
- [ ] RLS policies tested
- [ ] API endpoints return correct responses
- [ ] UI works on mobile and desktop

### Writing Tests
```typescript
// Unit test example
describe('sanitizeContent', () => {
  it('should remove script tags', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    const output = sanitizeContent(input);
    expect(output).not.toContain('script');
  });
});

// Integration test example
describe('POST /api/chat/messages', () => {
  it('should create message and send notification', async () => {
    const response = await request(app)
      .post('/api/chat/conversations/123/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hello @user2' });
    
    expect(response.status).toBe(201);
    expect(response.body.data).toHaveProperty('id');
  });
});
```

## 🔒 Security

### Reporting Vulnerabilities
**DO NOT** open public issues for security vulnerabilities.

Instead, email: security@kumii.co.za (or your security email)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Security Checklist for PRs
- [ ] No sensitive data in code
- [ ] No `.env` files committed
- [ ] RLS policies added for new tables
- [ ] Input validation on all endpoints
- [ ] HTML sanitization for user content
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities

## 📚 Documentation

### When to Update Docs
- New API endpoints → Update README.md
- New features → Update relevant guide
- Bug fixes → Update TROUBLESHOOTING.md
- Architecture changes → Update ARCHITECTURE.md
- Database changes → Document in migration file

### Documentation Style
- Use clear, concise language
- Include code examples
- Add troubleshooting tips
- Keep guides up to date
- Use proper Markdown formatting

## 🎨 UI/UX Guidelines

### Design Principles
- **Simplicity**: Clear, uncluttered interfaces
- **Consistency**: Use Bootstrap components
- **Accessibility**: WCAG 2.1 AA compliance
- **Performance**: Fast load times
- **Mobile-first**: Design for mobile, enhance for desktop

### Color Scheme
```css
Primary: #0d6efd (Bootstrap primary)
Secondary: #6c757d (Bootstrap secondary)
Success: #198754
Danger: #dc3545
Warning: #ffc107
Info: #0dcaf0
```

### Typography
- Headings: Bootstrap heading classes
- Body: System font stack
- Code: Monospace font

## 🤝 Code Review Process

### For Contributors
- Be open to feedback
- Respond to review comments
- Make requested changes promptly
- Keep PR scope focused

### For Reviewers
- Be respectful and constructive
- Focus on code quality and correctness
- Test the changes locally
- Check for security issues
- Verify documentation updates

## 📦 Pull Request Checklist

Before submitting your PR, ensure:

- [ ] Code follows project conventions
- [ ] All tests pass
- [ ] New features have tests
- [ ] Documentation is updated
- [ ] Commit messages follow convention
- [ ] PR description explains changes
- [ ] No merge conflicts
- [ ] Branch is up to date with main

## 🎓 Learning Resources

### Understanding the Codebase
1. Read ARCHITECTURE.md for system design
2. Review existing code patterns
3. Check API routes for endpoint structure
4. Study RLS policies for security model

### External Resources
- [React Documentation](https://react.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

## ❓ Questions?

- 📖 Check existing documentation first
- 🔍 Search closed issues for similar questions
- 💬 Open a discussion for general questions
- 🐛 Open an issue for bugs
- 💡 Open an issue for feature requests

## 🙏 Thank You!

Every contribution helps make this project better. Whether it's code, documentation, bug reports, or feature suggestions - we appreciate your help!

---

**Happy Contributing! 🚀**
