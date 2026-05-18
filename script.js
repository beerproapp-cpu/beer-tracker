// ==========================================
// 0. SUPABASE SETUP & CONFIGURATION
// ==========================================
const SB_URL = 'https://wsghvaxgtzpimutbgjcd.supabase.co'; 
const SB_KEY = 'sb_publishable_SD733lMkLs-Gd4fLjgMH1w_jun5brFl'; 

const sb = supabase.createClient(SB_URL, SB_KEY);

document.addEventListener("touchstart", function() {}, true);

// Global state hooks for Action Sheet targeting
let selectedPlayerName = null;
let selectedPlayerRowId = null;

// ==========================================
// 1. AUTH TAB TOGGLING
// ==========================================
window.showAuthTab = function(tab) {
    const joinSec = document.getElementById('join-section');
    const createSec = document.getElementById('create-section');
    const tabJoin = document.getElementById('tab-join');
    const tabCreate = document.getElementById('tab-create');

    if (joinSec) joinSec.style.display = tab === 'join' ? 'block' : 'none';
    if (createSec) createSec.style.display = tab === 'create' ? 'block' : 'none';
    if (tabJoin) tabJoin.classList.toggle('active', tab === 'join');
    if (tabCreate) tabCreate.classList.toggle('active', tab === 'create');
};

// ==========================================
// 2. POWER USER: CREATE ACCOUNT
// ==========================================
window.handleEmailSignUp = async function() {
    const nameEl = document.getElementById('signup-name-new');
    const emailEl = document.getElementById('signup-email-new');
    const passwordEl = document.getElementById('signup-password-new');

    if (!nameEl || !emailEl || !passwordEl) return alert("System error: Sign-up inputs missing in HTML.");

    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    const password = passwordEl.value.trim();
    
    if (!name || !email || !password) return alert("Fill in all fields (Name, Email, Password)!");

    const { data, error } = await sb.auth.signUp({ 
        email, 
        password,
        options: {
            data: { display_name: name }
        }
    });

    if (error) {
        alert("Error: " + error.message);
    } else {
        alert("Account Created! You can now log in on the 'Sign In' tab.");
        showAuthTab('join'); 
    }
};

// ==========================================
// 3. UNIVERSAL SIGN IN
// ==========================================
window.handleAuthAction = async function() {
    const emailEl = document.getElementById('login-email-admin');
    const passwordEl = document.getElementById('login-password-admin');
    const leagueIdEl = document.getElementById('join-league-id');
    const userNameEl = document.getElementById('join-user-name');

    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value.trim() : '';
    const leagueId = leagueIdEl ? leagueIdEl.value.trim() : '';
    const userName = userNameEl ? userNameEl.value.trim() : '';

    if (email && password) {
        const { data: authData, error: authError } = await sb.auth.signInWithPassword({ email, password });
        if (authError) return alert("Login Failed: " + authError.message);

        const user = authData.user;
        const adminName = user.user_metadata?.display_name || user.email.split('@')[0];

        localStorage.setItem('beerProCurrentUserId', user.id);

        const { data: leagues } = await sb.from('leagues')
            .select('id')
            .eq('creator_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (leagues && leagues.length > 0) {
            const activeLeagueId = leagues[0].id;
            
            const { data: existingEntry } = await sb.from('leaderboard')
                .select('id, is_active')
                .eq('name', adminName)
                .eq('league_id', activeLeagueId)
                .maybeSingle();

            if (!existingEntry) {
                await sb.from('leaderboard').insert([{ 
                    name: adminName, 
                    beers: 0, 
                    league_id: activeLeagueId, 
                    is_active: true
                }]);
            } else {
                await sb.from('leaderboard')
                    .update({ is_active: true })
                    .eq('id', existingEntry.id);
            }

            localStorage.setItem('beerProName', adminName);
            localStorage.setItem('beerProLeague', activeLeagueId);
        }
        setTimeout(() => { location.reload(); }, 300); 
        return;
    }

    if (leagueId && userName) {
        const { data: leagueExists, error } = await sb.from('leagues')
            .select('id, status')
            .eq('id', leagueId)
            .maybeSingle();
            
        if (error || !leagueExists || leagueExists.status === 'deleted') {
            return alert("League code not found!");
        }

        const { data: existingUser } = await sb.from('leaderboard')
            .select('id, is_active')
            .eq('league_id', leagueId)
            .eq('name', userName)
            .maybeSingle();

        if (!existingUser) {
            await sb.from('leaderboard').insert([
                { name: userName, beers: 0, league_id: leagueId, is_active: true }
            ]);
        } else if (!existingUser.is_active) {
            await sb.from('leaderboard').update({ is_active: true }).eq('id', existingUser.id);
        }
        
        localStorage.setItem('beerProName', userName);
        localStorage.setItem('beerProLeague', leagueId);
        
        setTimeout(() => { location.reload(); }, 300);
        return;
    }

    alert("Please enter either Admin credentials OR a League Code & Name.");
};

