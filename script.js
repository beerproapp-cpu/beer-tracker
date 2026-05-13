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

    // --- Choice A: Admin Logging In (Keep this!) ---
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
            
            // Admin "Check & Join" logic
            const { data: existingEntry } = await sb.from('leaderboard')
                .select('id').eq('name', adminName).eq('league_id', activeLeagueId);

            if (!existingEntry || existingEntry.length === 0) {
                await sb.from('leaderboard').insert([{ name: adminName, beers: 0, league_id: activeLeagueId }]);
            }

            localStorage.setItem('beerProName', adminName);
            localStorage.setItem('beerProLeague', activeLeagueId);
        }
        setTimeout(() => { location.reload(); }, 300); 
        return;
    }

    // --- Choice B: Casual Mate joining (The new "Duplicate-Proof" version) ---
    if (leagueId && userName) {
        const { data: existingUser } = await sb.from('leaderboard')
            .select('name')
            .eq('league_id', leagueId)
            .eq('name', userName)
            .maybeSingle();

        if (!existingUser) {
            const { error: insertError } = await sb.from('leaderboard').insert([
                { name: userName, beers: 0, league_id: leagueId }
            ]);
            if (insertError) return alert("Error joining league. Check your code!");
        }
        
        localStorage.setItem('beerProName', userName);
        localStorage.setItem('beerProLeague', leagueId);
        location.reload();
        return;
    }

    alert("Enter League Code + Name to join, OR Email + Password to login.");
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

// 5.1 FETCH & RENDER (The logic that was missing!)
async function fetchLeaderboard() {
    const leagueId = localStorage.getItem('beerProLeague');
    if (!leagueId) return;

    // Fetch League Name
    const { data: leagueData } = await sb.from('leagues')
        .select('league_name').eq('id', leagueId).single();
    
    if (leagueData) {
        document.getElementById('league-display-name').innerText = leagueData.league_name;
    }

    // Fetch Players
    const { data, error } = await sb.from('leaderboard')
        .select('*').eq('league_id', leagueId).order('beers', { ascending: false });

    if (error) return;

    // DRAW THE TABLE
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

// 6. UI HELPERS
window.toggleModal = (show) => document.getElementById('info-modal').classList.toggle('active', show);

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
        if (savedLeague) fetchLeaderboard();
    } else {
        authOverlay.style.display = 'flex';
    }
}

init();