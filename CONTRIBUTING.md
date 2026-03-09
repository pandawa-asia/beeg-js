# Contributing Guide

Terima kasih tertarik berkontribusi pada Video Downloader Bot!

## Getting Started

1. Clone repository
2. Install dependencies: `npm install`
3. Copy `.env.example` ke `.env`
4. Setup Telegram bot token

## Development

```bash
npm run dev      # Run dengan auto-reload
npm test         # Run unit tests
npm test:watch   # Watch mode untuk TDD
```

## Code Style

- Use consistent formatting (2 spaces indentation)
- Add JSDoc comments untuk functions
- Use descriptive variable names
- Keep functions focused & small

## Adding Features

1. **Create feature branch**: `git checkout -b feature/your-feature`
2. **Write tests first** (TDD approach)
3. **Implement feature** with JSDoc comments
4. **Run tests**: `npm test`
5. **Update documentation** if needed
6. **Commit**: `git commit -m "feat: description"`

## Code Structure

- `src/` - Source code
  - `config/` - Configuration
  - `handlers/` - Telegram handlers
  - `services/` - Business logic
  - `utils/` - Helpers & utilities
  - `workers/` - Queue & workers
  - `messages/` - Message templates
  - `errors/` - Error classes

- `tests/` - Unit tests
- `logs/` - Application logs

## Testing

All critical functions must have unit tests:

```javascript
describe('Feature name', () => {
  test('should do something', () => {
    expect(result).toBe(expected);
  });
});
```

Run tests: `npm test`

## Documentation

Update documentation when:
- Adding new features
- Changing API
- Modifying configuration
- Improving processes

Files to update:
- `README.md` - User-facing docs
- `ARCHITECTURE.md` - System design
- JSDoc comments in code

## Commit Messages

Use conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance

Example:
```
feat: add priority queue support

- Implement PriorityQueue class
- Update worker to respect priority
- Add tests for priority handling
```

## Pull Request Process

1. Create PR with clear description
2. Reference any related issues
3. Ensure tests pass: `npm test`
4. Ensure docs are updated
5. Wait for review & approval

## Questions?

- Check existing issues
- Review documentation
- Ask in PR comments

---

**Happy coding!** 🚀
