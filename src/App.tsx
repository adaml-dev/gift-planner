import { useState, useEffect } from 'react';
import { supabase, authAdminClient } from './supabase';
import giftBanner from './assets/gift_banner.png';

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

interface Profile {
  id: string;
  display_name: string;
  avatar_url?: string;
  is_admin: boolean;
  email?: string;
  login_password?: string;
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
  urls?: { label: string; url: string }[];
  suggested_by?: string;
  is_secret: boolean;
  created_at: string;
}

interface Booking {
  id: string;
  gift_id: string;
  user_id: string;
  created_at: string;
  is_group?: boolean;
  group_id?: string | null;
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
  const [giftVariants, setGiftVariants] = useState<{ label: string; url: string }[]>([{ label: '', url: '' }]);
  const [newGiftIsSecret, setNewGiftIsSecret] = useState(false);
  const [newAppPin, setNewAppPin] = useState('');

  // General loading & message states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Silent & admin login states
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberIsAdmin, setNewMemberIsAdmin] = useState(false);
  const [newMemberPassword, setNewMemberPassword] = useState('');

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

  // 2. Fetch profiles immediately on mount, and occasions when user is logged in
  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (user) {
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

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.rpc('verify_app_pin', { input_pin: pin });
    if (error) {
      setPinError('Błąd połączenia z bazą: ' + error.message);
    } else if (data === true) {
      setUnlocked(true);
      localStorage.setItem('gp_unlocked', 'true');
      setPinError('');
    } else {
      setPinError('Niepoprawny kod PIN. Spróbuj ponownie.');
    }
    setLoading(false);
  };

  const handleSelectProfile = async (profile: Profile) => {
    setAuthError('');
    if (profile.is_admin) {
      setSelectedProfile(profile);
      return;
    }

    setAuthLoading(true);
    const email = profile.email || `member_${profile.id.substring(0, 8)}@family.local`;
    const password = profile.login_password || `pass_${profile.id.substring(0, 8)}`;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: profile.display_name
          }
        }
      });

      if (signUpError) {
        setAuthError('Błąd połączenia z kontem: ' + signUpError.message);
      } else if (data.user) {
        await supabase
          .from('gp_profiles')
          .update({ email, login_password: password })
          .eq('id', profile.id);
        
        setUser(data.user);
        await fetchProfiles();
      }
    }
    setAuthLoading(false);
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile || !adminPassword.trim()) return;

    setAuthLoading(true);
    setAuthError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email: selectedProfile.email || '',
      password: adminPassword
    });

    if (error) {
      setAuthError('Niepoprawne hasło administratora: ' + error.message);
    } else if (data.user) {
      setUser(data.user);
      setSelectedProfile(null);
      setAdminPassword('');
    }
    setAuthLoading(false);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    if (newMemberIsAdmin && !newMemberPassword.trim()) {
      setToast({ message: 'Administrator musi posiadać hasło!', type: 'error' });
      return;
    }

    setLoading(true);
    const randomId = Math.random().toString(36).substring(2, 7) + Date.now().toString().slice(-4);
    const email = newMemberIsAdmin 
      ? `${newMemberName.trim().toLowerCase().replace(/\s+/g, '')}@family.local` 
      : `member_${randomId}@family.local`;
    const password = newMemberIsAdmin ? newMemberPassword.trim() : `pass_${randomId}`;

    const { data, error } = await authAdminClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: newMemberName.trim(),
          is_admin: newMemberIsAdmin
        }
      }
    });

    if (error) {
      setToast({ message: 'Błąd podczas tworzenia konta: ' + error.message, type: 'error' });
    } else if (data.user) {
      const { error: profileError } = await supabase
        .from('gp_profiles')
        .upsert({
          id: data.user.id,
          display_name: newMemberName.trim(),
          email,
          login_password: newMemberIsAdmin ? null : password,
          is_admin: newMemberIsAdmin
        });

      if (profileError) {
        setToast({ message: 'Konto utworzone, ale błąd profilu: ' + profileError.message, type: 'error' });
      } else {
        setNewMemberName('');
        setNewMemberIsAdmin(false);
        setNewMemberPassword('');
        fetchProfiles();
        setToast({ message: `Dodano użytkownika: ${newMemberName}`, type: 'success' });
      }
    }
    setLoading(false);
  };

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleRenameSave = async (profileId: string) => {
    if (!editingName.trim()) return;
    
    setLoading(true);
    const { error } = await supabase
      .from('gp_profiles')
      .update({ display_name: editingName.trim() })
      .eq('id', profileId);

    if (error) {
      setToast({ message: 'Błąd podczas zmiany nazwy: ' + error.message, type: 'error' });
    } else {
      setToast({ message: 'Nazwa została pomyślnie zmieniona.', type: 'success' });
      setEditingProfileId(null);
      fetchProfiles();
    }
    setLoading(false);
  };

  const handleConfirmDeleteMember = (profileId: string, name: string) => {
    setConfirmModal({
      show: true,
      title: 'Usuń członka rodziny',
      message: `Czy na pewno chcesz usunąć użytkownika ${name}? Spowoduje to trwałe usunięcie jego konta oraz wszystkich jego rezerwacji prezentów.`,
      onConfirm: async () => {
        setLoading(true);
        const { error } = await supabase
          .rpc('delete_user_by_admin', { user_id: profileId });

        if (error) {
          setToast({ message: 'Błąd podczas usuwania użytkownika: ' + error.message, type: 'error' });
        } else {
          setToast({ message: 'Użytkownik został usunięty.', type: 'success' });
          fetchProfiles();
        }
        setLoading(false);
      }
    });
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppPin.trim() || newAppPin.trim().length < 4) {
      setToast({ message: 'Kod PIN musi mieć co najmniej 4 cyfry!', type: 'error' });
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from('gp_settings')
      .upsert({ key: 'app_pin', value: newAppPin.trim() });
    
    if (error) {
      setToast({ message: 'Błąd zapisu PIN: ' + error.message, type: 'error' });
    } else {
      setToast({ message: 'Kod PIN dostępu do aplikacji został zmieniony!', type: 'success' });
      setNewAppPin('');
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Add Occasion logic
  const handleCreateOccasion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOccasionTitle.trim() || !newOccasionOwnerName.trim() || !newOccasionDate) {
      setToast({ message: 'Wypełnij wymagane pola!', type: 'error' });
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
      setToast({ message: 'Nie udało się utworzyć okazji: ' + error.message, type: 'error' });
    } else {
      setShowOccasionModal(false);
      setNewOccasionTitle('');
      setNewOccasionOwnerName('');
      setNewOccasionOwnerId('');
      setNewOccasionDate('');
      setNewOccasionDesc('');
      fetchOccasions();
      setToast({ message: 'Okazja została zaplanowana!', type: 'success' });
    }
    setLoading(false);
  };

  const handleDeleteOccasion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({
      show: true,
      title: 'Usuń wydarzenie',
      message: 'Czy na pewno chcesz usunąć to wydarzenie? Wszystkie powiązane prezenty zostaną trwale usunięte.',
      onConfirm: async () => {
        setLoading(true);
        const { error } = await supabase
          .from('gp_occasions')
          .delete()
          .eq('id', id);

        if (error) {
          setToast({ message: 'Błąd podczas usuwania: ' + error.message, type: 'error' });
        } else {
          fetchOccasions();
          setToast({ message: 'Okazja została usunięta.', type: 'success' });
        }
        setLoading(false);
      }
    });
  };

  const openGiftModal = () => {
    // If they are on the Guests tab and are not the owner, default to secret. Otherwise false.
    const defaultSecret = (!isOwnerActiveOccasion && activeTab === 'goscie');
    setNewGiftIsSecret(defaultSecret);
    setShowGiftModal(true);
  };

  // Add Gift logic
  const handleCreateGift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGiftName.trim() || !activeOccasion) return;

    setLoading(true);
    const isSecretValue = activeOccasion.owner_id === user.id ? false : newGiftIsSecret;

    const filteredVariants = giftVariants
      .filter(v => v.url.trim() !== '')
      .map(v => ({
        label: v.label.trim() || 'Sklep',
        url: v.url.trim()
      }));

    const { error } = await supabase
      .from('gp_gifts')
      .insert({
        occasion_id: activeOccasion.id,
        name: newGiftName,
        description: newGiftDesc || null,
        price: newGiftPrice ? parseFloat(newGiftPrice) : null,
        url: filteredVariants[0]?.url || null,
        urls: filteredVariants,
        suggested_by: user.id,
        is_secret: isSecretValue
      });

    if (error) {
      setToast({ message: 'Nie udało się dodać prezentu: ' + error.message, type: 'error' });
    } else {
      setShowGiftModal(false);
      setNewGiftName('');
      setNewGiftDesc('');
      setNewGiftPrice('');
      setGiftVariants([{ label: '', url: '' }]);
      setNewGiftIsSecret(false);
      fetchGifts(activeOccasion.id);
      setToast({ message: 'Prezent został dodany do listy.', type: 'success' });
    }
    setLoading(false);
  };

  const handleDeleteGift = (giftId: string) => {
    setConfirmModal({
      show: true,
      title: 'Usuń prezent',
      message: 'Czy chcesz usunąć ten prezent z listy?',
      onConfirm: async () => {
        setLoading(true);
        const { error } = await supabase
          .from('gp_gifts')
          .delete()
          .eq('id', giftId);

        if (error) {
          setToast({ message: 'Błąd podczas usuwania: ' + error.message, type: 'error' });
        } else if (activeOccasion) {
          fetchGifts(activeOccasion.id);
          setToast({ message: 'Prezent został usunięty.', type: 'success' });
        }
        setLoading(false);
      }
    });
  };

  // Booking logic
  const handleBook = async (giftId: string, isGroup: boolean = false, groupId: string | null = null) => {
    const { error } = await supabase
      .from('gp_bookings')
      .insert({ 
        gift_id: giftId, 
        user_id: user.id, 
        is_group: isGroup,
        group_id: groupId 
      });

    if (error) {
      setToast({ message: 'Błąd rezerwacji: ' + error.message, type: 'error' });
    } else if (activeOccasion) {
      fetchBookings(activeOccasion.id);
      setToast({ message: isGroup ? 'Dołączono do składki grupowej!' : 'Zarezerwowano prezent!', type: 'success' });
    }
  };

  const handleUnbook = async (giftId: string) => {
    const { error } = await supabase
      .from('gp_bookings')
      .delete()
      .eq('gift_id', giftId)
      .eq('user_id', user.id);

    if (error) {
      setToast({ message: 'Błąd anulowania rezerwacji: ' + error.message, type: 'error' });
    } else if (activeOccasion) {
      fetchBookings(activeOccasion.id);
      setToast({ message: 'Anulowano rezerwację prezentu.', type: 'success' });
    }
  };

  // Voting logic
  const handleVote = async (giftId: string) => {
    const { error } = await supabase
      .from('gp_votes')
      .insert({ gift_id: giftId, user_id: user.id });

    if (error) {
      setToast({ message: 'Błąd głosowania: ' + error.message, type: 'error' });
    } else if (activeOccasion) {
      fetchVotes(activeOccasion.id);
      setToast({ message: 'Oddano głos na pomysł!', type: 'success' });
    }
  };

  const handleUnvote = async (giftId: string) => {
    const { error } = await supabase
      .from('gp_votes')
      .delete()
      .eq('gift_id', giftId)
      .eq('user_id', user.id);

    if (error) {
      setToast({ message: 'Błąd anulowania głosu: ' + error.message, type: 'error' });
    } else if (activeOccasion) {
      fetchVotes(activeOccasion.id);
      setToast({ message: 'Anulowano głos.', type: 'success' });
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

  // Helper to render a gift card (used in both tabs to prevent duplication and syntax bugs)
  const renderGiftCard = (gift: Gift, isGuestTab: boolean) => {
    const giftBookings = bookings.filter(b => b.gift_id === gift.id);
    
    // Filter individual bookings
    const individualBookings = giftBookings.filter(b => !b.is_group);
    
    // Group bookings by group_id
    const groupBookingsMap: Record<string, Booking[]> = {};
    giftBookings.forEach(b => {
      if (b.is_group && b.group_id) {
        if (!groupBookingsMap[b.group_id]) {
          groupBookingsMap[b.group_id] = [];
        }
        groupBookingsMap[b.group_id].push(b);
      }
    });

    const myBooking = giftBookings.find(b => b.user_id === user?.id);
    const hasMyBooking = !!myBooking;
    const isGiftCreator = gift.suggested_by === user?.id;

    const votesCount = getVoteCount(gift.id);
    const userVoted = hasUserVoted(gift.id);

    return (
      <div key={gift.id} className="glass-panel gift-card" style={{ position: 'relative' }}>
        {isGuestTab ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', paddingRight: (isGiftCreator || activeOccasion?.creator_id === user?.id) ? '40px' : '0' }}>
            <h3 style={{ margin: 0 }}>{gift.name}</h3>
            <div className="vote-section" style={{ flexShrink: 0 }}>
              <button 
                className={`btn ${userVoted ? 'btn-primary' : 'btn-secondary'}`} 
                style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                onClick={() => userVoted ? handleUnvote(gift.id) : handleVote(gift.id)}
              >
                👍 {votesCount}
              </button>
            </div>
          </div>
        ) : (
          <h3>{gift.name}</h3>
        )}

        {gift.description && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>{gift.description}</p>}
        
        {gift.price && <div className="gift-price">{gift.price} zł</div>}
        
        <div className="gift-meta">
          {gift.urls && gift.urls.length > 0 ? (
            <div className="gift-links-list">
              {gift.urls.map((link, idx) => (
                <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="gift-link-tag">
                  🔗 {link.label}
                </a>
              ))}
            </div>
          ) : (
            gift.url && (
              <a href={gift.url} target="_blank" rel="noopener noreferrer" className="btn-link" style={{ alignSelf: 'flex-start', marginBottom: '0.5rem' }}>
                🔗 Zobacz w sklepie
              </a>
            )
          )}
          <span>Zaproponowany przez: {profiles[gift.suggested_by || '']?.display_name || 'Solenizant'}</span>
        </div>

        {/* Bookings section (hidden from occasion owner) */}
        {!isOwnerActiveOccasion && (
          <div style={{ marginTop: 'auto', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            
            {/* 1. Existing Individual Bookings */}
            {individualBookings.map(b => {
              const isMe = b.user_id === user?.id;
              return (
                <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="gift-status-badge booked" style={{ margin: 0, justifyContent: 'flex-start' }}>
                    🔒 Kupuje sam: <strong>{isMe ? 'Ty' : (profiles[b.user_id]?.display_name || 'znajomy')}</strong>
                  </div>
                  {isMe && (
                    <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', width: '100%' }} onClick={() => handleUnbook(gift.id)}>
                      Anuluj zakup
                    </button>
                  )}
                </div>
              );
            })}

            {/* 2. Existing Group Bookings */}
            {Object.entries(groupBookingsMap).map(([groupId, groupBookingsList], idx) => {
              const isMeInGroup = groupBookingsList.some(b => b.user_id === user?.id);
              const memberNames = groupBookingsList.map(b => profiles[b.user_id]?.display_name || 'Znajomy').join(', ');
              
              return (
                <div key={groupId} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(170, 59, 255, 0.05)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(170, 59, 255, 0.15)' }}>
                  <div className="gift-status-badge booked" style={{ margin: 0, background: 'none', color: 'var(--primary)', justifyContent: 'flex-start' }}>
                    👥 Składka #{idx + 1}: <strong>{memberNames}</strong>
                  </div>
                  <div className="gift-actions" style={{ margin: 0, border: 'none', paddingTop: 0 }}>
                    {isMeInGroup ? (
                      <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', width: '100%' }} onClick={() => handleUnbook(gift.id)}>
                        Opuść składkę
                      </button>
                    ) : (
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', width: '100%' }} 
                        onClick={() => handleBook(gift.id, true, groupId)}
                        disabled={hasMyBooking}
                      >
                        Dołącz do tej składki
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 3. Actions for Users who haven't booked this gift yet */}
            {!hasMyBooking && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.25rem' }}>
                  Chcesz podarować ten prezent?
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-primary" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', flex: 1 }} onClick={() => handleBook(gift.id, false, null)}>
                    Kupuję sam
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', flex: 1 }} onClick={() => handleBook(gift.id, true, generateUUID())}>
                    Nowa składka
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Show delete button if user added this gift or is occasion creator */}
        {(isGiftCreator || activeOccasion?.creator_id === user?.id) && (
          <button 
            className="btn btn-danger btn-secondary" 
            style={{ 
              position: 'absolute', 
              top: '10px', 
              right: isGuestTab ? '55px' : '10px', 
              padding: '0.3rem 0.6rem', 
              fontSize: '0.75rem',
              zIndex: 10
            }}
            onClick={() => handleDeleteGift(gift.id)}
          >
            Usuń
          </button>
        )}
      </div>
    );
  };

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

  // 2. User Selection screen (if unlocked but no user session)
  if (!user) {
    return (
      <div className="auth-container">
        <div className="glass-panel auth-card" style={{ maxWidth: selectedProfile ? '500px' : '650px', transition: 'max-width 0.3s ease' }}>
          <div className="auth-header">
            <img src={giftBanner} alt="Gift Planner Logo" width="300" height="200" style={{ objectFit: 'cover' }} />
            <h1>Kim jesteś?</h1>
            <p>Wybierz swoje imię z listy, aby wejść do aplikacji.</p>
          </div>

          {authError && <div className="alert alert-danger">{authError}</div>}

          {/* If an Admin clicked their name, show password prompt instead */}
          {selectedProfile ? (
            <form onSubmit={handleAdminLogin}>
              <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>Logowanie administratora: {selectedProfile.display_name}</h3>
              <div className="form-group">
                <label>Hasło administratora</label>
                <input 
                  type="password" 
                  className="form-control" 
                  value={adminPassword} 
                  onChange={e => setAdminPassword(e.target.value)} 
                  placeholder="Wpisz swoje hasło"
                  required 
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setSelectedProfile(null); setAdminPassword(''); setAuthError(''); }} disabled={authLoading}>
                  Wróć do listy
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={authLoading}>
                  {authLoading ? 'Logowanie...' : 'Zaloguj'}
                </button>
              </div>
            </form>
          ) : (
            <>
              {authLoading && <div style={{ textAlign: 'center', margin: '1rem 0' }}>Logowanie...</div>}
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 1fr)', 
                gap: '0.75rem', 
                maxHeight: '350px', 
                overflowY: 'auto', 
                paddingRight: '5px', 
                margin: '1.5rem 0' 
              }}>
                {Object.values(profiles).map(profile => (
                  <button 
                    key={profile.id}
                    className="btn btn-secondary" 
                    style={{ 
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '1.25rem 0.5rem',
                      height: '110px',
                      position: 'relative',
                      width: '100%'
                    }}
                    onClick={() => handleSelectProfile(profile)}
                    disabled={authLoading}
                  >
                    <span style={{ fontSize: '1.8rem', marginBottom: '0.35rem' }}>👤</span>
                    <span style={{ 
                      fontSize: '0.85rem', 
                      fontWeight: '500', 
                      textAlign: 'center', 
                      wordBreak: 'break-word',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: '1.2'
                    }}>
                      {profile.display_name}
                    </span>
                    {profile.is_admin && (
                      <span style={{ 
                        position: 'absolute', 
                        top: '5px', 
                        right: '5px', 
                        fontSize: '0.6rem', 
                        opacity: 0.8, 
                        background: 'var(--primary)', 
                        padding: '0.1rem 0.3rem', 
                        borderRadius: '4px' 
                      }}>
                        Admin
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="auth-switch">
                <button className="btn-link" onClick={() => {
                  setUnlocked(false);
                  localStorage.removeItem('gp_unlocked');
                  setPin('');
                }}>
                  🔒 Zablokuj aplikację
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Header / Navigation
  const renderNav = () => {
    const userProfile = profiles[user.id];
    const isAdmin = userProfile?.is_admin;

    return (
      <nav className="navbar">
        <div className="navbar-container">
          <div className="navbar-brand" onClick={() => { setView('dashboard'); setActiveOccasion(null); }}>
            🎁 Gift Planner
          </div>
          <div className="navbar-user">
            {isAdmin && (
              <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => setShowAddMemberModal(true)}>
                👤 Dodaj członka
              </button>
            )}
            <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              Cześć, <strong>{userProfile?.display_name || user.email?.split('@')[0]}</strong>!
            </span>
            <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={handleLogout}>
              Wyloguj
            </button>
          </div>
        </div>
      </nav>
    );
  };

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
                <button className="btn btn-primary" onClick={openGiftModal}>
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
                      <button className="btn btn-primary" onClick={openGiftModal}>
                        Dodaj prezent
                      </button>
                    </div>
                  ) : (
                    <div className="gifts-grid">
                      {solenizantGifts.map(gift => renderGiftCard(gift, false))}
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
                      <button className="btn btn-primary" onClick={openGiftModal}>
                        Dodaj pomysł-niespodziankę
                      </button>
                    </div>
                  ) : (
                    <div className="gifts-grid">
                      {sortedGoscieGifts.map(gift => renderGiftCard(gift, true))}
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
                <label>Linki do sklepów / warianty (opcjonalnie)</label>
                {giftVariants.map((variant, index) => (
                  <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input 
                      type="text" 
                      className="form-control" 
                      style={{ flex: 1 }}
                      placeholder="Nazwa sklepu (np. Allegro)" 
                      value={variant.label}
                      onChange={e => {
                        const newV = [...giftVariants];
                        newV[index].label = e.target.value;
                        setGiftVariants(newV);
                      }}
                    />
                    <input 
                      type="url" 
                      className="form-control" 
                      style={{ flex: 2 }}
                      placeholder="https://..." 
                      value={variant.url}
                      onChange={e => {
                        const newV = [...giftVariants];
                        newV[index].url = e.target.value;
                        setGiftVariants(newV);
                      }}
                    />
                    {giftVariants.length > 1 && (
                      <button 
                        type="button" 
                        className="btn btn-danger" 
                        style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center' }}
                        onClick={() => {
                          setGiftVariants(giftVariants.filter((_, i) => i !== index));
                        }}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', marginTop: '0.25rem' }}
                  onClick={() => setGiftVariants([...giftVariants, { label: '', url: '' }])}
                >
                  ➕ Dodaj kolejny link
                </button>
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

      {/* ----------------- ADD / MANAGE MEMBER MODAL (ADMIN ONLY) ----------------- */}
      {showAddMemberModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>Zarządzanie członkami rodziny</h2>
              <button className="close-btn" onClick={() => { setShowAddMemberModal(false); setEditingProfileId(null); }}>×</button>
            </div>

            {/* A. Form to Add Member */}
            <form onSubmit={handleAddMember} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Dodaj nowego członka</h3>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 2, margin: 0 }}>
                  <label>Imię i Nazwisko / Nick *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={newMemberName} 
                    onChange={e => setNewMemberName(e.target.value)} 
                    placeholder="np. Ciocia Halina" 
                    required 
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', gap: '1rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '42px', padding: '0 1rem' }} disabled={loading}>
                    Dodaj
                  </button>
                </div>
              </div>
              
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', marginBottom: 0 }}>
                <input 
                  type="checkbox" 
                  id="new_member_is_admin" 
                  checked={newMemberIsAdmin} 
                  onChange={e => setNewMemberIsAdmin(e.target.checked)} 
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="new_member_is_admin" style={{ margin: 0, textTransform: 'none', fontSize: '0.95rem', cursor: 'pointer', color: 'white' }}>
                  🔑 Nadaj uprawnienia administratora (Admin)
                </label>
              </div>

              {newMemberIsAdmin && (
                <div className="form-group" style={{ marginTop: '1rem', marginBottom: 0 }}>
                  <label>Hasło administratora *</label>
                  <input 
                    type="password" 
                    className="form-control" 
                    value={newMemberPassword} 
                    onChange={e => setNewMemberPassword(e.target.value)} 
                    placeholder="Hasło dla nowego admina" 
                    required 
                  />
                </div>
              )}
            </form>

            {/* B. List of Existing Members to Edit/Delete */}
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Lista członków</h3>
              <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '5px' }}>
                {Object.values(profiles).map(profile => {
                  const isCurrent = profile.id === user?.id;
                  const isEditing = editingProfileId === profile.id;
                  
                  return (
                    <div key={profile.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                        <span style={{ fontSize: '1.2rem' }}>👤</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            className="form-control" 
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', maxWidth: '200px' }}
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>
                            {profile.display_name} {isCurrent && <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>(Ty)</span>}
                          </span>
                        )}
                        {profile.is_admin && <span style={{ fontSize: '0.7rem', background: 'var(--primary)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>Admin</span>}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {isEditing ? (
                          <>
                            <button 
                              className="btn btn-primary" 
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                              onClick={() => handleRenameSave(profile.id)}
                              disabled={loading}
                            >
                              Zapisz
                            </button>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                              onClick={() => setEditingProfileId(null)}
                              disabled={loading}
                            >
                              Anuluj
                            </button>
                          </>
                        ) : (
                          <>
                            {!isCurrent && (
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                onClick={() => {
                                  setEditingProfileId(profile.id);
                                  setEditingName(profile.display_name);
                                }}
                              >
                                Edytuj
                              </button>
                            )}
                            {!isCurrent && (
                              <button 
                                className="btn btn-danger btn-secondary" 
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                onClick={() => handleConfirmDeleteMember(profile.id, profile.display_name)}
                              >
                                Usuń
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* C. Change App access PIN */}
            <form onSubmit={handleSavePin} style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Główny PIN dostępu do aplikacji</h3>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 2, margin: 0 }}>
                  <label>Nowy 4-cyfrowy kod PIN *</label>
                  <input 
                    type="password" 
                    maxLength={4}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    className="form-control" 
                    value={newAppPin}
                    onChange={e => setNewAppPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="np. 2026"
                    required 
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', gap: '1rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '42px', padding: '0 1rem' }} disabled={loading}>
                    Zapisz PIN
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ----------------- CONFIRMATION MODAL ----------------- */}
      {confirmModal.show && (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="modal-header" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, color: 'var(--accent-red)' }}>⚠️ {confirmModal.title}</h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1rem', lineHeight: '1.5' }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1 }} 
                onClick={() => setConfirmModal({ ...confirmModal, show: false })}
              >
                Anuluj
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                style={{ flex: 1 }} 
                onClick={async () => {
                  setConfirmModal(prev => ({ ...prev, show: false }));
                  await confirmModal.onConfirm();
                }}
              >
                Potwierdź
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>
            {toast.type === 'success' ? '✅' : '❌'} {toast.message}
          </div>
        </div>
      )}
    </>
  );
}

export default App;
