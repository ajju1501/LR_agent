---
description: Deploy the LR Agent app publicly using Vercel (frontend) + Railway (backend) + Neon (database)
---

# Deployment Guide: Vercel + Railway + Neon

## Prerequisites
- GitHub repo pushed (https://github.com/ajju1501/LR_agent.git, branch: laptop_2)
- Accounts on: [Vercel](https://vercel.com), [Railway](https://railway.app), [Neon](https://neon.tech)

---

## Step 1: Set up Neon PostgreSQL Database

1. Go to [neon.tech](https://neon.tech) and sign up / log in
2. Click **"New Project"** → Name it `lr-chatbot`
3. Choose a region close to you (e.g., `Asia Southeast` or `US East`)
4. Once created, copy the **connection string** from the dashboard. It looks like:
   ```
   postgresql://neondb_owner:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```
5. Run the init SQL to set up tables. In the Neon **SQL Editor**, paste and run the contents of `init.sql` from the repo root.

> **Save this connection string** — you'll need it for Railway.

---

## Step 2: Deploy Backend on Railway

1. Go to [railway.app](https://railway.app) and sign up / log in with GitHub
2. Click **"New Project"** → **"Deploy from GitHub Repo"**
3. Select `ajju1501/LR_agent` repo, branch `laptop_2`
4. Railway will detect it as a monorepo. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

5. Go to **Settings** → **Networking** → **Generate Domain** (gives you a public URL like `lr-agent-backend-production.up.railway.app`)

6. Go to **Variables** tab and add ALL environment variables:

   ```
   NODE_ENV=production
   PORT=5000
   FRONTEND_URL=https://your-vercel-app.vercel.app  (set after Vercel deploy)
   
   # Database (from Neon Step 1)
   DATABASE_URL=postgresql://neondb_owner:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   
   # HuggingFace
   HF_BASE_URL=https://router.huggingface.co/v1
   HF_TOKEN=your_hf_token
   HF_MODEL=Qwen/Qwen3-Coder-Next:novita
   HF_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
   
   # LoginRadius
   LR_API_KEY=your_lr_api_key
   LR_API_SECRET=your_lr_api_secret
   LR_APP_NAME=your_lr_app_name
   LR_OAUTH_CLIENT_ID=your_oauth_client_id
   LR_OAUTH_CLIENT_SECRET=your_oauth_client_secret
   LR_OAUTH_APP_NAME=your_oauth_app_name
   LR_OAUTH_REDIRECT_URI=https://your-vercel-app.vercel.app/callback
   LR_SITE_URL=https://internal-ajaypagidipally.hub.loginradius.com
   
   # ChromaDB
   CHROMADB_COLLECTION=loginradius_docs
   CHROMADB_PERSIST_DIRECTORY=./chroma_data
   ```

7. Railway will auto-deploy. Check the **Deployments** tab for logs.

> **Save the Railway domain URL** — you'll need it for Vercel.

---

## Step 3: Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and sign up / log in with GitHub
2. Click **"Add New Project"** → Import `ajju1501/LR_agent`
3. Configure:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: Leave default (`.next`)

4. Go to **Environment Variables** and add:
   ```
   NEXT_PUBLIC_API_URL=https://your-railway-domain.up.railway.app
   NEXT_PUBLIC_APP_NAME=LoginRadius Chatbot
   ```

5. Click **Deploy**

> **Save the Vercel URL** (e.g., `lr-agent-frontend.vercel.app`)

---

## Step 4: Update Cross-References

After both are deployed, you need to update the URLs that reference each other:

### On Railway (backend):
- Update `FRONTEND_URL` to your Vercel URL
- Update `LR_OAUTH_REDIRECT_URI` to `https://your-vercel-app.vercel.app/callback`

### On Vercel (frontend):
- `NEXT_PUBLIC_API_URL` should already point to Railway

### On LoginRadius Admin Console:
- Go to your OAuth app settings
- Add the Vercel URL to **Allowed Redirect URIs**: `https://your-vercel-app.vercel.app/callback`
- Add the Vercel URL to **Allowed Origins/CORS**: `https://your-vercel-app.vercel.app`

---

## Step 5: Verify Deployment

1. Visit your Vercel URL
2. Try logging in via LoginRadius OAuth
3. Test the chat functionality
4. Upload a PDF and verify indexing works

---

## Troubleshooting

### CORS Errors
- Ensure `FRONTEND_URL` on Railway matches your exact Vercel domain
- Check Railway logs for CORS-related errors

### OAuth Callback Fails
- Ensure `LR_OAUTH_REDIRECT_URI` matches exactly what's configured in LoginRadius Admin Console
- The redirect URI must use HTTPS in production

### Database Connection Issues
- Ensure `?sslmode=require` is in the Neon connection string
- Check Railway logs for PostgreSQL connection errors

### Build Failures
- Check Railway/Vercel build logs
- Common: missing dependencies, TypeScript errors in strict mode
