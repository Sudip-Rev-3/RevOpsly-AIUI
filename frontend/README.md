# RevOpsly Frontend

Next.js client app for RevOpsly chat, auth UX, file upload UX, and Google Workspace assistant flows.

## Stack

- Next.js 15
- React 19 + TypeScript
- Zustand state stores
- Tailwind CSS

## Setup

```bash
npm install
```

## Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Use the same hostname pairing across frontend/backend (`localhost` with `localhost`), otherwise cookie auth can fail in browser.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev`: development server
- `npm run build`: production build
- `npm run start`: run production build
- `npm run lint`: lint project

## CI/CD (GitHub Actions -> Vercel)

This repository includes a workflow at `.github/workflows/frontend-vercel.yml` that does the following:

- Runs lint + build for changes under `frontend/**`
- Deploys Preview to Vercel on pull requests
- Deploys Production to Vercel on push to `main` or `master`

### Required GitHub repository secrets

Add these secrets in GitHub: `Settings -> Secrets and variables -> Actions`:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### How to get the values

1. Install and login to Vercel CLI locally:

```bash
npm i -g vercel
vercel login
```

2. From the `frontend` folder, link the project once:

```bash
vercel link
```

3. Read values from `.vercel/project.json`:

- `orgId` -> `VERCEL_ORG_ID`
- `projectId` -> `VERCEL_PROJECT_ID`

4. Create `VERCEL_TOKEN` from Vercel dashboard:

- Vercel -> Settings -> Tokens -> Create Token

## Auth Behavior

- App bootstraps user via `GET /auth/me`
- If access token expires, frontend retries via `POST /auth/refresh`
- On refresh failure, user is moved to auth screen

## Workspace Behavior

- Google Workspace panel checks connection status
- If not connected, frontend redirects to workspace OAuth start flow
- Workspace asks are sent to backend `/gspace/ask`

## Troubleshooting

### Auth loops / session missing

- Ensure backend CORS allows frontend origin and credentials
- Ensure `NEXT_PUBLIC_BACKEND_URL` matches the host used in browser

### OAuth callback mismatch

- Verify backend OAuth redirect URIs configured in Google Console match exactly