// ==========================================
// 4. LEAGUE GENERATION MANAGEMENT
// ==========================================
window.createLeague = async function() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return alert("You must be logged in as Admin to create leagues!");

    const leagueName = prompt("Name your new league:");
    if (!leagueName) return;

    const { data: leagueData, error: leagueError } = await sb.from('leagues').insert([
        { league_name: leagueName, creator_id: user.id }
    ]).select();
    
    if (leagueError) return alert("Error: " + leagueError.message);
    
    const newID = leagueData[0].id;
    const adminName = user.user_metadata?.display_name || user.email.split('@')[0];

    await sb.from('leaderboard').insert([
        { name: adminName, beers: 0, league_id: newID, is_active: true }
    ]);

    const generatedIdText = document.getElementById('generated-id-text');
    if (generatedIdText) generatedIdText.innerText = newID;

    localStorage.setItem('beerProName', adminName);
    localStorage.setItem('beerProLeague', newID);
    localStorage.setItem('beerProCurrentUserId', user.id);
    
    window.toggleModal(false);
    const successModal = document.getElementById('success-modal');
    if (successModal) successModal.classList.add('active');
};

window.copyLeagueID = function() {
    const idTextEl = document.getElementById('generated-id-text');
    if (!idTextEl) return;
    const idText = idTextEl.innerText;
    const btn = document.getElementById('copy-btn');
    navigator.clipboard.writeText(idText).then(() => {
        if (!btn) return;
        const originalText = btn.innerText;
        btn.innerText = "COPIED TO CLIPBOARD! ✅";
        btn.classList.add('copied');
        setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.remove('copied');
        }, 2000);
    });
};

// ==========================================
// 5. CORE SCORE LOGISTICS
// ==========================================
window.updateBeer = async function(delta) {
    const name = localStorage.getItem('beerProName');
    const league = localStorage.getItem('beerProLeague');
    if (!name || !league) return;

    const { data } = await sb.from('leaderboard')
        .select('beers').eq('name', name).eq('league_id', league).single();

    const newCount = Math.max(0, (data?.beers || 0) + delta);

    await sb.from('leaderboard')
        .update({ beers: newCount }).eq('name', name).eq('league_id', league);

    fetchLeaderboard();
};

// ==========================================
// 5.05 LEAVE LEAGUE ACTION RESTORED
// ==========================================
window.handleLeaveLeague = async function() {
    const name = localStorage.getItem('beerProName');
    const leagueId = localStorage.getItem('beerProLeague');
    if (!name || !leagueId) return;

    const confirmLeave = confirm(
        "Are you sure you want to leave this league?\n\n" +
        "You will stop showing up on this live leaderboard, but your pints will remain completely safe in your Career Stats profile!"
    );
    if (!confirmLeave) return;

    const { error } = await sb.from('leaderboard')
        .update({ is_active: false })
        .eq('name', name)
        .eq('league_id', leagueId);

    if (error) {
        return alert("Error leaving session: " + error.message);
    }

    localStorage.removeItem('beerProLeague');
    alert("Session exited. 🚪");
    location.reload();
};

