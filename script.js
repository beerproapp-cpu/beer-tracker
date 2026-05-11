// 1. SUPABASE CONNECTION
const supabaseUrl = 'https://wsghvaxgtzpimutbgjcd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzZ2h2YXhndHpwaW11dGJnamNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NzQyMDksImV4cCI6MjA5NDA1MDIwOX0.RV8El3oScAjBJhSCjUG5h3sr3kRtIhI20Pp2eD65rbY';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// 2. THE JOIN LOGIC (For you and your mates)
window.joinTracker = async function() {
  const nameInput = document.getElementById('user-name').value.trim();
  if (!nameInput) return alert("Enter your name!");

  // Check if name exists in Supabase, if not, create it
  const { data } = await _supabase.from('leaderboard').select('name').eq('name', nameInput);
  
  if (data && data.length === 0) {
    await _supabase.from('leaderboard').insert([{ name: nameInput, beers: 0 }]);
  }

  // Save to browser memory and refresh
  localStorage.setItem('beerProName', nameInput);
  location.reload();
};

// 3. THE UPDATE LOGIC (Add or Minus)
window.updateBeer = async function(amount) {
  const playerName = localStorage.getItem('beerProName');
  if (!playerName) return;

  // Find the user's current beer count
  const { data } = await _supabase.from('leaderboard').select('id, beers').eq('name', playerName);

  if (data && data.length > 0) {
    const newCount = Math.max(0, (data[0].beers || 0) + amount); // No negative beers allowed!
    
    const { error } = await _supabase
      .from('leaderboard')
      .update({ beers: newCount })
      .eq('id', data[0].id);

    if (!error) {
      fetchLeaderboard(); // Update the table on screen
    }
  }
};

// 4. THE DISPLAY LOGIC
async function fetchLeaderboard() {
  const { data, error } = await _supabase
    .from('leaderboard')
    .select('*')
    .order('beers', { ascending: false });

  if (error) return console.error(error);

  const tableBody = document.getElementById('leaderboard-body');
  if (tableBody && data) {
    tableBody.innerHTML = data.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${p.name}</strong></td>
        <td>${p.beers}</td>
      </tr>`).join('');
  }
}

// 5. RUN ON STARTUP
function init() {
  const savedName = localStorage.getItem('beerProName');
  const overlay = document.getElementById('auth-overlay');
  
  if (savedName) {
    if (overlay) overlay.style.display = 'none';
    document.getElementById('display-name').innerText = savedName;
  }
  fetchLeaderboard();
}

init();