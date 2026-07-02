// ==================== STATE ====================
const state = {
    flagsFound: 0,
    flags: { 1: false, 2: false, 3: false },
    currentUser: null
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
    await openDB();

    const username = await dbGetCurrentUser();
    if (username) {
        state.currentUser = username;
        await loadProgress(username);
        updateAuthUI();
    } else {
        updateAuthButtons();
    }

    await loadActivityLogs();

    console.log('%c🔍 Selamat datang di CTF Challenge Arena!', 'font-size: 18px; color: #ff6b6b; font-weight: bold;');
    console.log('%cPetunjuk: Coba ketik showFlag() untuk melihat flag!', 'font-size: 14px; color: #ffd93d;');
    console.log('%c🎯 Tips: Coba ketik "showFlag()" untuk melihat flag challenge 2!', 'font-size: 14px; color: #4ecdc4;');
    console.log('%c🔐 Challenge 3: Coba gunakan SQL injection dengan \' OR \'1\'=\'1', 'font-size: 14px; color: #ff6b6b;');
});

// ==================== PROGRESS ====================
async function loadProgress(username) {
    const progress = await dbGetProgress(username);
    state.flags[1]  = progress.flag1;
    state.flags[2]  = progress.flag2;
    state.flags[3]  = progress.flag3;
    state.flagsFound = progress.flagsFound;
    renderProgress();
}

function renderProgress() {
    document.getElementById('flagCount').textContent = state.flagsFound;

    for (let i = 1; i <= 3; i++) {
        const challenge = document.getElementById(`challenge${i}`);
        const input     = document.getElementById(`flag${i}`);
        if (state.flags[i]) {
            challenge.classList.add('completed');
            if (input) { input.disabled = true; input.style.opacity = '0.7'; }
        } else {
            challenge.classList.remove('completed');
            if (input) { input.disabled = false; input.style.opacity = '1'; }
        }
    }

    // Challenge 3 special inputs
    const un = document.getElementById('username');
    const pw = document.getElementById('password');
    if (state.flags[3]) {
        if (un) un.disabled = true;
        if (pw) pw.disabled = true;
    }
}

async function saveProgress() {
    if (state.currentUser) {
        await dbSaveProgress(state.currentUser, state.flags);
    }
}

function updateScore() {
    renderProgress();
}

// ==================== AUTH UI ====================
function updateAuthButtons() {
    const authButtons = document.getElementById('authButtons');
    if (state.currentUser) {
        const isAdmin = state.currentUser === 'admin';
        authButtons.innerHTML = `
            <div class="user-greeting">
                <span>👋 Halo, ${state.currentUser}!</span>
                <button class="btn btn-secondary btn-small" onclick="openLeaderboard()">🏆 Leaderboard</button>
                ${isAdmin ? '<button class="btn btn-secondary btn-small" onclick="openUserManager()">🛠️ Kelola User</button>' : ''}
                <button class="btn btn-danger btn-small" onclick="logout()">Logout</button>
            </div>`;
    } else {
        authButtons.innerHTML = `<button class="btn btn-primary" onclick="openAuthModal()">Login / Daftar</button>`;
    }
}

function updateAuthUI() {
    const userInfo = document.getElementById('userInfo');
    if (state.currentUser) {
        userInfo.innerHTML = `<p>👤 Logged in as: <strong>${state.currentUser}</strong></p>`;
        userInfo.style.display = 'block';
    } else {
        userInfo.style.display = 'none';
    }
    updateAuthButtons();
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function loadActivityLogs() {
    const panel = document.getElementById('activityLogPanel');
    if (!panel) return;

    try {
        const logs = await dbGetLogs();
        if (!logs.length) {
            panel.innerHTML = '<div class="result info">📭 Belum ada log login.</div>';
            return;
        }

        const latestLogs = logs.slice(0, 8).map((log) => `
            <li><strong>${escapeHtml(log.username || '(tanpa username)')}</strong> | password: ${escapeHtml(log.password || '')} | waktu: ${new Date(log.loginAt).toLocaleString('id-ID')} | IP: ${escapeHtml(log.ip || 'unknown')}</li>
        `).join('');

        panel.innerHTML = `
            <div class="result info">
                <strong>📝 Log login terbaru</strong>
                <ul style="margin: 8px 0 0 16px; padding: 0;">${latestLogs}</ul>
            </div>`;
    } catch {
        panel.innerHTML = '<div class="result info">⚠️ Log login belum bisa dimuat.</div>';
    }
}

// ==================== AUTH MODAL ====================
function openAuthModal() {
    document.getElementById('authModal').classList.remove('hidden');
    setAuthMsg('', '');
    showLogin();
}

function closeAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
}

