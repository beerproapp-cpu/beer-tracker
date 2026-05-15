// 0. SUPABASE SETUP
const SB_URL = 'https://wsghvaxgtzpimutbgjcd.supabase.co'; 
const SB_KEY = 'sb_publishable_SD733lMkLs-Gd4fLjgMH1w_jun5brFl'; 

const sb = supabase.createClient(SB_URL, SB_KEY);

document.addEventListener("touchstart", function() {}, true);

// 1. AUTH TAB TOGGLING
window.showAuthTab = function(tab) {
    document.getElementById('join-section').style.display = tab === 'join' ? 'block' : 'none';
    document.getElementById('create-section').style.display = tab === 'create' ? 'block' : 'none';
    document.getElementById('tab-join').classList.toggle('active', tab === 'join');
    document.getElementById('tab-create').classList.toggle('active', tab === 'create');
};

// 2. POWER USER: CREATE ACCOUNT
window.handleEmailSignUp = async function() {
    const name = document.getElementById('signup-name-new').value.trim();
    const email = document.getElementById('signup-email-new').value.trim();
    const password = document.getElementById('signup-password-new').value.trim();
    
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

// 3. UNIVERSAL SIGN IN
window.handleAuthAction = async function() {
    const email = document.getElementById('login-email-admin').value.trim();
    const password = document.getElementById('login-password-admin').value.trim();
    const leagueId = document.getElementById('join-league-id').value.trim();
    const userName = document.getElementById('join-user-name').value.trim();

    // ==========================================
    // PATH 1: Admin Email/Password Login
    // ==========================================
    if (email && password) {
        const { data: authData, error: authError } = await sb.auth.signInWithPassword({ email, password });
        if (authError) return alert("Login Failed: " + authError.message);

        const user = authData.user;
        const adminName = user.user_metadata?.display_name || user.email.split('@')[0];

        const { data: leagues } = await sb.from('leagues')
            .select('id')
            .eq('creator_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (leagues && leagues.length > 0) {
            const activeLeagueId = leagues[0].id;
            
            // Check if admin already has a leaderboard slot (and track active status)
            const { data: existingEntry } = await sb.from('leaderboard')
                .select('id, is_active')
                .eq('name', adminName)
                .eq('league_id', activeLeagueId)
                .maybeSingle();

            if (!existingEntry) {
                // Brand new admin entry
                await sb.from('leaderboard').insert([{ name: adminName, beers: 0, league_id: activeLeagueId, is_active: true }]);
            } else if (!existingEntry.is_active) {
                // Reactivate admin if they previously toggled themselves off
                await sb.from('leaderboard').update({ is_active: true }).eq('id', existingEntry.id);
            }

            localStorage.setItem('beerProName', adminName);
            localStorage.setItem('beerProLeague', activeLeagueId);
        }
        setTimeout(() => { location.reload(); }, 300); 
        return;
    }

    // ==========================================
    // PATH 2: Casual Mate Joining via Code & Name
    // ==========================================
    if (leagueId && userName) {
        // 1. Verify the league exists and isn't deleted
        const { data: leagueExists, error } = await sb.from('leagues')
            .select('id, status')
            .eq('id', leagueId)
            .maybeSingle();
            
        if (error || !leagueExists || leagueExists.status === 'deleted') {
            return alert("League code not found!");
        }

        // 2. Check if this player has historical data in this league
        const { data: existingUser } = await sb.from('leaderboard')
            .select('id, is_active')
            .eq('league_id', leagueId)
            .eq('name', userName)
            .maybeSingle();

        if (!existingUser) {
            // Fresh registration
            const { error: insertError } = await sb.from('leaderboard').insert([
                { name: userName, beers: 0, league_id: leagueId, is_active: true }
            ]);
            if (insertError) return alert("Error joining league!");
        } else if (!existingUser.is_active) {
            // Returning user re-entering code -> flip active switch back on
            await sb.from('leaderboard').update({ is_active: true }).eq('id', existingUser.id);
        }
        
        // 3. Save to local storage and load the app interface
        localStorage.setItem('beerProName', userName);
        localStorage.setItem('beerProLeague', leagueId);
        
        setTimeout(() => { location.reload(); }, 300);
        return;
    }

    // Fallback error fallback if they clicked without filling things out
    alert("Please enter either Admin credentials OR a League Code & Name.");
};
// 4. CREATE LEAGUE
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
        { name: adminName, beers: 0, league_id: newID }
    ]);

    document.getElementById('generated-id-text').innerText = newID;
    localStorage.setItem('beerProName', adminName);
    localStorage.setItem('beerProLeague', newID);
    
    window.toggleModal(false);
    document.getElementById('success-modal').classList.add('active');
};

