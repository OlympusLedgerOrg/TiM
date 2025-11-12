# Developer Guide for TiM

This guide covers the advanced developer utilities and setup for the TiM Work Order Management System.

## 🚀 Quick Start

### Prerequisites
- Node.js 22+ (see `.nvmrc`)
- PostgreSQL 17
- npm or yarn

### Installation

```bash
# Install all dependencies
npm run install:all

# Or manually
npm install
cd backend && npm install
cd ../frontend && npm install
```

### Running the Application

```bash
# Start both backend and frontend
npm run start:all

# Or start individually
npm run start:backend  # Starts on http://localhost:4000
npm run start:frontend # Starts on http://localhost:5173
```

## 🔐 JWT Token Generator

Generate JWT tokens for testing and development:

```bash
cd backend
npm run gen-token -- --role Tech --subject user123 --expires 7d
npm run gen-token -- --role Supervisor --subject admin456 --expires 30d
npm run gen-token -- --role Admin --subject superadmin --expires 365d
```

**Parameters:**
- `--role`: Tech | Supervisor | Admin
- `--subject`: User identifier
- `--expires`: Expiration time (e.g., 1h, 7d, 30d, 365d)

## 🌱 Database Seeding

Seed the database with demo work orders and steps:

```bash
cd backend
npm run seed
```

This will create:
- 3 sample work orders
- Multiple steps for each work order
- Some completed steps with notes

## 🏥 Health Endpoint

Check API and database health:

```bash
curl http://localhost:4000/health
```

**Response (Healthy):**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-12T15:00:00.000Z",
  "database": "connected"
}
```

**Response (Unhealthy):**
```json
{
  "status": "unhealthy",
  "timestamp": "2025-11-12T15:00:00.000Z",
  "database": "disconnected",
  "error": "Connection error message"
}
```

## 🧪 Testing

```bash
# Run all tests
npm run test:all

# Run backend tests only
cd backend && npm test

# Run with coverage
cd backend && npm test -- --coverage
```

## 🎨 Code Quality

### Linting

```bash
# Lint all code
npm run lint:all

# Lint specific workspace
npm run lint:backend
npm run lint:frontend
```

### Formatting

```bash
# Format all code
npm run format:all

# Check formatting without changes
cd backend && npm run format:check
cd frontend && npm run format:check
```

## 🔧 VS Code Integration

### Debug Configurations

Press `F5` or go to Run & Debug panel:

1. **Backend: Debug** - Debug the backend server
2. **Backend: Run Tests** - Debug tests
3. **Frontend: Debug** - Debug frontend in Chrome
4. **Full Stack: Debug** - Debug both simultaneously

### Tasks

Press `Ctrl+Shift+P` → "Tasks: Run Task":

- **Backend: Dev** - Start backend dev server
- **Frontend: Dev** - Start frontend dev server
- **Start All** - Start both servers
- **Backend: Build** - Build backend
- **Frontend: Build** - Build frontend
- **Backend: Test** - Run backend tests
- **Backend/Frontend: Lint** - Run linters
- **Backend/Frontend: Format** - Format code

## 📦 API Testing

### Thunder Client (VS Code Extension)

1. Install Thunder Client extension
2. Collection is pre-configured in `.vscode/thunder-tests/`
3. Update environment variables with actual tokens and IDs

### Postman

1. Import `docs/TiM-API.postman_collection.json`
2. Set collection variables:
   - `baseUrl`: http://localhost:4000
   - `workOrderId`: Your work order ID
   - `stepId`: Your step ID
   - `techToken`: JWT token for Tech role
   - `supervisorToken`: JWT token for Supervisor role

## 🏗️ Building

```bash
# Build all
npm run build:all

# Build individually
npm run build:backend
npm run build:frontend
```

Build outputs:
- Backend: `backend/dist/`
- Frontend: `frontend/dist/`

## 🐳 Docker

### Development

```bash
docker-compose up
```

Services:
- Database: PostgreSQL 17 on port 5432
- Backend: Node.js API on port 4000
- Frontend: Vite dev server on port 5173

### Production

```bash
docker-compose -f docker-compose.prod.yml up
```

## 📝 Configuration Files

### EditorConfig (`.editorconfig`)
- Defines consistent editor settings
- Automatically applied by most modern editors

### ESLint
- Backend: `backend/eslint.config.js`
- Frontend: `frontend/eslint.config.js`

### Prettier
- Backend: `backend/.prettierrc`
- Frontend: `frontend/.prettierrc`

### TypeScript
- Backend: `backend/tsconfig.json`
- Frontend: `frontend/tsconfig.json`

## 🔄 CI/CD

GitHub Actions workflows in `.github/workflows/`:

### CI Pipeline (`ci.yml`)

Runs on push and PR to `main` and `develop`:

**Backend Jobs:**
1. **Lint** - ESLint + Prettier check
2. **Build** - TypeScript compilation
3. **Test** - Jest tests with PostgreSQL

**Frontend Jobs:**
1. **Lint** - ESLint + Prettier check
2. **Build** - Vite production build

## 📚 Additional Resources

- [Complete Step Feature Guide](how-to-complete-a-work-order-step.md)
- [API Documentation](../README.md#core-feature-step-completion)
- [Prisma Schema](../backend/prisma/schema.prisma)

## 🛠️ Troubleshooting

### Port Already in Use

```bash
# Kill process on port 4000
lsof -ti:4000 | xargs kill -9

# Kill process on port 5173
lsof -ti:5173 | xargs kill -9
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# View logs
docker logs tim-db

# Restart database
docker-compose restart db
```

### Prisma Issues

```bash
# Regenerate Prisma Client
cd backend
npx prisma generate

# Reset database (caution: deletes data)
npx prisma migrate reset

# Apply migrations
npx prisma migrate deploy
```

### Node Version Issues

```bash
# Using nvm
nvm use

# Or install Node 22
nvm install 22
nvm use 22
```

## 🎯 Best Practices

1. **Always run linters before committing:**
   ```bash
   npm run lint:all
   ```

2. **Format code before committing:**
   ```bash
   npm run format:all
   ```

3. **Run tests after changes:**
   ```bash
   npm run test:all
   ```

4. **Use the JWT generator for consistent tokens:**
   ```bash
   npm run gen-token -- --role Tech --subject your-id --expires 7d
   ```

5. **Check the health endpoint after starting:**
   ```bash
   curl http://localhost:4000/health
   ```

## 🤝 Contributing

1. Create a feature branch
2. Make changes following the code style
3. Run linters and tests
4. Submit a pull request

The CI pipeline will automatically run all checks on your PR.
