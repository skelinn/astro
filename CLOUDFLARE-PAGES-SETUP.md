# Connect this project to Cloudflare Pages (auto-deploy)

Use these settings when you connect the repo in the Cloudflare dashboard so you don’t have to deploy manually.

---

## Step 1: Get your code on GitHub

1. Install Git: https://git-scm.com/download/win (if you haven’t).
2. Open a terminal in this folder and run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
3. On GitHub.com: **New repository** → create a repo (e.g. `astro`), leave “Add a README” unchecked.
4. In your project folder, run (replace `YOUR_USERNAME` and `astro` with your GitHub username and repo name):
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/astro.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 2: Connect the repo to Cloudflare Pages

1. Go to **https://dash.cloudflare.com** → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Choose **GitHub** and authorize Cloudflare if asked.
3. Select the **repository** you pushed (e.g. `astro`) and the **branch** (e.g. `main`).
4. Use these **build settings** (so you don’t have to set them manually):

   | Setting              | Value              |
   |----------------------|--------------------|
   | **Framework preset** | None (or Vite)     |
   | **Build command**    | `npm run build`    |
   | **Build output dir** | `dist`             |
   | **Root directory**   | (leave blank)      |
   | **Node.js version**  | 18 or 20 (optional)|

5. Click **Save and Deploy**.

After this, every push to `main` will trigger a new deploy automatically.

---

## Optional: Deploy from your PC with Wrangler

If you prefer to deploy without Git:

```bash
npm install -g wrangler
npm run build
npx wrangler pages deploy dist --project-name=YOUR_PROJECT_NAME
```

First time: run `npx wrangler login` and create the project when prompted.