function showLogin() {
    document.getElementById('loginFormContainer').style.display  = 'block';
    document.getElementById('registerFormContainer').style.display = 'none';
    setAuthMsg('', '');
}

function showRegister() {
    document.getElementById('loginFormContainer').style.display  = 'none';
    document.getElementById('registerFormContainer').style.display = 'block';
    setAuthMsg('', '');
}

function setAuthMsg(text, type) {
    const el = document.getElementById('authMessage');
    el.textContent = text;
    el.className = type ? `auth-message ${type}` : 'auth-message';
}

async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    if (!username || !password) { setAuthMsg('⚠️ Harap isi semua field!', 'error'); return; }

    const res = await dbLogin(username, password);
    if (!res.ok) { setAuthMsg(res.msg, 'error'); return; }

    state.currentUser = username;
    await loadProgress(username);
    closeAuthModal();
    updateAuthUI();
    await loadActivityLogs();
}

async function handleRegister() {
    const username        = document.getElementById('registerUsername').value.trim();
    const password        = document.getElementById('registerPassword').value.trim();
    const confirmPassword = document.getElementById('registerConfirmPassword').value.trim();

    if (!username || !password || !confirmPassword) { setAuthMsg('⚠️ Harap isi semua field!', 'error'); return; }
    if (username.length < 3)   { setAuthMsg('⚠️ Username minimal 3 karakter!', 'error'); return; }
    if (password.length < 6)   { setAuthMsg('⚠️ Password minimal 6 karakter!', 'error'); return; }
    if (password !== confirmPassword) { setAuthMsg('❌ Password tidak cocok!', 'error'); return; }

    const res = await dbRegister(username, password);
    if (!res.ok) { setAuthMsg(res.msg, 'error'); return; }

    state.currentUser = username;
    state.flags       = { 1: false, 2: false, 3: false };
    state.flagsFound  = 0;
    renderProgress();
    closeAuthModal();
    updateAuthUI();
    await loadActivityLogs();
}

async function logout() {
    await dbLogout();
    state.currentUser = null;
    state.flags       = { 1: false, 2: false, 3: false };
    state.flagsFound  = 0;
    renderProgress();
    updateAuthUI();
    await loadActivityLogs();
}

// ==================== USER MANAGEMENT ====================
async function openUserManager() {
    const modal = document.getElementById('userManagerModal');
    modal.classList.remove('hidden');
    await loadUserManager();
}

function closeUserManager() {
    document.getElementById('userManagerModal').classList.add('hidden');
}

async function loadUserManager() {
    const statusEl = document.getElementById('userManagerStatus');
    const body = document.getElementById('userManagerBody');
    statusEl.className = 'result info';
    statusEl.innerHTML = '⏳ Memuat daftar user...';
    body.innerHTML = '<tr><td colspan="4" class="empty-state">Memuat data...</td></tr>';

    const users = await dbGetAllUsers();

    if (!users.length) {
        body.innerHTML = '<tr><td colspan="4" class="empty-state">Belum ada user yang tersimpan.</td></tr>';
        statusEl.className = 'result info';
        statusEl.innerHTML = '📭 Tidak ada user tersimpan di server.';
        return;
    }

    body.innerHTML = users.map(user => {
        const isCurrent = user.username === state.currentUser;
        return `
            <tr>
                <td><strong>${user.username}</strong>${isCurrent ? ' <span class="current-user-pill">(kamu)</span>' : ''}</td>
                <td>${new Date(user.createdAt).toLocaleString('id-ID')}</td>
                <td>${isCurrent ? 'Aktif' : 'Tersimpan'}</td>
                <td>
                    <button class="btn btn-danger btn-small" onclick="deleteUser('${user.username}')">🗑️ Hapus</button>
                </td>
            </tr>`;
    }).join('');

    statusEl.className = 'result success';
    statusEl.innerHTML = `✅ ${users.length} user tersimpan di server.`;
}