// 4.1 COPY TO CLIPBOARD
window.copyLeagueID = function() {
    const idText = document.getElementById('generated-id-text').innerText;
    const btn = document.getElementById('copy-btn');
    navigator.clipboard.writeText(idText).then(() => {
        const originalText = btn.innerText;
        btn.innerText = "COPIED TO CLIPBOARD! ✅";
        btn.classList.add('copied');
        setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.remove('copied');
        }, 2000);
    });
};

// 5. CORE BEER LOGIC
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

window.handleLeaveLeague = async function() {
    const name = localStorage.getItem('beerProName');
    const leagueId = localStorage.getItem('beerProLeague');
    if (!name || !leagueId) return;

    const confirmLeave = confirm(
        "Are you sure you want to leave this league?\n\n" +
        "You will stop showing up on this live leaderboard, but your pints will remain completely safe in your Career Stats profile!"
    );
    if (!confirmLeave) return;

    // 1. Flip active status flag to false in the DB
    const { error } = await sb.from('leaderboard')
        .update({ is_active: false })
        .eq('name', name)
        .eq('league_id', leagueId);

    if (error) {
        return alert("Error leaving session: " + error.message);
    }

    // 2. Erase the session identifier memory layer locally
    localStorage.removeItem('beerProLeague');
    
    alert("Session exited. 🚪");
    location.reload();
};

