#!/usr/bin/env node
// Run after `vercel deploy --prod`. Waits until the new deployment is READY
// and is the project's live production deployment, then deletes every other
// deployment of the project (previews and old production builds).
//
//   node scripts/vercel-cleanup.mjs <deployment-url-or-id>
//
// Env: VERCEL_TOKEN, VERCEL_PROJECT_ID, and VERCEL_TEAM_ID (or VERCEL_ORG_ID).
// Nothing is deleted unless the new deployment is verified live first.

const token = process.env.VERCEL_TOKEN;
const projectId = process.env.VERCEL_PROJECT_ID;
const teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID;
const ref = process.argv[2];

if (!token || !projectId || !ref) {
  console.error("Usage: VERCEL_TOKEN=… VERCEL_PROJECT_ID=… [VERCEL_TEAM_ID=…] node scripts/vercel-cleanup.mjs <deployment-url-or-id>");
  process.exit(2);
}

const API = "https://api.vercel.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, params = {}) {
  const url = new URL(API + path);
  if (teamId) url.searchParams.set("teamId", teamId);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(attempt * 2000);
      continue;
    }
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!res.ok) {
      const err = new Error(`${method} ${path} -> ${res.status} ${body?.error?.message || text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }
}

// 1) Resolve the new deployment (accepts a URL or an id).
const lookup = ref.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const first = await api("GET", `/v13/deployments/${encodeURIComponent(lookup)}`);
const newId = first.id;
if (first.projectId !== projectId) {
  console.error(`Deployment ${newId} belongs to a different project than VERCEL_PROJECT_ID — refusing to delete anything.`);
  process.exit(1);
}
console.log(`New deployment: ${newId} (${first.url})`);

// 2) Wait until it's READY *and* assigned as the project's production deployment.
const deadline = Date.now() + 10 * 60 * 1000;
let live = false;
while (Date.now() < deadline) {
  const d = await api("GET", `/v13/deployments/${newId}`);
  const state = d.readyState || d.status;
  if (state === "ERROR" || state === "CANCELED") {
    console.error(`Deployment ended in state ${state} — nothing deleted.`);
    process.exit(1);
  }
  if (state === "READY") {
    const project = await api("GET", `/v9/projects/${projectId}`);
    const prodId = project?.targets?.production?.id;
    if (prodId === newId) { live = true; break; }
    console.log(`READY, waiting for production alias assignment (current production: ${prodId || "none"})…`);
  } else {
    console.log(`State: ${state}…`);
  }
  await sleep(5000);
}
if (!live) {
  console.error("Timed out before the new deployment became the live production deployment — nothing deleted.");
  process.exit(1);
}
console.log("New deployment is live in production. Deleting all other deployments…");

// 3) List every other deployment of the project (paginated) and delete.
const ids = [];
let until;
for (;;) {
  const page = await api("GET", "/v6/deployments", { projectId, limit: 100, until });
  for (const d of page.deployments || []) if (d.uid !== newId) ids.push({ id: d.uid, url: d.url, target: d.target });
  if (!page.pagination?.next) break;
  until = page.pagination.next;
}
console.log(`Found ${ids.length} other deployment(s).`);

let deleted = 0, failed = 0;
for (const d of ids) {
  try {
    await api("DELETE", `/v13/deployments/${d.id}`);
    deleted++;
    console.log(`  deleted ${d.url} (${d.target || "preview"})`);
  } catch (e) {
    if (e.status === 404) continue; // already gone
    failed++;
    console.log(`::warning::could not delete ${d.url}: ${e.message}`);
  }
  await sleep(150);
}
console.log(`Done. Deleted ${deleted}, failed ${failed}. Kept ${newId}.`);
