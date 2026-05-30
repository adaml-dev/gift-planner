import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import giftBanner from './assets/gift_banner.png';

interface Profile {
  id: string;
  display_name: string;
  avatar_url?: string;
}

interface Occasion {
  id: string;
  owner_name: string;
  owner_id?: string;
  creator_id: string;
  title: string;
  date: string;
  description?: string;
  created_at: string;
}

interface Gift {
  id: string;
  occasion_id: string;
  name: string;
  description?: string;
  price?: number;
  url?: string;
  suggested_by?: string;
  is_secret: boolean;
  created_at: string;
}

interface Booking {
  id: string;
  gift_id: string;
  user_id: string;
  created_at: string;
}

interface Vote {
  id: string;
  gift_id: string;
  user_id: string;
  created_at: string;
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem('gp_unlocked') === 'true');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // App navigation & core state
  const [view, setView] = useState<'dashboard' | 'occasion'>('dashboard');
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [activeOccasion, setActiveOccasion] = useState<Occasion | null>(null);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  
  // Tab control in Occasion view
  const [activeTab, setActiveTab] = useState<'solenizant' | 'goscie'>('solenizant');

  // Modals / Form states
  const [showOccasionModal, setShowOccasionModal] = useState(false);
  const [newOccasionTitle, setNewOccasionTitle] = useState('');
  const [newOccasionOwnerName, setNewOccasionOwnerName] = useState('');
  const [newOccasionOwnerId, setNewOccasionOwnerId] = useState('');
  const [newOccasionDate, setNewOccasionDate] = useState('');
  const [newOccasionDesc, setNewOccasionDesc] = useState('');

  const [showGiftModal, setShowGiftModal] = useState(false);
  const [newGiftName, setNewGiftName] = useState('');
  const [newGiftDesc, setNewGiftDesc] = useState('');
  const [newGiftPrice, setNewGiftPrice] = useState('');
  const [newGiftUrl, setNewGiftUrl] = useState('');
  const [newGiftIsSecret, setNewGiftIsSecret] = useState(false);

  // General loading & message states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Monitor Auth status
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        syncProfile(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        syncProfile(session.user);
      } else {
        setView('dashboard');
        setActiveOccasion(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Fetch occasions & profiles when user is loaded
  useEffect(() => {
    if (user) {
      fetchProfiles();
      fetchOccasions();
    }
  }, [user]);

  // 3. Realtime updates subscription
  useEffect(() => {
    if (!activeOccasion) return;

    const channel = supabase
      .channel(`gp-realtime-${activeOccasion.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gp_gifts' }, () => {
        fetchGifts(activeOccasion.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gp_bookings' }, () => {
        fetchBookings(activeOccasion.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gp_votes' }, () => {
        fetchVotes(activeOccasion.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOccasion]);

  // 4. Sync profile table in DB
  const syncProfile = async (u: any) => {
    try {
      const { data, error } = await supabase
        .from('gp_profiles')
        .upsert({
          id: u.id,
          display_name: u.user_metadata?.display_name || u.email?.split('@')[0] || 'Anonim',
          avatar_url: u.user_metadata?.avatar_url || ''
        })
        .select();
      
      if (!error && data?.[0]) {
        fetchProfiles();
      }
    } catch (e) {
      console.error('Error syncing profile:', e);
    }
  };

  // 5. Fetch profiles, occasions, gifts, bookings, votes
  const fetchProfiles = async () => {
    const { data } = await supabase.from('gp_profiles').select('*');
    if (data) {
      const pMap: Record<string, Profile> = {};
      data.forEach(p => {
        pMap[p.id] = p;
      });
      setProfiles(pMap);
    }
  };

  const fetchOccasions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('gp_occasions')
      .select('*')
      .order('date', { ascending: true });
    if (error) {
      setErrorMsg('Błąd pobierania okazji: ' + error.message);
    } else {
      setOccasions(data || []);
    }
    setLoading(false);
  };

  const fetchGifts = async (occasionId: string) => {
    const { data } = await supabase
      .from('gp_gifts')
      .select('*')
      .eq('occasion_id', occasionId)
      .order('created_at', { ascending: true });
    setGifts(data || []);
  };

  const fetchBookings = async (_occasionId?: string) => {
    // Due to RLS surprise logic, owners will fail to fetch or fetch empty bookings automatically.
    // That's handled at Supabase RLS level.
    const { data } = await supabase
      .from('gp_bookings')
      .select('*');
    setBookings(data || []);
  };

  const fetchVotes = async (_occasionId?: string) => {
    const { data } = await supabase
      .from('gp_votes')
      .select('*');
    setVotes(data || []);
  };

  const selectOccasion = async (occ: Occasion) => {
    setActiveOccasion(occ);
    setView('occasion');
    setLoading(true);
    await Promise.all([
      fetchGifts(occ.id),
      fetchBookings(occ.id),
      fetchVotes(occ.id)
    ]);
    setLoading(false);
  };

  // Auth logic
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = import.meta.env.VITE_APP_PIN || '2026';
    if (pin === correctPin) {
      setUnlocked(true);
      localStorage.setItem('gp_unlocked', 'true');
      setPinError('');
    } else {
      setPinError('Niepoprawny kod PIN. Spróbuj ponownie.');
    }
  };

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!authName.trim()) {
      setAuthError('Wpisz swoje imię / nick');
      return;
    }

    setAuthLoading(true);
    const randomId = Math.random().toString(36).substring(2, 7) + Date.now().toString().slice(-4);
    const email = `member_${randomId}@family.local`;
    const password = `family_secure_pass_2026_${randomId}`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: authName.trim()
        }
      }
    });

    if (error) {
      setAuthError('Nie udało się zalogować: ' + error.message);
    } else if (data.user) {
      setUser(data.user);
      await syncProfile(data.user);
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Add Occasion logic
  const handleCreateOccasion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOccasionTitle.trim() || !newOccasionOwnerName.trim() || !newOccasionDate) {
      alert('Wypełnij wymagane pola!');
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('gp_occasions')
      .insert({
        title: newOccasionTitle,
        owner_name: newOccasionOwnerName,
        owner_id: newOccasionOwnerId || null,
        creator_id: user.id,
        date: newOccasionDate,
        description: newOccasionDesc
      });

    if (error) {
      alert('Nie udało się utworzyć okazji: ' + error.message);
    } else {
      setShowOccasionModal(false);
      // Reset form
      setNewOccasionTitle('');
      setNewOccasionOwnerName('');
      setNewOccasionOwnerId('');
      setNewOccasionDate('');
      setNewOccasionDesc('');
      fetchOccasions();
    }
    setLoading(false);
  };

  const handleDeleteOccasion = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Czy na pewno chcesz usunąć to wydarzenie? Wszystkie powiązane prezenty zostaną trwale usunięte.')) return;
    
    setLoading(true);
    const { error } = await supabase
      .from('gp_occasions')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Błąd podczas usuwania: ' + error.message);
    } else {
      fetchOccasions();
    }
    setLoading(false);
  };

  // Add Gift logic
  const handleCreateGift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGiftName.trim() || !activeOccasion) return;

    setLoading(true);
    // Solenizant cannot suggest secrets.
    const isSecretValue = activeOccasion.owner_id === user.id ? false : newGiftIsSecret;

    const { error } = await supabase
      .from('gp_gifts')
      .insert({
        occasion_id: activeOccasion.id,
        name: newGiftName,
        description: newGiftDesc || null,
        price: newGiftPrice ? parseFloat(newGiftPrice) : null,
        url: newGiftUrl || null,
        suggested_by: user.id,
        is_secret: isSecretValue
      });

    if (error) {
      alert('Nie udało się dodać prezentu: ' + error.message);
    } else {
      setShowGiftModal(false);
      setNewGiftName('');
      setNewGiftDesc('');
      setNewGiftPrice('');
      setNewGiftUrl('');
      setNewGiftIsSecret(false);
      fetchGifts(activeOccasion.id);
    }
    setLoading(false);
  };

  const handleDeleteGift = async (giftId: string) => {
    if (!confirm('Czy chcesz usunąć ten prezent z listy?')) return;
    
    setLoading(true);
    const { error } = await supabase
      .from('gp_gifts')
      .delete()
      .eq('id', giftId);

    if (error) {
      alert('Błąd podczas usuwania: ' + error.message);
    } else if (activeOccasion) {
      fetchGifts(activeOccasion.id);
    }
    setLoading(false);
  };

  // Booking logic
  const handleBook = async (giftId: string) => {
    const { error } = await supabase
      .from('gp_bookings')
      .insert({ gift_id: giftId, user_id: user.id });

    if (error) {
      alert('Błąd rezerwacji: ' + error.message);
    } else if (activeOccasion) {
      fetchBookings(activeOccasion.id);
    }
  };

  const handleUnbook = async (giftId: string) => {
    const { error } = await supabase
      .from('gp_bookings')
      .delete()
      .eq('gift_id', giftId)
      .eq('user_id', user.id);

    if (error) {
      alert('Błąd anulowania rezerwacji: ' + error.message);
    } else if (activeOccasion) {
      fetchBookings(activeOccasion.id);
    }
  };

  // Voting logic
  const handleVote = async (giftId: string) => {
    const { error } = await supabase
      .from('gp_votes')
      .insert({ gift_id: giftId, user_id: user.id });

    if (error) {
      alert('Błąd głosowania: ' + error.message);
    } else if (activeOccasion) {
      fetchVotes(activeOccasion.id);
    }
  };

  const handleUnvote = async (giftId: string) => {
    const { error } = await supabase
      .from('gp_votes')
      .delete()
      .eq('gift_id', giftId)
      .eq('user_id', user.id);

    if (error) {
      alert('Błąd anulowania głosu: ' + error.message);
    } else if (activeOccasion) {
      fetchVotes(activeOccasion.id);
    }
  };

  // Format date helper
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Calculate days left
  const getDaysLeft = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diff = target.getTime() - today.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Dziś!';
    if (days < 0) return 'Już się odbyło';
    if (days === 1) return 'Jutro!';
    return `za ${days} dni`;
  };

  // Filter gifts by active tab (Solenizant wishes vs Guest suggestions)
  const isOwnerActiveOccasion = activeOccasion?.owner_id === user?.id;
  
  // Solenizant tab includes:
  // - Gifts where is_secret = false and suggested_by = owner
  // - OR gifts suggested by creator/guests but not marked as secret
  const solenizantGifts = gifts.filter(g => !g.is_secret);

  // Guest tab (Pomysły gości) includes:
  // - Gifts marked as secret (is_secret = true)
  // - These are only shown if current user is NOT the owner of this occasion
  const goscieGifts = isOwnerActiveOccasion ? [] : gifts.filter(g => g.is_secret);

  // Sort goscieGifts by votes count
  const getVoteCount = (giftId: string) => votes.filter(v => v.gift_id === giftId).length;
  const hasUserVoted = (giftId: string) => votes.some(v => v.gift_id === giftId && v.user_id === user?.id);
  
  const sortedGoscieGifts = [...goscieGifts].sort((a, b) => getVoteCount(b.id) - getVoteCount(a.id));

  // Check booking helper
  const getBooking = (giftId: string) => bookings.find(b => b.gift_id === giftId);

  // 1. PIN Unlock screen
  if (!unlocked) {
    return (
      <div className="auth-container">
        <div className="glass-panel auth-card">
          <div className="auth-header">
            <img src={giftBanner} alt="Gift Planner Logo" width="300" height="200" style={{ objectFit: 'cover' }} />
            <h1>Gift Planner</h1>
            <p>Wpisz 4-cyfrowy kod PIN, aby uzyskać dostęp do aplikacji rodzinnej.</p>
          </div>

          <form onSubmit={handlePinSubmit}>
            {pinError && <div className="alert alert-danger">{pinError}</div>}
            
            <div className="form-group" style={{ textAlign: 'center' }}>
              <label style={{ textAlign: 'center' }}>Kod Dostępu</label>
              <input 
                type="password" 
                maxLength={4}
                pattern="[0-9]*"
                inputMode="numeric"
                className="form-control" 
                value={pin} 
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))} 
                placeholder="••••"
                style={{ textAlign: 'center', fontSize: '2rem', letterSpacing: '0.5rem', padding: '0.5rem' }}
                required 
                autoFocus
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
              Odblokuj
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. Name entry screen (if unlocked but no user session)
  if (!user) {
    return (
      <div className="auth-container">
        <div className="glass-panel auth-card">
          <div className="auth-header">
            <img src={giftBanner} alt="Gift Planner Logo" width="300" height="200" style={{ objectFit: 'cover' }} />
            <h1>Kim jesteś?</h1>
            <p>Wpisz swoje imię lub pseudonim, aby bliscy wiedzieli, kto rezerwuje i dodaje prezenty.</p>
          </div>

          <form onSubmit={handleNameSubmit}>
            {authError && <div className="alert alert-danger">{authError}</div>}
            
            <div className="form-group">
              <label>Twoje Imię / Nick</label>
              <input 
                type="text" 
                className="form-control" 
                value={authName} 
                onChange={e => setAuthName(e.target.value)} 
                placeholder="np. Wujek Jacek, Mama, Kasia"
                required 
                autoFocus
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={authLoading}>
              {authLoading ? 'Logowanie...' : 'Wejdź do aplikacji'}
            </button>
          </form>

          <div className="auth-switch">
            <button className="btn-link" onClick={() => {
              setUnlocked(false);
              localStorage.removeItem('gp_unlocked');
              setPin('');
            }}>
              🔒 Zablokuj aplikację
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Header / Navigation
  const renderNav = () => (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand" onClick={() => { setView('dashboard'); setActiveOccasion(null); }}>
          🎁 Gift Planner
        </div>
        <div className="navbar-user">
          <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Cześć, <strong>{profiles[user.id]?.display_name || user.email?.split('@')[0]}</strong>!
          </span>
          <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={handleLogout}>
            Wyloguj
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {renderNav()}
      
      {/* ----------------- DASHBOARD VIEW ----------------- */}
      {view === 'dashboard' && (
        <main className="container">
          <div className="dashboard-header">
            <div>
              <h1>Planowane Okazje</h1>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                Przeglądaj wydarzenia znajomych i rodziny lub stwórz własne.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowOccasionModal(true)}>
              ➕ Nowe Wydarzenie
            </button>
          </div>

          {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}

          {loading && <div style={{ textAlign: 'center', padding: '2rem' }}>Ładowanie wydarzeń...</div>}

          {!loading && occasions.length === 0 && (
            <div className="glass-panel empty-state">
              <div className="empty-state-icon">🎂</div>
              <h3>Brak zaplanowanych okazji</h3>
              <p style={{ marginBottom: '1.5rem' }}>Dodaj urodziny, rocznicę lub inną okazję, by bliscy wiedzieli jakich prezentów szukać!</p>
              <button className="btn btn-primary" onClick={() => setShowOccasionModal(true)}>
                Dodaj pierwsze wydarzenie
              </button>
            </div>
          )}

          <div className="occasions-grid">
            {occasions.map(occ => {
              const daysLeft = getDaysLeft(occ.date);
              const isCreator = occ.creator_id === user.id;
              const isOwner = occ.owner_id === user.id;

              return (
                <div key={occ.id} className="glass-panel occasion-card" onClick={() => selectOccasion(occ)}>
                  <div className="occasion-badge">{daysLeft}</div>
                  <h3>{occ.title}</h3>
                  <div className="occasion-meta">
                    📅 {formatDate(occ.date)}
                    <br />
                    👤 Dla: <strong>{occ.owner_name}</strong> {isOwner && '(To Ty!)'}
                  </div>
                  {occ.description && <p className="occasion-desc">{occ.description}</p>}
                  <div className="occasion-actions">
                    <div className="creator-info">
                      <div className="avatar">
                        {(profiles[occ.creator_id]?.display_name || '?')[0].toUpperCase()}
                      </div>
                      Stworzył: {profiles[occ.creator_id]?.display_name || 'Ktoś'}
                    </div>
                    {isCreator && (
                      <button className="btn btn-danger btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={(e) => handleDeleteOccasion(occ.id, e)}>
                        Usuń
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ----------------- OCCASION VIEW ----------------- */}
      {view === 'occasion' && activeOccasion && (
        <main className="container">
          <button className="back-link" onClick={() => { setView('dashboard'); setActiveOccasion(null); }}>
            ← Powrót do pulpitu
          </button>

          <div className="glass-panel occasion-details-header">
            <div className="occasion-title-row">
              <div>
                <div className="occasion-date">📅 {formatDate(activeOccasion.date)} ({getDaysLeft(activeOccasion.date)})</div>
                <h1 style={{ margin: '0 0 0.5rem 0' }}>{activeOccasion.title}</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>
                  Okazja dla: <strong>{activeOccasion.owner_name}</strong> {isOwnerActiveOccasion && '(Ciebie)'}
                </p>
                {activeOccasion.description && (
                  <p style={{ marginTop: '1rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                    "{activeOccasion.description}"
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-primary" onClick={() => setShowGiftModal(true)}>
                  🎁 Dodaj Prezent
                </button>
              </div>
            </div>
          </div>

          {/* Surprise Logic Warning or Info */}
          {isOwnerActiveOccasion && (
            <div className="alert alert-success" style={{ marginBottom: '2rem' }}>
              💡 To jest Twoja okazja! Rezerwacje prezentów i pomysły-niespodzianki dodane przez Twoich znajomych są przed Tobą ukryte, by nie psuć niespodzianki.
            </div>
          )}

          {/* Navigation Tabs */}
          {!isOwnerActiveOccasion && (
            <div className="tab-nav">
              <button className={`tab-btn ${activeTab === 'solenizant' ? 'active' : ''}`} onClick={() => setActiveTab('solenizant')}>
                Lista życzeń {activeOccasion.owner_name} ({solenizantGifts.length})
              </button>
              <button className={`tab-btn ${activeTab === 'goscie' ? 'active' : ''}`} onClick={() => setActiveTab('goscie')}>
                Pomysły i niespodzianki gości ({goscieGifts.length})
              </button>
            </div>
          )}

          {loading && <div style={{ textAlign: 'center', padding: '2rem' }}>Ładowanie prezentów...</div>}

          {/* Gift List Content */}
          {!loading && (
            <>
              {/* Tab 1: Solenizant Gifts */}
              {(isOwnerActiveOccasion || activeTab === 'solenizant') && (
                <div>
                  {solenizantGifts.length === 0 ? (
                    <div className="empty-state glass-panel">
                      <div className="empty-state-icon">🎁</div>
                      <h4>Brak prezentów na liście</h4>
                      <p style={{ marginBottom: '1.5rem' }}>Dodaj prezenty, które chcesz podarować lub otrzymać!</p>
                      <button className="btn btn-primary" onClick={() => setShowGiftModal(true)}>
                        Dodaj prezent
                      </button>
                    </div>
                  ) : (
                    <div className="gifts-grid">
                      {solenizantGifts.map(gift => {
                        const booking = getBooking(gift.id);
                        const isBooked = !!booking;
                        const isBookedByMe = booking?.user_id === user.id;
                        const isGiftCreator = gift.suggested_by === user.id;
                        
                        return (
                          <div key={gift.id} className="glass-panel gift-card">
                            <h3>{gift.name}</h3>
                            {gift.description && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>{gift.description}</p>}
                            
                            {gift.price && <div className="gift-price">{gift.price} zł</div>}
                            
                            <div className="gift-meta">
                              {gift.url && (
                                <a href={gift.url} target="_blank" rel="noopener noreferrer" className="btn-link" style={{ alignSelf: 'flex-start' }}>
                                  🔗 Zobacz w sklepie
                                </a>
                              )}
                              <span>Zaproponowany przez: {profiles[gift.suggested_by || '']?.display_name || 'Solenizant'}</span>
                            </div>

                            {/* Bookings section (hidden from occasion owner) */}
                            {!isOwnerActiveOccasion && (
                              <div style={{ marginTop: 'auto' }}>
                                {isBooked ? (
                                  <>
                                    <div className="gift-status-badge booked">
                                      🔒 Zarezerwowany przez {isBookedByMe ? 'Ciebie' : (profiles[booking.user_id]?.display_name || 'znajomego')}
                                    </div>
                                    <div className="gift-actions">
                                      {isBookedByMe ? (
                                        <button className="btn btn-secondary" onClick={() => handleUnbook(gift.id)}>
                                          Anuluj rezerwację
                                        </button>
                                      ) : (
                                        <button className="btn btn-secondary" disabled style={{ opacity: 0.5 }}>
                                          Zajęty
                                        </button>
                                      )}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="gift-status-badge available">🟢 Dostępny</div>
                                    <div className="gift-actions">
                                      <button className="btn btn-primary" onClick={() => handleBook(gift.id)}>
                                        Zarezerwuj
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Show delete button if user added this gift or is occasion creator */}
                            {(isGiftCreator || activeOccasion.creator_id === user.id) && (
                              <button 
                                className="btn btn-danger btn-secondary" 
                                style={{ position: 'absolute', top: '10px', right: '10px', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={() => handleDeleteGift(gift.id)}
                              >
                                Usuń
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Guest suggestions (Niespodzianki) */}
              {!isOwnerActiveOccasion && activeTab === 'goscie' && (
                <div>
                  <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
                    🕵️ Te pomysły są całkowicie ukryte przed solenizantem ({activeOccasion.owner_name}). Głosujcie wspólnie na najfajniejsze pomysły!
                  </div>

                  {sortedGoscieGifts.length === 0 ? (
                    <div className="empty-state glass-panel">
                      <div className="empty-state-icon">🤫</div>
                      <h4>Brak pomysłów gości</h4>
                      <p style={{ marginBottom: '1.5rem' }}>Zaproponuj coś fajnego, o czym solenizant nie wie!</p>
                      <button className="btn btn-primary" onClick={() => setShowGiftModal(true)}>
                        Dodaj pomysł-niespodziankę
                      </button>
                    </div>
                  ) : (
                    <div className="gifts-grid">
                      {sortedGoscieGifts.map(gift => {
                        const booking = getBooking(gift.id);
                        const isBooked = !!booking;
                        const isBookedByMe = booking?.user_id === user.id;
                        const isGiftCreator = gift.suggested_by === user.id;
                        const votesCount = getVoteCount(gift.id);
                        const userVoted = hasUserVoted(gift.id);

                        return (
                          <div key={gift.id} className="glass-panel gift-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <h3>{gift.name}</h3>
                              {/* Voting Section */}
                              <div className="vote-section">
                                <button 
                                  className={`btn ${userVoted ? 'btn-primary' : 'btn-secondary'}`} 
                                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                                  onClick={() => userVoted ? handleUnvote(gift.id) : handleVote(gift.id)}
                                >
                                  👍 {votesCount}
                                </button>
                              </div>
                            </div>
                            
                            {gift.description && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>{gift.description}</p>}
                            {gift.price && <div className="gift-price">{gift.price} zł</div>}

                            <div className="gift-meta">
                              {gift.url && (
                                <a href={gift.url} target="_blank" rel="noopener noreferrer" className="btn-link" style={{ alignSelf: 'flex-start' }}>
                                  🔗 Zobacz w sklepie
                                </a>
                              )}
                              <span>Zaproponowane przez: {profiles[gift.suggested_by || '']?.display_name || 'Znajomy'}</span>
                            </div>

                            <div style={{ marginTop: 'auto' }}>
                              {isBooked ? (
                                <>
                                  <div className="gift-status-badge booked">
                                    🔒 Kupuje: {isBookedByMe ? 'Ty' : (profiles[booking.user_id]?.display_name || 'znajomy')}
                                  </div>
                                  <div className="gift-actions">
                                    {isBookedByMe ? (
                                      <button className="btn btn-secondary" onClick={() => handleUnbook(gift.id)}>
                                        Anuluj zakup
                                      </button>
                                    ) : (
                                      <button className="btn btn-secondary" disabled style={{ opacity: 0.5 }}>
                                        Kupuje ktoś inny
                                      </button>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="gift-status-badge available">🟢 Wolny</div>
                                  <div className="gift-actions">
                                    <button className="btn btn-primary" onClick={() => handleBook(gift.id)}>
                                      Zadeklaruj zakup
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>

                            {(isGiftCreator || activeOccasion.creator_id === user.id) && (
                              <button 
                                className="btn btn-danger btn-secondary" 
                                style={{ position: 'absolute', top: '10px', right: '55px', padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={() => handleDeleteGift(gift.id)}
                              >
                                Usuń
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      )}

      {/* ----------------- ADD OCCASION MODAL ----------------- */}
      {showOccasionModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h2>Dodaj nowe wydarzenie</h2>
              <button className="close-btn" onClick={() => setShowOccasionModal(false)}>×</button>
            </div>
            
            <form onSubmit={handleCreateOccasion}>
              <div className="form-group">
                <label>Nazwa Okazji *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={newOccasionTitle} 
                  onChange={e => setNewOccasionTitle(e.target.value)} 
                  placeholder="np. 30. urodziny Tomka" 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Dla kogo jest ta okazja? (Solenizant) *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={newOccasionOwnerName} 
                  onChange={e => setNewOccasionOwnerName(e.target.value)} 
                  placeholder="np. Tomek" 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Konto solenizanta w aplikacji (opcjonalnie)</label>
                <select 
                  className="form-control"
                  value={newOccasionOwnerId}
                  onChange={e => setNewOccasionOwnerId(e.target.value)}
                >
                  <option value="">-- Wybierz profil (lub pozostaw puste) --</option>
                  {Object.values(profiles).map(p => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Wskazanie konta sprawi, że rezerwacje i pomysły-niespodzianki będą przed tą osobą ukryte.
                </p>
              </div>

              <div className="form-group">
                <label>Data wydarzenia *</label>
                <input 
                  type="date" 
                  className="form-control" 
                  value={newOccasionDate} 
                  onChange={e => setNewOccasionDate(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Krótki opis / Uwagi (np. miejsce imprezy, rozmiar ubrań)</label>
                <textarea 
                  className="form-control" 
                  rows={3}
                  value={newOccasionDesc} 
                  onChange={e => setNewOccasionDesc(e.target.value)} 
                  placeholder="np. Impreza w sobotę w ogrodzie. Rozmiar koszulki M, lubi książki kryminalne..."
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowOccasionModal(false)}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  Zapisz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- ADD GIFT MODAL ----------------- */}
      {showGiftModal && activeOccasion && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h2>Dodaj propozycję prezentu</h2>
              <button className="close-btn" onClick={() => setShowGiftModal(false)}>×</button>
            </div>

            <form onSubmit={handleCreateGift}>
              <div className="form-group">
                <label>Nazwa Prezentu *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={newGiftName} 
                  onChange={e => setNewGiftName(e.target.value)} 
                  placeholder="np. Klocki LEGO Technic 42115" 
                  required 
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Szacowana cena (zł)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={newGiftPrice} 
                    onChange={e => setNewGiftPrice(e.target.value)} 
                    placeholder="np. 1200" 
                  />
                </div>

                <div className="form-group">
                  <label>Link do sklepu</label>
                  <input 
                    type="url" 
                    className="form-control" 
                    value={newGiftUrl} 
                    onChange={e => setNewGiftUrl(e.target.value)} 
                    placeholder="https://..." 
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Opis / Kolor / Rozmiar</label>
                <textarea 
                  className="form-control" 
                  rows={2}
                  value={newGiftDesc} 
                  onChange={e => setNewGiftDesc(e.target.value)} 
                  placeholder="Dodatkowe informacje dla kupujących..." 
                />
              </div>

              {/* Surprise option: hide from solenizant if logged in user is not the solenizant */}
              {!isOwnerActiveOccasion && (
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1.5rem 0' }}>
                  <input 
                    type="checkbox" 
                    id="is_secret" 
                    checked={newGiftIsSecret} 
                    onChange={e => setNewGiftIsSecret(e.target.checked)} 
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="is_secret" style={{ margin: 0, textTransform: 'none', fontSize: '0.95rem', cursor: 'pointer', color: 'white' }}>
                    🤫 Ukryj przed solenizantem (Niespodzianka)
                  </label>
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowGiftModal(false)}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  Dodaj
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
