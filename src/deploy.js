require('dotenv').config();
const axios = require('axios');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const STAGING_BRANCH = 'staging';
const MAIN_BRANCH = 'main';

const api = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
  },
});

async function getFileSha(branch, path) {
  try {
    const res = await api.get(`/repos/${OWNER}/${REPO}/contents/${path}?ref=${branch}`);
    return res.data.sha;
  } catch {
    return null;
  }
}

async function getBranchSha(branch) {
  const res = await api.get(`/repos/${OWNER}/${REPO}/git/ref/heads/${branch}`);
  return res.data.object.sha;
}

async function createOrUpdateBranch() {
  const mainSha = await getBranchSha(MAIN_BRANCH);
  try {
    await api.get(`/repos/${OWNER}/${REPO}/git/ref/heads/${STAGING_BRANCH}`);
    // Branch existiert — auf main zurücksetzen
    await api.patch(`/repos/${OWNER}/${REPO}/git/refs/heads/${STAGING_BRANCH}`, {
      sha: mainSha,
      force: true,
    });
  } catch {
    // Branch neu erstellen
    await api.post(`/repos/${OWNER}/${REPO}/git/refs`, {
      ref: `refs/heads/${STAGING_BRANCH}`,
      sha: mainSha,
    });
  }
}

async function pushToStaging({ html, type, month }) {
  await createOrUpdateBranch();

  const path = 'menu-preview.html';
  const content = Buffer.from(buildPage(html, type, month)).toString('base64');
  const sha = await getFileSha(STAGING_BRANCH, path);

  await api.put(`/repos/${OWNER}/${REPO}/contents/${path}`, {
    message: `Speisekarte Update: ${type === 'lunch' ? 'Mittagskarte' : 'Abendkarte ' + month}`,
    content,
    branch: STAGING_BRANCH,
    ...(sha && { sha }),
  });

  return `https://${OWNER}.github.io/${REPO}/menu-preview.html`;
}

async function publishLive() {
  // Staging-Datei holen
  const stagingFile = await api.get(`/repos/${OWNER}/${REPO}/contents/menu-preview.html?ref=${STAGING_BRANCH}`);
  const content = stagingFile.data.content.replace(/\n/g, '');
  const sha = await getFileSha(MAIN_BRANCH, 'menu-preview.html');

  await api.put(`/repos/${OWNER}/${REPO}/contents/menu-preview.html`, {
    message: 'Live: Speisekarte aktualisiert',
    content,
    branch: MAIN_BRANCH,
    ...(sha && { sha }),
  });
}

async function cancelStaging() {
  try {
    const mainSha = await getBranchSha(MAIN_BRANCH);
    await api.patch(`/repos/${OWNER}/${REPO}/git/refs/heads/${STAGING_BRANCH}`, {
      sha: mainSha,
      force: true,
    });
  } catch {
    // Staging-Branch existiert nicht, nichts zu tun
  }
}

function buildPage(menuHtml, type, month) {
  const title = type === 'lunch' ? 'Mittagskarte' : `Abendkarte ${month}`;
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} – Vorschau</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
    .menu-item { margin: 20px 0; }
    .menu-title { font-size: 1.1em; font-weight: bold; }
    .menu-description { color: #555; margin: 4px 0; }
    .menu-price { font-weight: bold; color: #222; }
    .preview-banner { background: #f5a623; color: white; padding: 10px 20px; text-align: center; font-weight: bold; margin-bottom: 30px; }
  </style>
</head>
<body>
  <div class="preview-banner">VORSCHAU — Noch nicht live</div>
  <h1>${title}</h1>
  ${menuHtml}
</body>
</html>`;
}

module.exports = { pushToStaging, publishLive, cancelStaging };
