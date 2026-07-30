# Catalog

A simple, professional product catalog. Visitors browse read-only by
category and subcategory. Only you can log in to add, edit, or
remove items and categories.

## 1. Set up Supabase (free)

1. Create a project at https://supabase.com
2. Go to **SQL Editor** and run everything in `schema.sql`
   (if you already set up an earlier version of this project, use
   the MIGRATION section at the bottom of `schema.sql` instead)
3. Go to **Storage** and follow the bucket setup notes at the bottom
   of `schema.sql` (create a public `item-photos` bucket)
4. Go to **Authentication → Users** and manually add yourself as a
   user (your email + a password) — this is your admin login.
   Leave public sign-ups **disabled** so no one else can create an
   account.
5. Go to **Settings → API** and copy your **Project URL** and
   **anon public key**

## 2. Connect the app to Supabase

Open `js/supabase-client.js` and paste in your Project URL and anon
key:

```js
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

The anon key is safe to be public — it can only do what your Row
Level Security policies allow (read for everyone, add/delete only
when logged in).

## 3. Deploy

Push this folder to a GitHub repo, then connect it to
[Vercel](https://vercel.com) or [Netlify](https://netlify.com) —
both deploy straight from git with no build step needed, since this
is plain HTML/CSS/JS.

Every `git push` after that redeploys automatically.

Once you have your real live URL, open `index.html` and replace
every `REPLACE_WITH_YOUR_SITE_URL` with it (e.g.
`https://jahangir.vercel.app`) — these control how the link looks
when shared on WhatsApp, Instagram, or Facebook. You'll also want a
real `og-image.jpg` (a good photo of your products, roughly
1200×630px) — without one, shared links will show a broken image
instead of a preview.

## 4. Using it

- **Public catalog:** `yoursite.com/index.html` (or just
  `yoursite.com` if your host serves it as the default page)
- **Admin:** `yoursite.com/admin.html` — log in with the account you
  created in step 1.4

Once logged in:

- **Manage categories** — expand this section to add categories
  (e.g. "Baked Goods") and, optionally, subcategories under them
  (e.g. "Bread" under "Baked Goods"). Removing a category also
  removes its subcategories, and any items in it become
  uncategorized rather than being deleted.
- **Add item** — pick a category/subcategory from the dropdown,
  optionally set a weight (value + unit — g, kg, oz, lb), add a
  description and cover photo. Optionally add extra photos
  (packaging, contents, other angles) — customers see all of them
  when they click the item on the public site.
- **Edit an item** — click "Edit" on any item in the list below the
  form; it loads that item's details back into the form so you can
  change them. You can leave the cover photo field empty to keep the
  existing one, or choose a new one to replace it. Existing
  additional photos show as thumbnails with a small ✕ to remove any
  of them individually.
- **Search your items** — use the search box above the item list to
  quickly find something to edit or delete, even with a typo.

## File structure

```
index.html          Public catalog page
admin.html           Admin login + add/delete
css/style.css        Shared styling
js/supabase-client.js  Your Supabase connection details
js/catalog.js         Public catalog logic
js/admin.js            Admin logic (auth, add, delete)
schema.sql            Database + storage setup (run once in Supabase)
```