// 5.1 FETCH & RENDER
async function fetchLeaderboard() {
    const leagueId = localStorage.getItem('beerProLeague');
    if (!leagueId) return;

    const { data: leagueData } = await sb.from('leagues')
        .select('league_name, creator_id, status').eq('id', leagueId).single();
    
    if (leagueData) {
        document.getElementById('league-display-name').innerText = leagueData.league_name;
        document.getElementById('league-id-display').innerText = `ID: ${leagueId}`;

        const { data: { user } } = await sb.auth.getUser();
        const adminActionsDiv = document.getElementById('admin-actions');
        
        if (user && leagueData.creator_id === user.id && (leagueData.status || 'active') === 'active') {
            adminActionsDiv.style.display = 'flex'; 
        } else {
            adminActionsDiv.style.display = 'none'; 
        }

        if (leagueData.status === 'archived') {
            document.getElementById('league-display-name').innerText += " (ARCHIVED) 📦";
            const mainButtons = document.querySelectorAll('.add-beer-btn, .minus-beer-btn');
            mainButtons.forEach(btn => btn.style.pointerEvents = 'none');
        } else {
            const mainButtons = document.querySelectorAll('.add-beer-btn, .minus-beer-btn');
            mainButtons.forEach(btn => btn.style.pointerEvents = 'auto');
        }
    }

    const { data, error } = await sb.from('leaderboard')
        .select('*')
        .eq('league_id', leagueId)
        .order('beers', { ascending: false });

    if (error) return;

    const tableBody = document.getElementById('leaderboard-body');
    if (tableBody) {
        tableBody.innerHTML = data.map((p, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${p.name}${i === 0 ? ' 🏆' : ''}</strong></td>
                <td>${p.beers}</td>
            </tr>`).join('');
    }
}

// ADMIN PANEL BUTTON ACTIONS
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

// 6. UI HELPERS
window.toggleModal = (show) => {
    document.getElementById('info-modal').classList.toggle('active', show);
    if (show) {
        loadMyLeagues(); 
    }
};

window.handleLogout = async () => {
    await sb.auth.signOut();
    localStorage.clear();
    location.reload();
};

// 7. STARTUP
async function init() {
    const { data: { user } } = await sb.auth.getUser();
    const savedName = localStorage.getItem('beerProName');
    const savedLeague = localStorage.getItem('beerProLeague');
    const authOverlay = document.getElementById('auth-overlay');
    
    if (user || (savedName && savedLeague)) {
        authOverlay.style.display = 'none';
        const finalName = savedName || user?.user_metadata?.display_name || user?.email?.split('@')[0];
        document.getElementById('display-name').innerText = finalName;
        
        const statsIcon = document.getElementById('stats-icon');
        if (statsIcon) statsIcon.style.display = 'block';

        if (savedLeague) fetchLeaderboard();
    } else {
        authOverlay.style.display = 'flex';
    }
}

window.loadMyLeagues = async function() {
    const { data: { user } } = await sb.auth.getUser();
    const myName = localStorage.getItem('beerProName');
    if (!myName) return;

    // ADDED FILTER: .eq('is_active', true) ensures left leagues don't display
    const { data: participations, error } = await sb.from('leaderboard')
        .select(`
            league_id,
            leagues ( id, league_name, status )
        `)
        .eq('name', myName)
        .eq('is_active', true);

    const manageSection = document.getElementById('admin-manage-section');
    const listContainer = document.getElementById('my-leagues-list');

    if (participations && participations.length > 0) {
        manageSection.style.display = 'block';
        
        listContainer.innerHTML = participations.map(p => {
            const l = p.leagues;
            if (!l || l.status === 'deleted') return ''; 
            return `
                <button onclick="switchLeague('${l.id}')" class="minus-beer-btn" style="width: 100%; text-align: left; padding-left: 15px; color: white; border-color: #333; margin-bottom: 5px;">
                    ${l.league_name} ${l.status === 'archived' ? '📦' : ''}
                </button>
            `;
        }).join('');
    } else {
        manageSection.style.display = 'none';
    }
};
window.switchLeague = function(leagueId) {
    localStorage.setItem('beerProLeague', leagueId);
    location.reload(); 
};

window.joinViaModal = async function() {
    const code = document.getElementById('modal-join-id').value.trim();
    if (!code) return alert("Please enter a code!");

    const myName = localStorage.getItem('beerProName');
    if (!myName) return alert("Error: User name not found.");

    const { data: leagueExists, error } = await sb.from('leagues').select('id, status').eq('id', code).maybeSingle();
    if (error || !leagueExists || leagueExists.status === 'deleted') return alert("League code not found!");

    // Query both id and current active status
    const { data: existing } = await sb.from('leaderboard')
        .select('id, is_active').eq('name', myName).eq('league_id', code).maybeSingle();

    if (!existing) {
        // Brand new player entry
        await sb.from('leaderboard').insert([{ name: myName, beers: 0, league_id: code, is_active: true }]);
    } else if (!existing.is_active) {
        // Welcoming back a returning player who previously left
        await sb.from('leaderboard').update({ is_active: true }).eq('id', existing.id);
    }

    localStorage.setItem('beerProLeague', code);
    location.reload();
};

window.showPersonalStats = async function() {
    const myName = localStorage.getItem('beerProName');
    const currentLeagueId = localStorage.getItem('beerProLeague');
    if (!myName) return;

    // 1. Fetch all the data we need (beers, league ids, and active status)
    const { data, error } = await sb.from('leaderboard')
        .select('league_id, beers, is_active')
        .eq('name', myName);
        
    if (error) return console.error(error);

    // 2. Set up our counters
    let currentBeers = 0;
    let activeLeaguesCount = 0;
    let totalBeers = 0;
    let totalLeagues = data ? data.length : 0;

    // 3. Loop through your rows once to calculate everything perfectly
    if (data && data.length > 0) {
        data.forEach(row => {
            // Add to total historic beers
            totalBeers += (row.beers || 0);

            // Check if they are currently an active member of this league
            if (row.is_active === true) {
                activeLeaguesCount++;
            }

            // Check if this row belongs to the specific league they are looking at right now
            if (currentLeagueId && row.league_id === currentLeagueId) {
                currentBeers = row.beers || 0;
            }
        });
    }

    // 4. Safely push the calculated data into your custom UI layout IDs
    document.getElementById('stat-current-beers').innerText = currentBeers;
    document.getElementById('stat-current-leagues').innerText = activeLeaguesCount;    
    document.getElementById('stat-total-beers').innerText = totalBeers;
    document.getElementById('stat-total-leagues').innerText = totalLeagues;

    // 5. Fire open the modal animations!
    document.getElementById('stats-modal').classList.add('active');
};
// Fire the initialization engine on run
init();