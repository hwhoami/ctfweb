// ==================== CTF ARENA SERVER DB ====================
// Data user dan progress disimpan di server melalui API REST.
// Penyimpanan ini bersifat permanen dan bisa diakses dari browser lain.

function getApiBaseUrls() {
    if (typeof window === 'undefined') {
        return ['http://127.0.0.1:3000'];
    }

    const origins = [];
    const origin = window.location.origin;
    if (origin && origin !== 'null' && window.location.protocol !== 'file:') {
        origins.push(origin);
    }
    origins.push('http://127.0.0.1:3000', 'http://localhost:3000');

    return origins.filter((item, index) => origins.indexOf(item) === index);
}

async function requestJson(url, options = {}) {
    const urls = getApiBaseUrls();
    const requestUrl = url.startsWith('http') ? url : url;

    let lastError = null;
    for (const baseUrl of urls) {
        try {
            const fullUrl = requestUrl.startsWith('http') ? requestUrl : `${baseUrl}${requestUrl}`;
            const response = await fetch(fullUrl, {
                headers: { 'Content-Type': 'application/json' },
                ...options
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.msg || 'Request gagal');
            }
            return data;
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Request gagal');
}

function openDB() {
    return Promise.resolve();
}

async function dbRegister(username, password) {
    try {
        const data = await requestJson('/api/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        return { ok: true, msg: data.msg || '✅ Registrasi berhasil!' };
    } catch (error) {
        return { ok: false, msg: `❌ ${error.message}` };
    }
}

async function dbLogin(username, password) {
    try {
        const data = await requestJson('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        return { ok: true, msg: data.msg || '✅ Login berhasil!' };
    } catch (error) {
        return { ok: false, msg: `❌ ${error.message}` };
    }
}

async function dbLogout() {
    try {
        await requestJson('/api/session', { method: 'DELETE' });
        return true;
    } catch {
        return false;
    }
}

async function dbGetCurrentUser() {
    try {
        const data = await requestJson('/api/session');
        return data.username || null;
    } catch {
        return null;
    }
}

async function dbGetProgress(username) {
    try {
        const data = await requestJson(`/api/progress/${encodeURIComponent(username)}`);
        return data.progress;
    } catch {
        return {
            username,
            flag1: false,
            flag2: false,
            flag3: false,
            flagsFound: 0,
            lastUpdated: new Date().toISOString()
        };
    }
}

async function dbGetLogs() {
    try {
        const data = await requestJson('/api/logs');
        return data.logs || [];
    } catch {
        return [];
    }
}

async function dbSaveProgress(username, flags) {
    try {
        await requestJson(`/api/progress/${encodeURIComponent(username)}`, {
            method: 'POST',
            body: JSON.stringify({ flags })
        });
        return true;
    } catch {
        return false;
    }
}

async function dbGetAllUsers() {
    try {
        const data = await requestJson('/api/users');
        return data.users || [];
    } catch {
        return [];
    }
}

async function dbDeleteUser(username) {
    try {
        await requestJson(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
        return { ok: true, msg: 'User dihapus' };
    } catch (error) {
        return { ok: false, msg: `❌ ${error.message}` };
    }
}

async function dbGetLeaderboard() {
    try {
        const data = await requestJson('/api/leaderboard');
        return data.leaderboard || [];
    } catch {
        return [];
    }
}