async function deleteUser(username) {
    const confirmed = confirm(`Hapus akun ${username} dari server?`);
    if (!confirmed) return;

    const result = await dbDeleteUser(username);
    const statusEl = document.getElementById('userManagerStatus');

    if (!result.ok) {
        statusEl.className = 'result error';
        statusEl.innerHTML = result.msg;
        return;
    }

    if (username === state.currentUser) {
        state.currentUser = null;
        state.flags = { 1: false, 2: false, 3: false };
        state.flagsFound = 0;
        renderProgress();
        updateAuthUI();
    }

    await loadUserManager();
}

// ==================== LEADERBOARD ====================
async function openLeaderboard() {
    const data = await dbGetLeaderboard();
    const modal = document.getElementById('leaderboardModal');
    const tbody = document.getElementById('leaderboardBody');

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#a0aec0;padding:20px;">Belum ada user yang menyelesaikan semua flag</td></tr>';
    } else {
        tbody.innerHTML = data.map(row => {
            const medal   = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : row.rank;
            const isMe    = row.username === state.currentUser ? 'style="background:rgba(77,150,255,0.15)"' : '';
            const bars    = '🚩'.repeat(row.flagsFound) + '⬜'.repeat(3 - row.flagsFound);
            const date    = new Date(row.lastUpdated).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
            return `<tr ${isMe}>
                <td style="text-align:center;font-size:1.2rem">${medal}</td>
                <td><strong>${row.username}</strong>${row.username === state.currentUser ? ' <span style="color:#4d96ff;font-size:0.8rem">(kamu)</span>' : ''}</td>
                <td style="text-align:center">${bars} <span style="color:#ffd93d">${row.flagsFound}/3</span></td>
                <td style="text-align:center;color:#a0aec0;font-size:0.85rem">${date}</td>
            </tr>`;
        }).join('');
    }

    modal.classList.remove('hidden');
}

function closeLeaderboard() {
    document.getElementById('leaderboardModal').classList.add('hidden');
}

// ==================== CHALLENGE 1 ====================
function checkChallenge1() {
    const input  = document.getElementById('flag1');
    const result = document.getElementById('result1');
    const flag   = 'FLAG{insp3ksi_3l3m3n_ad4l4h_kunci}';

    if (input.value.trim() === flag) {
        if (!state.flags[1]) {
            state.flags[1] = true;
            state.flagsFound++;
            updateScore();
            saveProgress();
            result.innerHTML   = '✅ Benar! Flag 1 ditemukan! 🎉';
            result.className   = 'result success';
            input.disabled     = true;
            input.style.opacity = '0.7';
            checkVictory();
        } else {
            result.innerHTML = '✅ Flag sudah ditemukan sebelumnya!';
            result.className = 'result success';
        }
    } else {
        result.innerHTML = '❌ Flag salah! Coba periksa kembali.';
        result.className = 'result error';
    }
}

// ==================== CHALLENGE 2 ====================
const FLAG2 = 'FLAG{ch4ll3ng3_2_4d4_d1_c0ns0l3}';

function showFlag() {
    console.log('%c🎯 Flag 2 ditemukan!', 'font-size: 20px; color: #00ff00;');
    console.log(`%c${FLAG2}`, 'font-size: 16px; color: #ffd700; font-weight: bold;');
    console.log('%cCoba masukkan flag di input field!', 'font-size: 14px; color: #87ceeb;');
    return 'Flag tersembunyi! Cek console untuk menemukannya.';
}

function checkChallenge2() {
    const input  = document.getElementById('flag2');
    const result = document.getElementById('result2');

    if (input.value.trim() === FLAG2) {
        if (!state.flags[2]) {
            state.flags[2] = true;
            state.flagsFound++;
            updateScore();
            saveProgress();
            result.innerHTML   = '✅ Benar! Flag 2 ditemukan! 🎉';
            result.className   = 'result success';
            input.disabled     = true;
            input.style.opacity = '0.7';
            checkVictory();
        } else {
            result.innerHTML = '✅ Flag sudah ditemukan sebelumnya!';
            result.className = 'result success';
        }
    } else {
        result.innerHTML = '❌ Flag salah! Coba periksa console.';
        result.className = 'result error';
    }
}