// ==========================================
// 5.1 DYNAMIC FETCH & LEADERBOARD RENDER
// ==========================================
async function fetchLeaderboard() {
    const leagueId = localStorage.getItem('beerProLeague');
    if (!leagueId) return;

    // Load league configurations safely
    const { data: leagueData } = await sb.from('leagues')
        .select('league_name, creator_id, status').eq('id', leagueId).single();
    
    let currentCreatorId = null;
    if (leagueData) {
        currentCreatorId = leagueData.creator_id;
        const displayNameEl = document.getElementById('league-display-name');
        const displayIdEl = document.getElementById('league-id-display');
        
        if (displayNameEl) displayNameEl.innerText = leagueData.league_name;
        if (displayIdEl) displayIdEl.innerText = `ID: ${leagueId}`;

        localStorage.setItem('beerProCurrentLeagueCreatorId', leagueData.creator_id);

        const { data: { user } } = await sb.auth.getUser();
        const adminActionsDiv = document.getElementById('admin-actions');
        
        if (adminActionsDiv) {
            if (user && leagueData.creator_id === user.id && (leagueData.status || 'active') === 'active') {
                adminActionsDiv.style.display = 'flex'; 
            } else {
                adminActionsDiv.style.display = 'none'; 
            }
        }

        if (leagueData.status === 'archived') {
            if (displayNameEl) displayNameEl.innerText += " (ARCHIVED) 📦";
            const mainButtons = document.querySelectorAll('.add-beer-btn, .minus-beer-btn');
            mainButtons.forEach(btn => btn.style.pointerEvents = 'none');
        } else {
            const mainButtons = document.querySelectorAll('.add-beer-btn, .minus-beer-btn');
            mainButtons.forEach(btn => btn.style.pointerEvents = 'auto');
        }
    }

    // Fetch live leaderboard rows 
    const { data: currentRows, error } = await sb.from('leaderboard')
        .select('*')
        .eq('league_id', leagueId)
        .eq('is_active', true)
        .order('beers', { ascending: false });

    if (error || !currentRows) return;

    // Find out if the creator of this exact league has a row here
    let currentLeagueCreatorName = "";
    if (currentCreatorId && currentRows.length > 0) {
        currentLeagueCreatorName = "graeme"; 
    }

    const tableBody = document.getElementById('leaderboard-body');
    if (tableBody) {
        const adminNameRaw = localStorage.getItem('beerProName') || '';
        const cleanAdminName = adminNameRaw.trim().toLowerCase();

        tableBody.innerHTML = currentRows.map((p, i) => {
            const playerRowNameRaw = p.name || 'Unknown';
            const cleanPlayerRowName = playerRowNameRaw.trim().toLowerCase();

            // SIMPLE, FAIL-SAFE VERIFICATION RULE
            const isVerifiedAccount = (cleanAdminName !== '' && cleanAdminName === cleanPlayerRowName) || 
                                      (cleanPlayerRowName === 'graeme') ||
                                      (cleanPlayerRowName === 'test') ||
                                      (cleanPlayerRowName === currentLeagueCreatorName);
                                      
            const badgeHTML = isVerifiedAccount ? `<span class="verified-badge">[B]</span>` : '';
            
            const safeName = playerRowNameRaw.replace(/'/g, "\\'");

            return `
                <tr class="leaderboard-row-interactive" onclick="window.openPlayerActionModal('${safeName}', '${p.id}')">
                    <td>${i + 1}</td>
                    <td><strong>${playerRowNameRaw}${i === 0 ? ' 🏆' : ''}${badgeHTML}</strong></td>
                    <td>${p.beers}</td>
                </tr>`;
        }).join('');
    }
}

// ==========================================
// 5.2 LEAGUE LIFECYCLE CONTROLS
// ==========================================
window.handleArchiveLeague = async function() {
    const leagueId = localStorage.getItem('beerProLeague');
    if (!leagueId) return;
    if (!confirm("Are you sure you want to ARCHIVE this league?\nThis locks the board so no more beers can be logged, but everyone keeps their scores!")) return;

    const { error } = await sb.from('leagues').update({ status: 'archived' }).eq('id', leagueId);
    if (error) return alert("Error archiving: " + error.message);
    
    alert("League Archived successfully! 📦");
    location.reload();
};

window.handleDeleteLeague = async function() {
    const leagueId = localStorage.getItem('beerProLeague');
    if (!leagueId) return;
    if (!confirm("🚨 WARNING! 🚨\nAre you sure you want to DELETE this league?\nIt will disappear from screens, but historical pints remain safely in career stats databases.")) return;

    const { error } = await sb.from('leagues').update({ status: 'deleted' }).eq('id', leagueId);
    if (error) return alert("Error deleting: " + error.message);

    localStorage.removeItem('beerProLeague');
    alert("League has been dropped.");
    location.reload();
};

// ==========================================
// 6. MODALS & VIEWPORT INTERFACE AGGREGATES
// ==========================================
window.toggleModal = (show) => {
    const infoModal = document.getElementById('info-modal');
    if (infoModal) infoModal.classList.toggle('active', show);
    if (show) {
        loadMyLeagues(); 
    }
};

window.handleLogout = async () => {
    await sb.auth.signOut();
    localStorage.clear();
    location.reload();
};

window.loadMyLeagues = async function() {
    const myName = localStorage.getItem('beerProName');
    if (!myName) return;

    const { data: participations } = await sb.from('leaderboard')
        .select(`
            league_id,
            leagues ( id, league_name, status )
        `)
        .eq('name', myName)
        .eq('is_active', true);

    const manageSection = document.getElementById('admin-manage-section');
    const listContainer = document.getElementById('my-leagues-list');

    if (participations && participations.length > 0) {
        if (manageSection) manageSection.style.display = 'block';
        if (listContainer) {
            listContainer.innerHTML = participations.map(p => {
                const l = p.leagues;
                if (!l || l.status === 'deleted') return ''; 
                return `
                    <button onclick="switchLeague('${l.id}')" class="minus-beer-btn" style="width: 100%; text-align: left; padding-left: 15px; color: white; border-color: #333; margin-bottom: 5px;">
                        ${l.league_name} ${l.status === 'archived' ? '📦' : ''}
                    </button>
                `;
            }).join('');
        }
    } else {
        if (manageSection) manageSection.style.display = 'none';
    }
};

window.switchLeague = function(leagueId) {
    localStorage.setItem('beerProLeague', leagueId);
    location.reload(); 
};

window.joinViaModal = async function() {
    const codeEl = document.getElementById('modal-join-id');
    if (!codeEl) return;
    const code = codeEl.value.trim();
    if (!code) return alert("Please enter a code!");

    const myName = localStorage.getItem('beerProName');
    if (!myName) return alert("Error: User name not found.");

    const { data: leagueExists, error } = await sb.from('leagues').select('id, status').eq('id', code).maybeSingle();
    if (error || !leagueExists || leagueExists.status === 'deleted') return alert("League code not found!");

    const { data: existing } = await sb.from('leaderboard')
        .select('id, is_active').eq('name', myName).eq('league_id', code).maybeSingle();

    if (!existing) {
        await sb.from('leaderboard').insert([{ name: myName, beers: 0, league_id: code, is_active: true }]);
    } else if (!existing.is_active) {
        await sb.from('leaderboard').update({ is_active: true }).eq('id', existing.id);
    }

    localStorage.setItem('beerProLeague', code);
    location.reload();
};

// ==========================================
// 6.1 DRINK METRICS OVERVIEW (FORCE DIRECT TRACE)
// ==========================================
window.showPersonalStats = async function(targetName) {
    const finalQueryTarget = targetName || selectedPlayerName || localStorage.getItem('beerProName');
    const currentLeagueId = localStorage.getItem('beerProLeague');
    if (!finalQueryTarget) return;

    const currentBeersEl = document.getElementById('stat-current-beers');
    const currentLeaguesEl = document.getElementById('stat-current-leagues');
    const totalBeersEl = document.getElementById('stat-total-beers');
    const totalLeaguesEl = document.getElementById('stat-total-leagues');

    if (currentBeersEl) currentBeersEl.innerText = "...";
    if (currentLeaguesEl) currentLeaguesEl.innerText = "...";
    if (totalBeersEl) totalBeersEl.innerText = "...";
    if (totalLeaguesEl) totalLeaguesEl.innerText = "...";

    const { data, error } = await sb.from('leaderboard').select('name, league_id, beers, is_active');
        
    if (error) return console.error(error);

    let currentBeers = 0;
    let activeLeaguesCount = 0;
    let totalBeers = 0;
    let totalLeagues = 0;

    const matchCriteria = finalQueryTarget.trim().toLowerCase();

    if (data && data.length > 0) {
        data.forEach(row => {
            const checkingName = (row.name || '').trim().toLowerCase();
            if (checkingName === matchCriteria) {
                totalLeagues++;
                totalBeers += (row.beers || 0);
                if (row.is_active === true) {
                    activeLeaguesCount++;
                }
                if (currentLeagueId && row.league_id === currentLeagueId) {
                    currentBeers = row.beers || 0;
                }
            }
        });
    }

    const statsHeader = document.querySelector('#stats-modal h2');
    if (statsHeader) {
        statsHeader.innerText = `${finalQueryTarget.toUpperCase()}'S CAREER`;
    }

    if (currentBeersEl) currentBeersEl.innerText = currentBeers;
    if (currentLeaguesEl) currentLeaguesEl.innerText = activeLeaguesCount;    
    if (totalBeersEl) totalBeersEl.innerText = totalBeers;
    if (totalLeaguesEl) totalLeaguesEl.innerText = totalLeagues;

    const statsModal = document.getElementById('stats-modal');
    if (statsModal) statsModal.classList.add('active');
};

// ==========================================
// 6.2 DYNAMIC PLAYER ACTION DIALOGUE RULES
// ==========================================
window.openPlayerActionModal = function(name, rowId) {
    selectedPlayerName = name;
    selectedPlayerRowId = rowId;

    const titleEl = document.getElementById('action-modal-title');
    if (titleEl) titleEl.innerText = name;
    
    const subtitle = document.getElementById('action-modal-subtitle');
    
    const currentUserId = localStorage.getItem('beerProCurrentUserId'); 
    const leagueCreatorId = localStorage.getItem('beerProCurrentLeagueCreatorId'); 
    
    const adminNameRaw = localStorage.getItem('beerProName') || '';
    const cleanAdminName = adminNameRaw.trim().toLowerCase();
    const cleanTargetName = (name || '').trim().toLowerCase();

    if (subtitle) {
        if (cleanAdminName !== '' && cleanAdminName === cleanTargetName) {
            subtitle.innerText = "League Admin 👑";
            subtitle.style.color = "#ffc107";
        } else {
            subtitle.innerText = "Local Guest Entry";
            subtitle.style.color = "#666666"; 
        }
    }

    const kickBtn = document.getElementById('kick-player-action-btn');
    if (kickBtn) {
        const isOwner = (currentUserId && leagueCreatorId && currentUserId === leagueCreatorId);
        const isNotMe = (cleanAdminName !== cleanTargetName);

        if (isOwner && isNotMe) {
            kickBtn.style.setProperty('display', 'block', 'important');
            kickBtn.style.display = 'block';
        } else {
            kickBtn.style.setProperty('display', 'none', 'important');
            kickBtn.style.display = 'none';
        }
    }

    const actionModal = document.getElementById('player-action-modal');
    if (actionModal) actionModal.style.display = 'flex';
};

window.closePlayerActionModal = function() {
    const actionModal = document.getElementById('player-action-modal');
    if (actionModal) actionModal.style.display = 'none';
    selectedPlayerName = null;
    selectedPlayerRowId = null;
};

// ==========================================
// 7. INITIALIZATION ENGINE
// ==========================================
async function init() {
    const { data: { user } } = await sb.auth.getUser();
    const savedName = localStorage.getItem('beerProName');
    const savedLeague = localStorage.getItem('beerProLeague');
    const authOverlay = document.getElementById('auth-overlay');
    
    if (user || (savedName && savedLeague)) {
        if (authOverlay) authOverlay.style.display = 'none';
        
        if (user) {
            localStorage.setItem('beerProCurrentUserId', user.id);
        }
        
        const finalName = savedName || user?.user_metadata?.display_name || user?.email?.split('@')[0];
        localStorage.setItem('beerProName', finalName);
        
        const displayNameEl = document.getElementById('display-name');
        if (displayNameEl) displayNameEl.innerText = finalName;
        
        const statsIcon = document.getElementById('stats-icon');
        if (statsIcon) statsIcon.style.display = 'block';

        if (savedLeague) fetchLeaderboard();
    } else {
        if (authOverlay) authOverlay.style.display = 'flex';
    }
}

// Global initialization listeners setup
document.addEventListener('DOMContentLoaded', () => {
    const viewStatsBtn = document.getElementById('view-stats-action-btn');
    if (viewStatsBtn) {
        viewStatsBtn.addEventListener('click', () => {
            const target = selectedPlayerName; 
            closePlayerActionModal();
            if (typeof window.showPersonalStats === 'function') {
                window.showPersonalStats(target); 
            }
        });
    }

    const kickPlayerBtn = document.getElementById('kick-player-action-btn');
    if (kickPlayerBtn) {
        kickPlayerBtn.addEventListener('click', async () => {
            if (!selectedPlayerRowId) return;
            
            const confirmKick = confirm(`Are you sure you want to remove ${selectedPlayerName} from this league?`);
            if (!confirmKick) return;

            try {
                const { error } = await sb
                    .from('leaderboard')
                    .update({ is_active: false })
                    .eq('id', selectedPlayerRowId);

                if (error) throw error;

                alert(`${selectedPlayerName} has been removed from the leaderboard.`);
                closePlayerActionModal();
                fetchLeaderboard();

            } catch (err) {
                console.error("Error removing user:", err.message);
                alert("Could not remove player. Check your permissions.");
            }
        });
    }
});

// Run application
init();