// Thin GitHub Contents API wrapper. All hostel data lives as JSON files in a private repo.
const GH = (() => {
  const API = 'https://api.github.com';
  let cfg = null; // {owner, repo, token}

  const b64encode = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  };
  const b64decode = (b64) => {
    const bin = atob(b64.replace(/\n/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  async function req(path, opts = {}) {
    const res = await fetch(API + path, {
      cache: 'no-store',
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + cfg.token,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.headers || {}),
      },
    });
    return res;
  }

  return {
    configure(c) { cfg = c; },
    // Returns {canWrite} or throws.
    async check() {
      const res = await req(`/repos/${cfg.owner}/${cfg.repo}`);
      if (res.status === 401) throw new Error('Invalid token.');
      if (res.status === 404) throw new Error('Data repo not found, or the token has no access to it.');
      if (!res.ok) throw new Error('GitHub error ' + res.status);
      const j = await res.json();
      return { canWrite: !!(j.permissions && (j.permissions.push || j.permissions.admin)) };
    },
    // Returns {data, sha} or null if the file doesn't exist.
    async read(path) {
      const res = await req(`/repos/${cfg.owner}/${cfg.repo}/contents/${path}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Could not read ${path} (${res.status})`);
      const j = await res.json();
      return { data: JSON.parse(b64decode(j.content)), sha: j.sha };
    },
    // Writes JSON. Pass the sha from the last read (omit for new files).
    // Throws an error with .conflict = true if someone else changed the file meanwhile.
    async write(path, data, sha, message) {
      const body = { message, content: b64encode(JSON.stringify(data, null, 2) + '\n') };
      if (sha) body.sha = sha;
      const res = await req(`/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (res.status === 409 || res.status === 422) {
        const e = new Error('This data was changed by someone else. Reload and try again.');
        e.conflict = true;
        throw e;
      }
      if (!res.ok) throw new Error(`Could not save ${path} (${res.status})`);
      const j = await res.json();
      return j.content.sha;
    },
  };
})();
