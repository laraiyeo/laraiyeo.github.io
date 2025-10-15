# Railway Deployment Guide

## Quick Railway Deployment (5 minutes)

Railway is perfect for this project - they provide both the Node.js hosting and Redis database for free.

### Step 1: Prepare for Deployment

1. **Create Railway account**: Go to https://railway.app and sign up
2. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

### Step 2: Add Railway Configuration

Create a `railway.json` file in your backend directory with deployment settings.

### Step 3: Deploy

```bash
# In your backend directory
railway login
railway init
railway add --database redis
railway deploy
```

### Step 4: Configure Environment

Railway will automatically:
- Deploy your Node.js app
- Provision a Redis database
- Set up environment variables
- Provide HTTPS URLs

### Step 5: Update Mobile App

Update your mobile app's API URL to point to Railway:
```javascript
const API_BASE_URL = 'https://your-app-name.railway.app/api';
```

## Benefits of Railway:
- ✅ **Always Online** - No need for your computer to run
- ✅ **Free Redis** - Included in free tier
- ✅ **Automatic HTTPS** - Secure connections
- ✅ **Auto Scaling** - Handles traffic spikes
- ✅ **Easy Updates** - Git push to deploy
- ✅ **Environment Variables** - Secure config management

## Alternative: Render.com

Render is another excellent free option:

1. Connect your GitHub repo
2. Add Redis add-on
3. Deploy automatically on git push

Both Railway and Render are much better than keeping your computer on 24/7!