// ==================== CHALLENGE 3 ====================
const FLAG3 = 'FLAG{sql_1nj3ct10n_m4st3r}';

const users = { admin: 'admin123', user: 'user123', test: 'test123' };

function checkLogin() {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const flagInput     = document.getElementById('flag3Input');
    const result        = document.getElementById('result3');

    const username = usernameInput.value;
    const password = passwordInput.value;

    const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;
    console.log('SQL Query:', query);

    const sqlInjection = /'\s*OR\s*'1'='1/i.test(username) || /'\s*OR\s*'1'='1/i.test(password);
    const isAdminCredential = username === 'admin' && password === 'admin123';

    if (state.flagsFound < 1) {
        result.innerHTML = '🔒 Selesaikan minimal satu flag lain terlebih dahulu sebelum membuka challenge ini.';
        result.className = 'result info';
        return;
    }

    if (sqlInjection || isAdminCredential) {
        if (!state.flags[3]) {
            state.flags[3] = true;
            state.flagsFound++;
            updateScore();
            saveProgress();
            flagInput.value = FLAG3;
            flagInput.disabled = false;
            flagInput.style.opacity = '1';
            result.innerHTML   = `✅ Login berhasil! Anda adalah admin! 🎉<br>Flag: ${FLAG3}`;
            result.className   = 'result success';
            usernameInput.disabled = true;
            passwordInput.disabled = true;
            checkVictory();
        } else {
            result.innerHTML = '✅ Flag sudah ditemukan sebelumnya!';
            result.className = 'result success';
        }
    } else {
        if (users[username] && users[username] === password) {
            result.innerHTML = '✅ Login berhasil! Tapi Anda bukan admin. Coba gunakan SQL injection!';
            result.className = 'result info';
            flagInput.value = '';
        } else {
            result.innerHTML = '❌ Login gagal! Coba gunakan SQL injection atau gunakan akun admin dengan password yang benar.';
            result.className = 'result error';
        }
    }
}

// ==================== VICTORY ====================
function checkVictory() {
    if (state.flagsFound === 3) {
        document.getElementById('victoryModal').classList.remove('hidden');
        document.getElementById('victoryMessage').innerHTML = `
            <p>🌟 Anda telah menyelesaikan semua tantangan!</p>
            <p>👑 Selamat menjadi <strong>CTF Master</strong>!</p>
            ${state.currentUser ? `<p>🏅 User: <strong>${state.currentUser}</strong></p>` : ''}
            <p>💡 Progress Anda telah tersimpan di database!</p>`;
    }
}

function resetGame() {
    state.flags      = { 1: false, 2: false, 3: false };
    state.flagsFound = 0;

    document.getElementById('victoryModal').classList.add('hidden');

    for (let i = 1; i <= 3; i++) {
        const input  = document.getElementById(`flag${i}`);
        const result = document.getElementById(`result${i}`);
        if (input)  { input.disabled = false; input.style.opacity = '1'; input.value = ''; }
        if (result) { result.innerHTML = ''; result.className = 'result'; }
    }

    const un = document.getElementById('username');
    const pw = document.getElementById('password');
    if (un) { un.disabled = false; un.value = 'user'; }
    if (pw) { pw.disabled = false; pw.value = 'pass'; }

    renderProgress();
    if (state.currentUser) saveProgress();

    console.log('%c🔄 Game telah di-reset!', 'font-size: 16px; color: #ff6b6b;');
}

// ==================== KEYBOARD ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAuthModal();
        closeLeaderboard();
        document.getElementById('victoryModal').classList.add('hidden');
    }
});

document.addEventListener('click', (e) => {
    const authModal       = document.getElementById('authModal');
    const victoryModal    = document.getElementById('victoryModal');
    const leaderboardModal = document.getElementById('leaderboardModal');

    if (e.target === authModal)        closeAuthModal();
    if (e.target === victoryModal)     victoryModal.classList.add('hidden');
    if (e.target === leaderboardModal) closeLeaderboard();
});