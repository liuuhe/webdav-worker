# Cloudflare WebDAV Worker

[中文说明](README.zh-CN.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/liuuhe/webdav-worker)

A path-based WebDAV service built on Cloudflare Workers, R2, and KV, with a lightweight admin panel for managing multiple apps from one place.

## Features

- Fixed WebDAV URLs such as `https://webdav.example.com/obsidian-notes/`
- One isolated storage prefix per app
- Optional WebDAV Basic Auth per app
- Lightweight admin panel at `https://<your-domain>/manage/<ADMIN_TOKEN>`
- English-first bilingual admin UI with Chinese switching support
- Works on Cloudflare Workers without running your own server

## Route Model

- WebDAV endpoint: `https://<your-domain>/<app-path>/`
- Admin panel: `https://<your-domain>/manage/<ADMIN_TOKEN>`

Example:

- `https://webdav.example.com/obsidian-notes/`
- `https://webdav.example.com/manage/replace-with-a-long-random-token`

## Stack

- Runtime: Cloudflare Workers
- File storage: Cloudflare R2
- App metadata: Cloudflare KV
- Main entry: [src/index.ts](src/index.ts)
- Worker config: [wrangler.jsonc](wrangler.jsonc)

## Quick Links

- Deploy to Cloudflare buttons:
  https://developers.cloudflare.com/workers/tutorials/deploy-button
- Create an R2 bucket:
  https://developers.cloudflare.com/r2/buckets/create-buckets/
- Create a KV namespace:
  https://developers.cloudflare.com/kv/get-started/
- Manage Worker secrets:
  https://developers.cloudflare.com/workers/configuration/secrets/
- Attach a custom domain:
  https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Wrangler configuration reference:
  https://developers.cloudflare.com/workers/wrangler/configuration/

## One-Click Deployment

This repository already includes a working Deploy to Cloudflare button:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/liuuhe/webdav-worker)

What this can do:

- Import the public repository into Cloudflare
- Provision supported bindings declared in `wrangler.jsonc`
- Let the deployer choose their own Worker name and resource names

What still needs manual input:

- `ADMIN_TOKEN` must still be provided as a secret
- A custom domain still needs to be attached in Cloudflare
- Production bucket names / KV IDs still belong to the person deploying, not this repo

## Deploy Your Own WebDAV Service

There are two practical ways to deploy this project.

### Option A: Deploy to Cloudflare from this public repo

1. Click the Deploy to Cloudflare button above.
2. Review the generated project and bindings in Cloudflare.
3. Set `ADMIN_TOKEN` to a long random string.
4. Deploy.
5. Open `https://<workers-subdomain>/manage/<ADMIN_TOKEN>` and create your first app.
6. Attach a custom domain later if you do not want to use the default `workers.dev` hostname.

### Option B: Manual deployment with Wrangler

#### 1. Install dependencies

```powershell
npm install
```

#### 2. Log in to Cloudflare

```powershell
wrangler login
```

#### 3. Create an R2 bucket

Pick your own globally unique bucket name.

```powershell
wrangler r2 bucket create your-webdav-bucket
```

#### 4. Create a KV namespace

```powershell
wrangler kv namespace create WEBDAV_CONFIG
```

If you want a dedicated preview namespace for remote development:

```powershell
wrangler kv namespace create WEBDAV_CONFIG --preview
```

#### 5. Update `wrangler.jsonc`

Set these values for your own deployment:

- `name`
- `r2_buckets[0].bucket_name`
- `kv_namespaces[0].id`
- `kv_namespaces[0].preview_id` if you created a preview namespace

You can also add a custom domain route later under `routes`, for example:

```jsonc
{
  "routes": [
    {
      "pattern": "webdav.example.com",
      "custom_domain": true
    }
  ]
}
```

#### 6. Set the admin token secret

Use a long random string. It becomes part of the admin URL.

```powershell
wrangler secret put ADMIN_TOKEN
```

#### 7. Deploy

```powershell
npm run deploy
```

#### 8. Open the admin panel

If you are using the default Workers hostname:

- `https://<your-worker>.<your-subdomain>.workers.dev/manage/<ADMIN_TOKEN>`

If you later attach a custom domain:

- `https://webdav.example.com/manage/<ADMIN_TOKEN>`

## Custom Domain Setup

To serve WebDAV from your own domain or subdomain:

1. Put your domain on Cloudflare.
2. Add a custom domain in the Cloudflare dashboard, or define a `routes` entry with `"custom_domain": true` in `wrangler.jsonc`.
3. Deploy again if you changed the Wrangler config.
4. Wait for DNS and certificate provisioning to complete.

Recommended pattern:

- `webdav.example.com` for the Worker
- `https://webdav.example.com/<app-path>/` for each app

## Admin Panel Usage

After deployment, open:

- `https://<your-domain>/manage/<ADMIN_TOKEN>`

From the admin panel you can:

- Create apps
- Assign a fixed app path
- Assign a storage prefix
- Set optional WebDAV username/password
- Edit notes
- Delete an app
- Optionally purge stored files when deleting an app

## Auth Model

Each app can work in one of two modes:

- URL-only access:
  leave both username and password empty
- Basic Auth:
  set a WebDAV username and password for that app

Example:

- URL-only app:
  `https://webdav.example.com/obsidian-notes/`
- Basic Auth app:
  same URL, but the WebDAV client must send credentials

## Local Development

Create a local `.dev.vars` file from `.dev.vars.example`:

```env
ADMIN_TOKEN=replace-with-a-long-random-string
```

Then run:

```powershell
npm run dev
```

## Publishing Notes

If you want to publish your own version of this project:

- Keep `.dev.vars` out of Git
- Replace placeholder binding IDs and bucket names with your own values
- Use your own public repo URL for any Deploy to Cloudflare button
- Do not commit production secrets
