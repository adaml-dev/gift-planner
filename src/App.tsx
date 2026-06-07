import { useState, useEffect } from 'react';
import { supabase, authAdminClient } from './supabase';
import versionInfo from './version.json';

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
  time?: string;
  location?: string;
  google_maps_url?: string;
  description?: string;
  created_at: string;
  is_archived?: boolean;
  invited_user_ids?: string[];
  is_draft?: boolean;
  draft_allowed_user_ids?: string[];
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
  gift_id?: string | null;
  surprise_id?: string | null;
  user_id: string;
  created_at: string;
  is_group?: boolean;
  group_id?: string | null;
  is_approved?: boolean;
}

interface Vote {
  id: string;
  gift_id?: string | null;
  surprise_id?: string | null;
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
  const [initializing, setInitializing] = useState(true);

  // App navigation & core state
  const [view, setView] = useState<'dashboard' | 'occasion' | 'my-bookings' | 'login-logs'>('dashboard');
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [activeOccasion, setActiveOccasion] = useState<Occasion | null>(null);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [allGifts, setAllGifts] = useState<Gift[]>([]);
  const [surprises, setSurprises] = useState<any[]>([]);
  const [allSurprises, setAllSurprises] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);

  interface LoginLog {
    id: string;
    user_id: string;
    login_at: string;
    logout_at: string | null;
  }
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedLogUserFilter, setSelectedLogUserFilter] = useState<string>('all');
  
  // Tab control in Occasion view
  const [activeTab, setActiveTab] = useState<'solenizant' | 'goscie' | 'chat'>('solenizant');

  // Modals / Form states
  const [showOccasionModal, setShowOccasionModal] = useState(false);
  const [editingOccasion, setEditingOccasion] = useState<Occasion | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'przechowalnia' | 'upcoming' | 'archived'>('upcoming');
  const [newOccasionTitle, setNewOccasionTitle] = useState('');
  const [newOccasionOwnerName, setNewOccasionOwnerName] = useState('');
  const [newOccasionOwnerId, setNewOccasionOwnerId] = useState('');
  const [newOccasionDate, setNewOccasionDate] = useState('');
  const [newOccasionTime, setNewOccasionTime] = useState('');
  const [newOccasionLocation, setNewOccasionLocation] = useState('');
  const [newOccasionGoogleMapsUrl, setNewOccasionGoogleMapsUrl] = useState('');
  const [newOccasionDesc, setNewOccasionDesc] = useState('');
  const [newOccasionInvitedIds, setNewOccasionInvitedIds] = useState<string[]>([]);
  const [newOccasionIsDraft, setNewOccasionIsDraft] = useState(true);
  const [newOccasionDraftAllowedIds, setNewOccasionDraftAllowedIds] = useState<string[]>([]);
  const [copyUnpurchasedGifts, setCopyUnpurchasedGifts] = useState(true);

  // Locker ("Przechowalnia") states
  const [selectedGifts, setSelectedGifts] = useState<string[]>([]);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState('');
  const [moveNewOwnerName, setMoveNewOwnerName] = useState('');
  const [moveNewOwnerId, setMoveNewOwnerId] = useState('');
  const [showCreateLockerModal, setShowCreateLockerModal] = useState(false);
  const [newLockerOwnerName, setNewLockerOwnerName] = useState('');
  const [newLockerOwnerId, setNewLockerOwnerId] = useState('');
  const [hiddenSolenizants, setHiddenSolenizants] = useState<string[]>([]);

  const [showAddFromLockerModal, setShowAddFromLockerModal] = useState(false);
  const [addFromLockerSelectedGifts, setAddFromLockerSelectedGifts] = useState<string[]>([]);
  const [addFromLockerLockerId, setAddFromLockerLockerId] = useState('');
  const [showAddFromUnpurchasedModal, setShowAddFromUnpurchasedModal] = useState(false);
  const [addFromUnpurchasedSelectedGifts, setAddFromUnpurchasedSelectedGifts] = useState<string[]>([]);

  const [showGiftModal, setShowGiftModal] = useState(false);
  const [newGiftName, setNewGiftName] = useState('');
  const [newGiftDesc, setNewGiftDesc] = useState('');
  const [newGiftPrice, setNewGiftPrice] = useState('');
  const [giftVariants, setGiftVariants] = useState<{ label: string; url: string }[]>([{ label: '', url: '' }]);
  const [newAppPin, setNewAppPin] = useState('');
  const [autofillUrl, setAutofillUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [cameFromTab, setCameFromTab] = useState<'solenizant' | 'goscie' | null>(null);

  // General loading & message states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [bookingModal, setBookingModal] = useState<{ show: boolean; giftId: string; giftName: string; isSurprise?: boolean } | null>(null);
  const [activeOccasionDetails, setActiveOccasionDetails] = useState<Occasion | null>(null);
  const [activeGiftDetails, setActiveGiftDetails] = useState<any | null>(null);
  const [activeSurpriseDetails, setActiveSurpriseDetails] = useState<any | null>(null);
  const [giftModalIsSurprise, setGiftModalIsSurprise] = useState(false);
  const [editingGift, setEditingGift] = useState<any | null>(null);
  const [isSelectingSkladkaUsers, setIsSelectingSkladkaUsers] = useState(false);
  const [skladkaSelectedUsers, setSkladkaSelectedUsers] = useState<string[]>([]);
  const [lastReadMap, setLastReadMap] = useState<Record<string, string>>({});

  const updateLastRead = (threadId: string) => {
    if (!user) return;
    const nowStr = new Date().toISOString();
    setLastReadMap(prev => {
      const newMap = { ...prev, [threadId]: nowStr };
      try {
        localStorage.setItem(`gp_last_read_${user.id}`, JSON.stringify(newMap));
      } catch (e) {
        console.error(e);
      }
      return newMap;
    });
  };

  const getGiftChatStats = (giftId: string, isSurprise: boolean) => {
    const itemMessages = messages.filter(m => isSurprise ? m.surprise_id === giftId : m.gift_id === giftId);
    const totalCount = itemMessages.length;
    const threadId = isSurprise ? `surprise:${giftId}` : `gift:${giftId}`;
    const lastRead = lastReadMap[threadId] || '';
    const unreadCount = itemMessages.filter(m => m.user_id !== user?.id && (!lastRead || m.created_at > lastRead)).length;
    return { totalCount, unreadCount };
  };

  // Chat states
  const [messages, setMessages] = useState<any[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newComment, setNewComment] = useState('');
  const [chatFilter, setChatFilter] = useState<string>('all');
  const [showChatSearch, setShowChatSearch] = useState(false);
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

  // Find bookings of the current user that are rejected (i.e. not approved, but someone else has an approved booking for the same gift/surprise)
  const myRejectedBookings = user ? bookings.filter(b => {
    if (b.user_id !== user.id) return false;
    if (b.is_approved) return false;
    if (b.gift_id) {
      return bookings.some(otherB => otherB.gift_id === b.gift_id && otherB.is_approved);
    } else if (b.surprise_id) {
      return bookings.some(otherB => otherB.surprise_id === b.surprise_id && otherB.is_approved);
    }
    return false;
  }) : [];
  const myRejectedBookingsCount = myRejectedBookings.length;

  // 1. Monitor Auth status & Initialize App
  useEffect(() => {
    const initApp = async () => {
      // 1. Fetch profiles first
      await fetchProfiles();
      
      // 2. Get auth session
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          await syncProfile(session.user);
        }
      } catch (e) {
        console.error('Error fetching session:', e);
      } finally {
        setInitializing(false);
      }
    };

    initApp();

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

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (user) {
      fetchOccasions();
      fetchBookings();
      fetchAllGifts();
      fetchAllSurprises();
      fetchHiddenSolenizants();
    }
  }, [user]);

  useEffect(() => {
    setSelectedGifts([]);
  }, [activeOccasion, view]);

  // Log login on user auth state change
  useEffect(() => {
    const handleLoginLogging = async () => {
      if (user) {
        const cachedLogId = sessionStorage.getItem('gp_login_log_id');
        if (!cachedLogId) {
          try {
            const { data, error } = await supabase
              .from('gp_login_logs')
              .insert({ user_id: user.id })
              .select('id')
              .single();
            if (!error && data) {
              sessionStorage.setItem('gp_login_log_id', data.id);
            }
          } catch (e) {
            console.error('Error logging login:', e);
          }
        }
      }
    };

    handleLoginLogging();
  }, [user]);

  // Load lastReadMap on login
  useEffect(() => {
    if (user) {
      try {
        const data = localStorage.getItem(`gp_last_read_${user.id}`);
        setLastReadMap(data ? JSON.parse(data) : {});
      } catch {
        setLastReadMap({});
      }
    } else {
      setLastReadMap({});
    }
  }, [user]);

  // Mark chat threads read automatically
  useEffect(() => {
    if (activeTab === 'chat' && activeOccasion && chatFilter !== 'all') {
      updateLastRead(chatFilter);
    }
  }, [activeTab, chatFilter, activeOccasion]);

  useEffect(() => {
    if (activeGiftDetails) {
      updateLastRead(`gift:${activeGiftDetails.id}`);
    }
  }, [activeGiftDetails]);

  useEffect(() => {
    if (activeSurpriseDetails) {
      updateLastRead(`surprise:${activeSurpriseDetails.id}`);
    }
  }, [activeSurpriseDetails]);

  // 1.5. Event chat messages realtime subscription & handlers
  useEffect(() => {
    if (!activeOccasion) return;

    const channel = supabase
      .channel(`gp_messages:${activeOccasion.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gp_messages',
          filter: `occasion_id=eq.${activeOccasion.id}`
        },
        () => {
          fetchMessages(activeOccasion.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOccasion]);

  const formatMessageTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `dzisiaj, ${timeStr}`;
    }
    return `${d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}, ${timeStr}`;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeOccasion) return;

    const msgText = newMessage.trim();
    setNewMessage('');

    const insertData: any = {
      occasion_id: activeOccasion.id,
      user_id: user.id,
      message: msgText
    };

    if (chatFilter.startsWith('gift:')) {
      insertData.gift_id = chatFilter.split(':')[1];
    } else if (chatFilter.startsWith('surprise:')) {
      insertData.surprise_id = chatFilter.split(':')[1];
    }

    const { error } = await supabase
      .from('gp_messages')
      .insert(insertData);

    if (error) {
      setToast({ message: 'Nie udało się wysłać: ' + error.message, type: 'error' });
    } else {
      await fetchMessages(activeOccasion.id);
    }
  };

  const handleSendComment = async (e: React.FormEvent, itemId: string, isSurprise: boolean = false) => {
    e.preventDefault();
    if (!newComment.trim() || !activeOccasion) return;

    const commentText = newComment.trim();
    setNewComment('');

    const insertData: any = {
      occasion_id: activeOccasion.id,
      user_id: user.id,
      message: commentText
    };
    if (isSurprise) {
      insertData.surprise_id = itemId;
    } else {
      insertData.gift_id = itemId;
    }

    const { error } = await supabase
      .from('gp_messages')
      .insert(insertData);

    if (error) {
      setToast({ message: 'Nie udało się dodać komentarza: ' + error.message, type: 'error' });
    } else {
      await fetchMessages(activeOccasion.id);
      setToast({ message: 'Komentarz został dodany!', type: 'success' });
    }
  };

  // 3. Realtime updates subscription
  useEffect(() => {
    if (!activeOccasion) return;

    const channel = supabase
      .channel(`gp-realtime-${activeOccasion.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gp_gifts' }, () => {
        fetchGifts(activeOccasion.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gp_surprises' }, () => {
        fetchSurprises(activeOccasion.id);
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
      // Check if profile already exists in gp_profiles to avoid overwriting display_name
      const { data: existing } = await supabase
        .from('gp_profiles')
        .select('id')
        .eq('id', u.id)
        .single();

      if (existing) {
        fetchProfiles();
        return;
      }

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

  const fetchLoginLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('gp_login_logs')
        .select('*')
        .order('login_at', { ascending: false });
      if (!error && data) {
        setLoginLogs(data);
      }
    } catch (e) {
      console.error('Error fetching login logs:', e);
    } finally {
      setLoadingLogs(false);
    }
  };

  const logLogout = async () => {
    const cachedLogId = sessionStorage.getItem('gp_login_log_id');
    if (cachedLogId && user) {
      try {
        await supabase
          .from('gp_login_logs')
          .update({ logout_at: new Date().toISOString() })
          .eq('id', cachedLogId);
      } catch (e) {
        console.error('Error logging logout:', e);
      }
      sessionStorage.removeItem('gp_login_log_id');
    }
  };

  // 5. Fetch profiles, occasions, gifts, bookings, votes
  const fetchProfiles = async () => {
    const { data } = await supabase.from('gp_profiles').select('*');
    if (data) {
      const pMap: Record<string, Profile> = {};
      data.forEach(p => {
        // Exclude user 'lisiecki.adam' who is used in other apps and should not be displayed in gift-planner
        if (p.display_name !== 'lisiecki.adam' && p.id !== 'a8bdf339-a3ae-4066-9e25-33e9c4fae007') {
          pMap[p.id] = p;
        }
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

  const fetchSurprises = async (occasionId: string) => {
    const { data } = await supabase
      .from('gp_surprises')
      .select('*')
      .eq('occasion_id', occasionId)
      .order('created_at', { ascending: true });
    setSurprises(data || []);
  };

  const fetchAllSurprises = async () => {
    const { data } = await supabase
      .from('gp_surprises')
      .select('*');
    setAllSurprises(data || []);
  };

  const fetchMessages = async (occasionId: string) => {
    const { data } = await supabase
      .from('gp_messages')
      .select('*')
      .eq('occasion_id', occasionId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const fetchGifts = async (occasionId: string) => {
    const { data } = await supabase
      .from('gp_gifts')
      .select('*')
      .eq('occasion_id', occasionId)
      .order('created_at', { ascending: true });
    setGifts(data || []);
  };

  const fetchAllGifts = async () => {
    const { data } = await supabase
      .from('gp_gifts')
      .select('*');
    setAllGifts(data || []);
  };

  const fetchMyBookingsData = async () => {
    setLoading(true);
    await Promise.all([
      fetchBookings(),
      fetchOccasions(),
      fetchAllGifts(),
      fetchAllSurprises()
    ]);
    setLoading(false);
  };

  const openMyBookings = async () => {
    setView('my-bookings');
    setActiveOccasion(null);
    await fetchMyBookingsData();
  };

  const fetchBookings = async (_occasionId?: string) => {
    // Due to RLS surprise logic, owners will fail to fetch or fetch empty bookings automatically.
    // That's handled at Supabase RLS level.
    const { data } = await supabase
      .from('gp_bookings')
      .select('*')
      .order('created_at', { ascending: true });
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
    setActiveTab('solenizant');
    setChatFilter('all');
    setShowChatSearch(false);
    setLoading(true);
    await Promise.all([
      fetchGifts(occ.id),
      fetchSurprises(occ.id),
      fetchBookings(occ.id),
      fetchVotes(occ.id),
      fetchMessages(occ.id)
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
    await logLogout();
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
    await logLogout();

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

  const fetchHiddenSolenizants = async () => {
    try {
      const { data, error } = await supabase
        .from('gp_settings')
        .select('*')
        .eq('key', 'hidden_solenizants')
        .maybeSingle();
      if (!error && data) {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed)) {
          setHiddenSolenizants(parsed);
        }
      }
    } catch (e) {
      console.error('Error fetching hidden solenizants:', e);
    }
  };

  const handleHideSolenizant = async (solenizant: { owner_name: string; owner_id: string | null }, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const key = `${solenizant.owner_name.toLowerCase()}||${solenizant.owner_id || ''}`;
    const newHiddenList = [...hiddenSolenizants, key];
    const { error } = await supabase
      .from('gp_settings')
      .upsert({ key: 'hidden_solenizants', value: JSON.stringify(newHiddenList) });
    if (error) {
      setToast({ message: 'Błąd ukrywania: ' + error.message, type: 'error' });
    } else {
      setHiddenSolenizants(newHiddenList);
      setToast({ message: `Solenizant ${solenizant.owner_name} został ukryty.`, type: 'success' });
    }
  };

  const handleDeleteGiftsBulk = async () => {
    if (selectedGifts.length === 0) return;
    setConfirmModal({
      show: true,
      title: 'Usuń zaznaczone prezenty',
      message: `Czy na pewno chcesz trwale usunąć zaznaczone prezenty (${selectedGifts.length})?`,
      onConfirm: async () => {
        setLoading(true);
        const { error: errorGifts } = await supabase
          .from('gp_gifts')
          .delete()
          .in('id', selectedGifts);
        const { error: errorSurprises } = await supabase
          .from('gp_surprises')
          .delete()
          .in('id', selectedGifts);
        if (errorGifts || errorSurprises) {
          setToast({ message: 'Wystąpił błąd podczas usuwania niektórych prezentów', type: 'error' });
        } else {
          setToast({ message: 'Pomyślnie usunięto zaznaczone prezenty', type: 'success' });
          setSelectedGifts([]);
          if (activeOccasion) {
            await fetchGifts(activeOccasion.id);
            await fetchSurprises(activeOccasion.id);
          }
          await fetchAllGifts();
          await fetchAllSurprises();
          await fetchBookings();
        }
        setLoading(false);
      }
    });
  };

  const handleMoveGifts = async (targetOccasionId: string, newOwnerName: string, newOwnerId: string) => {
    if (selectedGifts.length === 0) return;
    setLoading(true);
    try {
      let destOccasionId = targetOccasionId;
      if (destOccasionId === 'new' || !destOccasionId) {
        if (!newOwnerName.trim()) {
          setToast({ message: 'Musisz podać imię właściciela nowej Przechowalni!', type: 'error' });
          setLoading(false);
          return;
        }
        const newOcc = {
          title: '__PRZECHOWALNIA__',
          owner_name: newOwnerName.trim(),
          owner_id: newOwnerId || null,
          creator_id: user.id,
          date: '2099-12-31',
          is_draft: false,
          invited_user_ids: Object.keys(profiles),
          created_at: new Date().toISOString()
        };
        const { data, error } = await supabase
          .from('gp_occasions')
          .insert(newOcc)
          .select('id')
          .single();
        if (error || !data) {
          throw new Error('Błąd podczas tworzenia nowej Przechowalni: ' + error?.message);
        }
        destOccasionId = data.id;
        await fetchOccasions();
      }
      const { error: moveGiftsError } = await supabase
        .from('gp_gifts')
        .update({ occasion_id: destOccasionId })
        .in('id', selectedGifts);
      if (moveGiftsError) {
        throw new Error('Błąd podczas przenoszenia prezentów: ' + moveGiftsError.message);
      }
      const surprisesToMove = allSurprises.filter(s => selectedGifts.includes(s.id));
      if (surprisesToMove.length > 0) {
        const giftsToInsert = surprisesToMove.map(s => ({
          occasion_id: destOccasionId,
          name: s.name,
          description: s.description,
          price: s.price || null,
          url: s.url || null,
          urls: s.urls || null,
          suggested_by: s.suggested_by || user.id,
          created_at: new Date().toISOString()
        }));
        const { error: insertSurprisesError } = await supabase
          .from('gp_gifts')
          .insert(giftsToInsert);
        if (insertSurprisesError) {
          throw new Error('Błąd podczas przenoszenia niespodzianek: ' + insertSurprisesError.message);
        }
        const { error: deleteSurprisesError } = await supabase
          .from('gp_surprises')
          .delete()
          .in('id', surprisesToMove.map(s => s.id));
        if (deleteSurprisesError) {
          throw new Error('Błąd podczas usuwania przeniesionych niespodzianek: ' + deleteSurprisesError.message);
        }
      }
      setToast({ message: 'Pomyślnie przeniesiono prezenty do Przechowalni', type: 'success' });
      setSelectedGifts([]);
      setShowMoveModal(false);
      setMoveTargetId('');
      setMoveNewOwnerName('');
      setMoveNewOwnerId('');
      if (activeOccasion) {
        await fetchGifts(activeOccasion.id);
        await fetchSurprises(activeOccasion.id);
      }
      await fetchAllGifts();
      await fetchAllSurprises();
    } catch (err: any) {
      setToast({ message: err.message || 'Wystąpił błąd', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLocker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLockerOwnerName.trim()) {
      setToast({ message: 'Imię właściciela jest wymagane!', type: 'error' });
      return;
    }
    setLoading(true);
    const newOcc = {
      title: '__PRZECHOWALNIA__',
      owner_name: newLockerOwnerName.trim(),
      owner_id: newLockerOwnerId || null,
      creator_id: user.id,
      date: '2099-12-31',
      is_draft: false,
      invited_user_ids: Object.keys(profiles),
      created_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('gp_occasions')
      .insert(newOcc)
      .select('*')
      .single();
    if (error || !data) {
      setToast({ message: 'Nie udało się utworzyć Przechowalni: ' + error?.message, type: 'error' });
    } else {
      setToast({ message: 'Przechowalnia została utworzona!', type: 'success' });
      setShowCreateLockerModal(false);
      setNewLockerOwnerName('');
      setNewLockerOwnerId('');
      await fetchOccasions();
      setActiveOccasion(data);
      setView('occasion');
    }
    setLoading(false);
  };

  const getUnpurchasedGiftsForSolenizant = (solenizantName: string, solenizantId: string | null) => {
    const solenizantOccasions = occasions.filter(occ => 
      occ.id !== activeOccasion?.id &&
      occ.title !== '__PRZECHOWALNIA__' &&
      ((solenizantId && occ.owner_id === solenizantId) || 
       (occ.owner_name.trim().toLowerCase() === solenizantName.trim().toLowerCase()))
    );
    const occIds = solenizantOccasions.map(occ => occ.id);
    const solenizantGifts = allGifts.filter(g => occIds.includes(g.occasion_id));
    const unpurchased = solenizantGifts.filter(gift => {
      const giftBookings = bookings.filter(b => b.gift_id === gift.id);
      const hasApproved = giftBookings.some(b => b.is_approved);
      return !hasApproved;
    });
    return unpurchased;
  };

  const getLockerGiftsForSolenizant = (lockerId: string) => {
    return allGifts.filter(g => g.occasion_id === lockerId);
  };

  const handleAddFromLocker = async () => {
    if (addFromLockerSelectedGifts.length === 0 || !activeOccasion) return;
    setLoading(true);
    try {
      const selectedItems = allGifts.filter(g => addFromLockerSelectedGifts.includes(g.id));
      const giftsToInsert = selectedItems.map(g => ({
        occasion_id: activeOccasion.id,
        name: g.name,
        description: g.description || null,
        price: g.price || null,
        url: g.url || null,
        urls: g.urls || null,
        suggested_by: user.id,
        created_at: new Date().toISOString()
      }));
      const { error } = await supabase
        .from('gp_gifts')
        .insert(giftsToInsert);
      if (error) throw error;
      setToast({ message: `Pomyślnie dodano ${giftsToInsert.length} prezentów z Przechowalni.`, type: 'success' });
      setShowAddFromLockerModal(false);
      setAddFromLockerSelectedGifts([]);
      await fetchGifts(activeOccasion.id);
      await fetchAllGifts();
    } catch (e: any) {
      setToast({ message: 'Błąd podczas dodawania: ' + e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddFromUnpurchased = async () => {
    if (addFromUnpurchasedSelectedGifts.length === 0 || !activeOccasion) return;
    setLoading(true);
    try {
      const selectedItems = allGifts.filter(g => addFromUnpurchasedSelectedGifts.includes(g.id));
      const giftsToInsert = selectedItems.map(g => ({
        occasion_id: activeOccasion.id,
        name: g.name,
        description: g.description || null,
        price: g.price || null,
        url: g.url || null,
        urls: g.urls || null,
        suggested_by: user.id,
        created_at: new Date().toISOString()
      }));
      const { error } = await supabase
        .from('gp_gifts')
        .insert(giftsToInsert);
      if (error) throw error;
      setToast({ message: `Pomyślnie dodano ${giftsToInsert.length} niekupionych prezentów.`, type: 'success' });
      setShowAddFromUnpurchasedModal(false);
      setAddFromUnpurchasedSelectedGifts([]);
      await fetchGifts(activeOccasion.id);
      await fetchAllGifts();
    } catch (e: any) {
      setToast({ message: 'Błąd podczas dodawania: ' + e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
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
    await logLogout();
    await supabase.auth.signOut();
  };

  // Occasion Form Cleanups & Helpers
  const clearOccasionForm = () => {
    setNewOccasionTitle('');
    setNewOccasionOwnerName('');
    setNewOccasionOwnerId('');
    setNewOccasionDate('');
    setNewOccasionTime('');
    setNewOccasionLocation('');
    setNewOccasionGoogleMapsUrl('');
    setNewOccasionDesc('');
    setNewOccasionInvitedIds([]);
    setNewOccasionIsDraft(true);
    setNewOccasionDraftAllowedIds([]);
    setCopyUnpurchasedGifts(true);
  };

  const closeOccasionModal = () => {
    setShowOccasionModal(false);
    setEditingOccasion(null);
    clearOccasionForm();
  };

  const openNewOccasionModal = () => {
    setEditingOccasion(null);
    clearOccasionForm();
    setNewOccasionInvitedIds(Object.keys(profiles));
    setNewOccasionIsDraft(true);
    setNewOccasionDraftAllowedIds([]);
    setShowOccasionModal(true);
  };

  const startEditOccasion = (occ: Occasion, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingOccasion(occ);
    setNewOccasionTitle(occ.title);
    setNewOccasionOwnerName(occ.owner_name);
    setNewOccasionOwnerId(occ.owner_id || '');
    setNewOccasionDate(occ.date);
    setNewOccasionTime(occ.time || '');
    setNewOccasionLocation(occ.location || '');
    setNewOccasionGoogleMapsUrl(occ.google_maps_url || '');
    setNewOccasionDesc(occ.description || '');
    setNewOccasionInvitedIds(occ.invited_user_ids || Object.keys(profiles));
    setNewOccasionIsDraft(occ.is_draft || false);
    setNewOccasionDraftAllowedIds(occ.draft_allowed_user_ids || []);
    setShowOccasionModal(true);
  };

  const handleToggleArchiveOccasion = async (occ: Occasion, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newArchivedState = !occ.is_archived;
    setLoading(true);
    const { error } = await supabase
      .from('gp_occasions')
      .update({ is_archived: newArchivedState })
      .eq('id', occ.id);

    if (error) {
      setToast({ message: 'Nie udało się zmienić statusu archiwizacji: ' + error.message, type: 'error' });
    } else {
      fetchOccasions();
      setToast({ 
        message: newArchivedState ? 'Wydarzenie zostało zarchiwizowane!' : 'Wydarzenie zostało przywrócone z archiwum!', 
        type: 'success' 
      });
      if (activeOccasionDetails && activeOccasionDetails.id === occ.id) {
        setActiveOccasionDetails({ ...activeOccasionDetails, is_archived: newArchivedState });
      }
      if (activeOccasion && activeOccasion.id === occ.id) {
        setActiveOccasion({ ...activeOccasion, is_archived: newArchivedState });
      }
    }
    setLoading(false);
  };

  const handleApproveOccasion = async (occId: string, isDetailsModal: boolean) => {
    setLoading(true);
    const { error } = await supabase
      .from('gp_occasions')
      .update({ is_draft: false })
      .eq('id', occId);

    if (error) {
      setToast({ message: 'Nie udało się zatwierdzić: ' + error.message, type: 'error' });
    } else {
      fetchOccasions();
      setToast({ message: 'Wydarzenie zostało zatwierdzone!', type: 'success' });
      if (isDetailsModal) {
        if (activeOccasionDetails && activeOccasionDetails.id === occId) {
          setActiveOccasionDetails({ ...activeOccasionDetails, is_draft: false });
        }
      } else {
        if (activeOccasion && activeOccasion.id === occId) {
          setActiveOccasion({ ...activeOccasion, is_draft: false });
        }
      }
    }
    setLoading(false);
  };

  // Add / Edit Occasion logic
  const handleSaveOccasion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOccasionTitle.trim() || !newOccasionOwnerName.trim() || !newOccasionDate) {
      setToast({ message: 'Wypełnij wymagane pola!', type: 'error' });
      return;
    }

    setLoading(true);
    if (editingOccasion) {
      const { error } = await supabase
        .from('gp_occasions')
        .update({
          title: newOccasionTitle,
          owner_name: newOccasionOwnerName,
          owner_id: newOccasionOwnerId || null,
          date: newOccasionDate,
          time: newOccasionTime || null,
          location: newOccasionLocation || null,
          google_maps_url: newOccasionGoogleMapsUrl || null,
          description: newOccasionDesc,
          invited_user_ids: newOccasionInvitedIds,
          is_draft: newOccasionIsDraft,
          draft_allowed_user_ids: newOccasionDraftAllowedIds
        })
        .eq('id', editingOccasion.id);

      if (error) {
        setToast({ message: 'Nie udało się zaktualizować okazji: ' + error.message, type: 'error' });
      } else {
        setShowOccasionModal(false);
        setEditingOccasion(null);
        clearOccasionForm();
        fetchOccasions();
        if (activeOccasion && activeOccasion.id === editingOccasion.id) {
          setActiveOccasion({
            ...activeOccasion,
            title: newOccasionTitle,
            owner_name: newOccasionOwnerName,
            owner_id: newOccasionOwnerId || undefined,
            date: newOccasionDate,
            time: newOccasionTime || undefined,
            location: newOccasionLocation || undefined,
            google_maps_url: newOccasionGoogleMapsUrl || undefined,
            description: newOccasionDesc || undefined,
            invited_user_ids: newOccasionInvitedIds,
            is_draft: newOccasionIsDraft,
            draft_allowed_user_ids: newOccasionDraftAllowedIds
          });
        }
        setToast({ message: 'Okazja została zaktualizowana!', type: 'success' });
      }
    } else {
      const { data: newOccasion, error } = await supabase
        .from('gp_occasions')
        .insert({
          title: newOccasionTitle,
          owner_name: newOccasionOwnerName,
          owner_id: newOccasionOwnerId || null,
          creator_id: user.id,
          date: newOccasionDate,
          time: newOccasionTime || null,
          location: newOccasionLocation || null,
          google_maps_url: newOccasionGoogleMapsUrl || null,
          description: newOccasionDesc,
          is_archived: false,
          invited_user_ids: newOccasionInvitedIds,
          is_draft: newOccasionIsDraft,
          draft_allowed_user_ids: newOccasionDraftAllowedIds
        })
        .select()
        .single();

      if (error) {
        setToast({ message: 'Nie udało się utworzyć okazji: ' + error.message, type: 'error' });
      } else {
        if (copyUnpurchasedGifts && newOccasion) {
          try {
            const pastOccasions = occasions.filter(occ => 
              (newOccasionOwnerId && occ.owner_id === newOccasionOwnerId) ||
              (occ.owner_name.trim().toLowerCase() === newOccasionOwnerName.trim().toLowerCase())
            );
            const pastOccasionIds = pastOccasions.map(o => o.id);
            if (pastOccasionIds.length > 0) {
              const unpurchasedGifts = allGifts.filter(gift => 
                pastOccasionIds.includes(gift.occasion_id) &&
                !bookings.some(b => b.gift_id === gift.id && b.is_approved)
              );
              if (unpurchasedGifts.length > 0) {
                const uniqueGiftsMap = new Map();
                unpurchasedGifts.forEach(g => {
                  const nameKey = g.name.trim().toLowerCase();
                  if (!uniqueGiftsMap.has(nameKey)) {
                    uniqueGiftsMap.set(nameKey, g);
                  }
                });
                const uniqueUnpurchasedGifts = Array.from(uniqueGiftsMap.values());
                const giftsToInsert = uniqueUnpurchasedGifts.map(g => ({
                  occasion_id: newOccasion.id,
                  name: g.name,
                  description: g.description || null,
                  price: g.price || null,
                  url: g.url || null,
                  urls: g.urls || [],
                  suggested_by: g.suggested_by || user.id,
                  is_secret: g.is_secret || false
                }));
                if (giftsToInsert.length > 0) {
                  const { error: insertGiftsError } = await supabase
                    .from('gp_gifts')
                    .insert(giftsToInsert);
                  if (insertGiftsError) {
                    console.error('Error copying gifts:', insertGiftsError);
                    setToast({ message: 'Okazja utworzona, ale nie udało się skopiować prezentów: ' + insertGiftsError.message, type: 'error' });
                  } else {
                    await fetchAllGifts();
                  }
                }
              }
            }
          } catch (copyErr: any) {
            console.error('Error copying gifts:', copyErr);
          }
        }
        setShowOccasionModal(false);
        clearOccasionForm();
        fetchOccasions();
        setToast({ message: 'Okazja została zaplanowana!', type: 'success' });
      }
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
          setView('dashboard');
          setActiveOccasion(null);
          setToast({ message: 'Okazja została usunięta.', type: 'success' });
        }
        setLoading(false);
      }
    });
  };

  const openGiftModal = (isSurprise: boolean) => {
    setEditingGift(null);
    setGiftModalIsSurprise(isSurprise);
    setNewGiftName('');
    setNewGiftDesc('');
    setNewGiftPrice('');
    setGiftVariants([{ label: '', url: '' }]);
    setAutofillUrl('');
    setScraping(false);
    setShowGiftModal(true);
  };

  const startEditGift = (item: any, isSurprise: boolean) => {
    setEditingGift(item);
    setGiftModalIsSurprise(isSurprise);
    setNewGiftName(item.name || '');
    setNewGiftDesc(item.description || '');
    setNewGiftPrice(item.price ? item.price.toString() : '');
    setGiftVariants(item.urls && item.urls.length > 0 ? item.urls : [{ label: '', url: '' }]);
    setAutofillUrl('');
    setScraping(false);
    setActiveGiftDetails(null);
    setActiveSurpriseDetails(null);
    setShowGiftModal(true);
  };

  const handleAutofillFromUrl = async () => {
    if (!autofillUrl.trim()) return;
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-product', {
        body: { url: autofillUrl.trim() }
      });

      if (error) {
        throw new Error(error.message || 'Nie udało się pobrać danych produktu');
      }

      if (data) {
        if (data.error) {
          throw new Error(data.error);
        }
        if (data.name) setNewGiftName(data.name);
        if (data.description) setNewGiftDesc(data.description);
        if (data.price && !giftModalIsSurprise) setNewGiftPrice(data.price);
        
        const host = data.shopName || 'Sklep';
        setGiftVariants([{ label: host, url: autofillUrl.trim() }]);
        setToast({ message: 'Udało się pobrać dane produktu!', type: 'success' });
      }
    } catch (err: any) {
      setToast({ message: 'Błąd pobierania danych: ' + err.message, type: 'error' });
    } finally {
      setScraping(false);
    }
  };

  // Add or Edit Gift/Surprise logic
  const handleSaveGift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGiftName.trim() || !activeOccasion) return;

    setLoading(true);
    const isSurprise = giftModalIsSurprise;

    const filteredVariants = giftVariants
      .filter(v => v.url.trim() !== '')
      .map(v => ({
        label: v.label.trim() || 'Sklep',
        url: v.url.trim()
      }));

    const saveData: any = {
      occasion_id: activeOccasion.id,
      name: newGiftName,
      description: newGiftDesc || null,
      price: isSurprise ? null : (newGiftPrice ? parseFloat(newGiftPrice) : null),
      url: filteredVariants[0]?.url || null,
      urls: filteredVariants,
      suggested_by: editingGift ? editingGift.suggested_by : user.id
    };

    let error = null;
    if (editingGift) {
      const { error: updateError } = await supabase
        .from(isSurprise ? 'gp_surprises' : 'gp_gifts')
        .update(saveData)
        .eq('id', editingGift.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from(isSurprise ? 'gp_surprises' : 'gp_gifts')
        .insert(saveData);
      error = insertError;
    }

    if (error) {
      setToast({ message: 'Nie udało się zapisać: ' + error.message, type: 'error' });
    } else {
      setShowGiftModal(false);
      setNewGiftName('');
      setNewGiftDesc('');
      setNewGiftPrice('');
      setGiftVariants([{ label: '', url: '' }]);
      setEditingGift(null);
      if (isSurprise) {
        await fetchSurprises(activeOccasion.id);
      } else {
        await fetchGifts(activeOccasion.id);
      }
      await fetchAllGifts();
      await fetchAllSurprises();
      setToast({ 
        message: editingGift 
          ? (isSurprise ? 'Niespodzianka została zaktualizowana.' : 'Prezent został zaktualizowany.') 
          : (isSurprise ? 'Niespodzianka została dodana.' : 'Prezent został dodany do listy.'), 
        type: 'success' 
      });
    }
    setLoading(false);
  };

  const handleDeleteItem = (itemId: string, isSurprise: boolean = false) => {
    setConfirmModal({
      show: true,
      title: isSurprise ? 'Usuń niespodziankę' : 'Usuń prezent',
      message: isSurprise ? 'Czy chcesz usunąć tę niespodziankę z listy?' : 'Czy chcesz usunąć ten prezent z listy?',
      onConfirm: async () => {
        setLoading(true);
        const { error } = await supabase
          .from(isSurprise ? 'gp_surprises' : 'gp_gifts')
          .delete()
          .eq('id', itemId);

        if (error) {
          setToast({ message: 'Błąd podczas usuwania: ' + error.message, type: 'error' });
        } else if (activeOccasion) {
          if (isSurprise) {
            await fetchSurprises(activeOccasion.id);
          } else {
            await fetchGifts(activeOccasion.id);
          }
          await fetchAllGifts();
          await fetchAllSurprises();
          setToast({ message: isSurprise ? 'Niespodzianka została usunięta.' : 'Prezent został usunięty.', type: 'success' });
        }
        setLoading(false);
      }
    });
  };

  // Booking logic
  const handleBook = async (itemId: string, isGroup: boolean = false, groupId: string | null = null, isSurprise: boolean = false, additionalUserIds: string[] = []) => {
    if (isGroup && groupId) {
      const rows = [
        {
          user_id: user.id,
          is_group: true,
          group_id: groupId,
          [isSurprise ? 'surprise_id' : 'gift_id']: itemId
        },
        ...additionalUserIds.map(uid => ({
          user_id: uid,
          is_group: true,
          group_id: groupId,
          [isSurprise ? 'surprise_id' : 'gift_id']: itemId
        }))
      ];

      const { error } = await supabase
        .from('gp_bookings')
        .insert(rows);

      if (error) {
        setToast({ message: 'Błąd rezerwacji grupowej: ' + error.message, type: 'error' });
      } else if (activeOccasion) {
        fetchBookings(activeOccasion.id);
        setToast({ message: additionalUserIds.length > 0 ? 'Utworzono składkę grupową ze wskazanymi uczestnikami!' : 'Składka grupowa została zorganizowana!', type: 'success' });
      }
    } else {
      const insertData: any = { 
        user_id: user.id, 
        is_group: isGroup,
        group_id: groupId 
      };
      if (isSurprise) {
        insertData.surprise_id = itemId;
      } else {
        insertData.gift_id = itemId;
      }

      const { error } = await supabase
        .from('gp_bookings')
        .insert(insertData);

      if (error) {
        setToast({ message: 'Błąd rezerwacji: ' + error.message, type: 'error' });
      } else if (activeOccasion) {
        fetchBookings(activeOccasion.id);
        setToast({ message: 'Zarezerwowano prezent!', type: 'success' });
      }
    }
  };

  // Join existing group booking (składka)
  const handleJoinGroup = async (itemId: string, groupId: string, isSurprise: boolean = false) => {
    if (!groupId) {
      setToast({ message: 'Brak identyfikatora składki, nie można dołączyć.', type: 'error' });
      return;
    }
    const insertData: any = {
      user_id: user.id,
      is_group: true,
      group_id: groupId,
    };
    if (isSurprise) {
      insertData.surprise_id = itemId;
    } else {
      insertData.gift_id = itemId;
    }
    const { error } = await supabase
      .from('gp_bookings')
      .insert(insertData);
    if (error) {
      setToast({ message: 'Błąd dołączania do składki: ' + error.message, type: 'error' });
    } else if (activeOccasion) {
      fetchBookings(activeOccasion.id);
      setToast({ message: 'Dołączono do składki grupowej!', type: 'success' });
    }
  };

  const handleUnbook = async (itemId: string, isSurprise: boolean = false) => {
    const { error } = await supabase
      .from('gp_bookings')
      .delete()
      .eq(isSurprise ? 'surprise_id' : 'gift_id', itemId)
      .eq('user_id', user.id);

    if (error) {
      setToast({ message: 'Błąd anulowania rezerwacji: ' + error.message, type: 'error' });
    } else {
      if (activeOccasion) {
        fetchBookings(activeOccasion.id);
      }
      setToast({ message: 'Anulowano rezerwację prezentu.', type: 'success' });
    }
  };

  // Voting logic
  const handleVote = async (itemId: string, isSurprise: boolean = false) => {
    const insertData: any = { user_id: user.id };
    if (isSurprise) {
      insertData.surprise_id = itemId;
    } else {
      insertData.gift_id = itemId;
    }

    const { error } = await supabase
      .from('gp_votes')
      .insert(insertData);

    if (error) {
      setToast({ message: 'Błąd głosowania: ' + error.message, type: 'error' });
    } else if (activeOccasion) {
      fetchVotes(activeOccasion.id);
      setToast({ message: 'Oddano głos na pomysł!', type: 'success' });
    }
  };

  const handleUnvote = async (itemId: string, isSurprise: boolean = false) => {
    const { error } = await supabase
      .from('gp_votes')
      .delete()
      .eq(isSurprise ? 'surprise_id' : 'gift_id', itemId)
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
  const isOwnerActiveOccasion = activeOccasion?.owner_id === user?.id || activeOccasion?.title === '__PRZECHOWALNIA__';
  
  // Solenizant tab includes all gifts in public.gp_gifts table.
  const solenizantGifts = gifts;

  // Guest tab (Pomysły gości) includes:
  // - Surprises loaded from gp_surprises table
  // - These are only shown if current user is NOT the owner of this occasion
  const goscieGifts = isOwnerActiveOccasion ? [] : surprises;

  // Sort goscieGifts by votes count
  const getVoteCount = (itemId: string, isSurprise: boolean = false) => 
    votes.filter(v => isSurprise ? v.surprise_id === itemId : v.gift_id === itemId).length;

  const hasUserVoted = (itemId: string, isSurprise: boolean = false) => 
    votes.some(v => (isSurprise ? v.surprise_id === itemId : v.gift_id === itemId) && v.user_id === user?.id);
  
  const sortedGoscieGifts = [...goscieGifts].sort((a, b) => getVoteCount(b.id, true) - getVoteCount(a.id, true));

  const handleToggleApproveSurprise = async (surpriseId: string, approve: boolean) => {
    setLoading(true);
    const { error } = await supabase
      .from('gp_surprises')
      .update({ is_approved: approve })
      .eq('id', surpriseId);

    if (error) {
      setToast({ message: 'Nie udało się zmienić statusu zatwierdzenia niespodzianki: ' + error.message, type: 'error' });
    } else {
      if (activeOccasion) {
        await fetchSurprises(activeOccasion.id);
      }
      await fetchAllSurprises();
      setToast({ 
        message: approve ? 'Niespodzianka została zatwierdzona do realizacji!' : 'Cofnięto zatwierdzenie niespodzianki.', 
        type: 'success' 
      });
      if (activeGiftDetails && activeGiftDetails.id === surpriseId) {
        setActiveGiftDetails((prev: any) => prev ? { ...prev, is_approved: approve } : null);
      }
      if (activeSurpriseDetails && activeSurpriseDetails.id === surpriseId) {
        setActiveSurpriseDetails((prev: any) => prev ? { ...prev, is_approved: approve } : null);
      }
    }
    setLoading(false);
  };

  const handleToggleApproveBooking = async (bookingId: string, approve: boolean) => {
    setLoading(true);
    const booking = bookings.find(b => b.id === bookingId);
    let queryBuilder = supabase.from('gp_bookings').update({ is_approved: approve });
    
    if (booking && booking.is_group && booking.group_id) {
      queryBuilder = queryBuilder.eq('group_id', booking.group_id);
    } else {
      queryBuilder = queryBuilder.eq('id', bookingId);
    }

    const { error } = await queryBuilder;

    if (error) {
      setToast({ message: 'Nie udało się zmienić statusu zatwierdzenia: ' + error.message, type: 'error' });
    } else {
      if (activeOccasion) {
        await fetchBookings(activeOccasion.id);
      }
      setToast({ 
        message: approve ? 'Zatwierdzono zakup! Rezerwacja stała się poleceniem zakupu.' : 'Cofnięto zatwierdzenie zakupu.', 
        type: 'success' 
      });
    }
    setLoading(false);
  };

  const renderGiftQueueAndActions = (item: any, isSurprise: boolean = false) => {
    if (isSurprise) {
      const isOrganizer = activeOccasion?.creator_id === user?.id;
      const suggesterName = profiles[item.suggested_by]?.display_name || 'Ktoś';
      
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
          <div 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.35rem', 
              background: item.is_approved 
                ? 'rgba(16, 185, 129, 0.08)' 
                : 'rgba(255, 255, 255, 0.02)', 
              padding: '0.6rem 0.8rem', 
              borderRadius: '8px', 
              border: item.is_approved 
                ? '1px solid rgba(16, 185, 129, 0.25)' 
                : '1px solid rgba(255, 255, 255, 0.05)',
              fontSize: '0.85rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                🤫 Pomysł gości
              </span>
              {item.is_approved ? (
                <span 
                  className="badge badge-success" 
                  style={{ 
                    fontSize: '0.7rem', 
                    background: 'rgba(16, 185, 129, 0.15)', 
                    color: '#10b981', 
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    padding: '0.15rem 0.4rem',
                    borderRadius: '4px'
                  }}
                >
                  ✓ Zatwierdzona
                </span>
              ) : (
                <span 
                  className="badge badge-warning" 
                  style={{ 
                    fontSize: '0.7rem', 
                    background: 'rgba(245, 158, 11, 0.15)', 
                    color: '#fba524', 
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    padding: '0.15rem 0.4rem',
                    borderRadius: '4px'
                  }}
                >
                  ⏳ Propozycja
                </span>
              )}
            </div>

            <div style={{ color: 'white', fontWeight: 500, marginTop: '0.25rem' }}>
              Realizuje autor: <strong style={{ color: 'var(--text-primary)' }}>{suggesterName}</strong>
            </div>

            {item.is_approved && (
              <div style={{ fontSize: '0.75rem', color: 'var(--accent-green, #34d399)', fontStyle: 'italic', marginTop: '0.2rem' }}>
                Organizator zatwierdził tę niespodziankę!
              </div>
            )}

            {isOrganizer && (
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                {item.is_approved ? (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}
                    onClick={() => handleToggleApproveSurprise(item.id, false)}
                  >
                    🔄 Cofnij zatwierdzenie
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#10b981', borderColor: '#10b981' }}
                    onClick={() => handleToggleApproveSurprise(item.id, true)}
                  >
                    ✅ Zatwierdź
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    // --- GIFTS: group bookings by group_id ---
    const allGiftBookings = bookings.filter(b => isSurprise ? b.surprise_id === item.id : b.gift_id === item.id);

    // Build groups: { groupKey -> bookings[] }
    // groupKey = group_id for group bookings, or booking.id for solo bookings
    const groupMap = new Map<string, any[]>();
    allGiftBookings.forEach(b => {
      const key = (b.is_group && b.group_id) ? b.group_id : b.id;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(b);
    });

    const groups = Array.from(groupMap.entries()); // [key, bookings[]]

    const myBooking = allGiftBookings.find(b => b.user_id === user?.id);
    const hasMyBooking = !!myBooking;
    const approvedBooking = allGiftBookings.find(b => b.is_approved);
    const hasApproved = !!approvedBooking;
    const isOrganizer = activeOccasion?.creator_id === user?.id;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
        {groups.length > 0 && (
          <div className="bookings-queue" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {groups.map(([groupKey, groupBookings], idx) => {
              const isGroup = groupBookings[0].is_group && !!groupBookings[0].group_id;
              const isThisGroupApproved = groupBookings.some(b => b.is_approved);
              const isMyGroup = groupBookings.some(b => b.user_id === user?.id);
              const memberNames = groupBookings.map(b => {
                const name = profiles[b.user_id]?.display_name || 'Znajomy';
                return b.user_id === user?.id ? 'Ty' : name;
              });

              return (
                <div
                  key={groupKey}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    background: isThisGroupApproved
                      ? 'rgba(16, 185, 129, 0.08)'
                      : (hasApproved ? 'rgba(239, 68, 68, 0.03)' : 'rgba(255, 255, 255, 0.02)'),
                    padding: '0.6rem 0.8rem',
                    borderRadius: '8px',
                    border: isThisGroupApproved
                      ? '1px solid rgba(16, 185, 129, 0.25)'
                      : (hasApproved ? '1px solid rgba(239, 68, 68, 0.15)' : '1px solid rgba(255, 255, 255, 0.05)'),
                    fontSize: '0.85rem',
                    opacity: (!isThisGroupApproved && hasApproved) ? 0.75 : 1
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                      #{idx + 1} {isGroup ? '👥 Składka' : '👤 Rezerwacja'}
                    </span>
                    {isThisGroupApproved ? (
                      <span className="badge badge-success" style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                        ✓ Polecenie zakupu
                      </span>
                    ) : hasApproved ? (
                      <span className="badge badge-danger" style={{ fontSize: '0.7rem', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red, #ef4444)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                        ❌ Odrzucona
                      </span>
                    ) : (
                      <span className="badge badge-warning" style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fba524', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                        ⏳ W kolejce
                      </span>
                    )}
                  </div>

                  <div style={{ color: 'white', fontWeight: 500 }}>
                    {isGroup ? (
                      <>{isThisGroupApproved ? 'Kupują' : 'Rezerwują'}: <strong style={{ color: 'var(--text-primary)' }}>{memberNames.join(', ')}</strong></>
                    ) : (
                      <>{isThisGroupApproved ? 'Kupuje' : 'Rezerwuje'}: <strong style={{ color: 'var(--text-primary)' }}>{memberNames[0]}</strong></>
                    )}
                  </div>

                  {!isThisGroupApproved && hasApproved && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-red, #fca5a5)', fontStyle: 'italic' }}>
                      Organizator zatwierdził rezerwację przez: {approvedBooking ? (profiles[approvedBooking.user_id]?.display_name || 'innego uczestnika') : 'innego uczestnika'}
                    </div>
                  )}

                  {/* Actions for this booking group */}
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                    {isOrganizer && (
                      <>
                        {isThisGroupApproved ? (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}
                            onClick={() => handleToggleApproveBooking(groupBookings[0].id, false)}
                          >
                            🔄 Cofnij zatwierdzenie
                          </button>
                        ) : (
                          !hasApproved && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#10b981', borderColor: '#10b981' }}
                              onClick={() => handleToggleApproveBooking(groupBookings[0].id, true)}
                            >
                              ✅ Zatwierdź rezerwację
                            </button>
                          )
                        )}
                      </>
                    )}

                    {isMyGroup && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => handleUnbook(item.id, isSurprise)}
                      >
                        {isThisGroupApproved ? 'Anuluj zakup' : (isGroup ? 'Opuść składkę' : 'Anuluj rezerwację')}
                      </button>
                    )}

                    {isGroup && !hasApproved && !hasMyBooking && groupBookings[0].group_id && (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'var(--primary)', borderColor: 'var(--primary)' }}
                        onClick={() => handleJoinGroup(item.id, groupBookings[0].group_id!, isSurprise)}
                      >
                        👥 Dołącz do składki
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* General Reservation action button */}
        {!hasMyBooking && (
          <div style={{ marginTop: '0.25rem' }}>
            {hasApproved ? (
              <div 
                style={{ 
                  textAlign: 'center', 
                  padding: '0.5rem', 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  border: '1px dashed rgba(255, 255, 255, 0.1)', 
                  borderRadius: '8px', 
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem'
                }}
              >
                🔒 Zakup został zatwierdzony i sfinalizowany.
              </div>
            ) : (
              <button 
                className="btn btn-primary" 
                style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', width: '100%' }} 
                onClick={() => {
                  setIsSelectingSkladkaUsers(false);
                  setSkladkaSelectedUsers([]);
                  setBookingModal({ show: true, giftId: item.id, giftName: item.name, isSurprise });
                }}
              >
                Rezerwacja
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render booking cells inside table
  const renderGiftBookingsCell = (item: any, isSurprise: boolean = false) => {
    return renderGiftQueueAndActions(item, isSurprise);
  };

  // Render list of gifts in a compact table view
  const renderGiftsTable = (giftsList: any[], isSurprise: boolean = false) => {
    return (
      <div>
        {selectedGifts.length > 0 && (
          <div 
            className="glass-panel" 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '0.75rem 1.25rem', 
              marginBottom: '1rem', 
              background: 'rgba(124, 58, 237, 0.15)', 
              border: '1px solid rgba(124, 58, 237, 0.3)',
              borderRadius: '12px',
              animation: 'slideDown 0.2s ease-out'
            }}
          >
            <span style={{ fontWeight: 600, color: '#e0b0ff' }}>
              Zaznaczono: {selectedGifts.length} {selectedGifts.length === 1 ? 'prezent' : (selectedGifts.length < 5 ? 'prezenty' : 'prezentów')}
            </span>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderColor: 'rgba(124, 58, 237, 0.4)' }}
                onClick={() => {
                  setMoveTargetId('');
                  setMoveNewOwnerName('');
                  setMoveNewOwnerId('');
                  setShowMoveModal(true);
                }}
              >
                📦 Przenieś do Przechowalni
              </button>
              <button 
                className="btn btn-danger" 
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                onClick={handleDeleteGiftsBulk}
              >
                🗑️ Usuń zaznaczone
              </button>
            </div>
          </div>
        )}

        <div className="table-responsive">
          <table className="compact-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <input 
                    type="checkbox"
                    checked={giftsList.length > 0 && giftsList.every(g => selectedGifts.includes(g.id))}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (checked) {
                        const toAdd = giftsList.map(g => g.id);
                        setSelectedGifts(prev => Array.from(new Set([...prev, ...toAdd])));
                      } else {
                        const toRemove = giftsList.map(g => g.id);
                        setSelectedGifts(prev => prev.filter(id => !toRemove.includes(id)));
                      }
                    }}
                    style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                  />
                </th>
                <th>{isSurprise ? 'Niespodzianka' : 'Prezent'}</th>
                {isSurprise && <th>Zaproponował</th>}
                {!isSurprise && <th>Cena</th>}
                {!isSurprise && activeOccasion?.title !== '__PRZECHOWALNIA__' && <th>Rezerwujący</th>}
                {isSurprise && <th>Głosowanie</th>}
                <th>Czat</th>
                <th style={{ textAlign: 'right' }}>
                  <span className="hide-mobile">Szczegóły</span>
                  <span className="show-mobile-inline">...</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {giftsList.map(gift => {
                const giftBookings = bookings.filter(b => isSurprise ? b.surprise_id === gift.id : b.gift_id === gift.id);
                const approvedBooking = giftBookings.find(b => b.is_approved);
                const isBoughtBySomeoneElse = !isOwnerActiveOccasion && approvedBooking && approvedBooking.user_id !== user?.id;
                const approvedBuyerName = approvedBooking 
                  ? (profiles[approvedBooking.user_id]?.display_name || 'Znajomy')
                  : 'Ktoś inny';

                const suggestedByName = profiles[gift.suggested_by || '']?.display_name || 'Solenizant';
                
                const isApprovedByMe = !isSurprise && approvedBooking && approvedBooking.user_id === user?.id;

                const bookersCount = giftBookings.length;
                const bookersList = giftBookings
                  .map(b => profiles[b.user_id]?.display_name || 'Znajomy')
                  .join(', ');
                const bookersText = bookersCount > 0 ? `${bookersCount} (${bookersList})` : '—';
                
                const chatStats = getGiftChatStats(gift.id, isSurprise);
                const firstUrl = gift.urls && gift.urls.length > 0 && gift.urls[0].url ? gift.urls[0].url : gift.url;

                return (
                  <tr 
                    key={gift.id} 
                    style={{
                      cursor: 'pointer',
                      ...(isApprovedByMe ? { color: '#fbbf24' } : {}),
                      ...(isBoughtBySomeoneElse ? { 
                        opacity: 0.55, 
                        filter: 'grayscale(100%)', 
                        background: 'rgba(255, 255, 255, 0.01)',
                        color: 'var(--text-secondary)'
                      } : {})
                    }}
                    onClick={() => {
                      if (isSurprise) {
                        setActiveSurpriseDetails(gift);
                      } else {
                        setActiveGiftDetails(gift);
                      }
                    }}
                  >
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox"
                        checked={selectedGifts.includes(gift.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked) {
                            setSelectedGifts(prev => [...prev, gift.id]);
                          } else {
                            setSelectedGifts(prev => prev.filter(id => id !== gift.id));
                          }
                        }}
                        style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                      />
                    </td>
                    <td data-label={isSurprise ? 'Niespodzianka' : 'Prezent'} style={{ fontWeight: 500, color: isApprovedByMe ? '#fbbf24' : 'inherit' }}>
                      {firstUrl ? (
                        <a 
                          href={firstUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          onClick={(e) => e.stopPropagation()} 
                          style={{ 
                            color: isApprovedByMe ? '#fbbf24' : 'var(--primary)', 
                            textDecoration: 'underline' 
                          }}
                        >
                          {gift.name}
                        </a>
                      ) : (
                        gift.name
                      )}{' '}
                      {isBoughtBySomeoneElse && <span style={{ fontSize: '0.75rem', fontWeight: 'normal', fontStyle: 'italic', marginLeft: '0.4rem', color: 'var(--text-secondary)' }}>(Kupuje: {approvedBuyerName})</span>}
                    </td>
                    {isSurprise && (
                      <td data-label="Zaproponował" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        👤 {suggestedByName}
                      </td>
                    )}
                    {!isSurprise && (
                      <td data-label="Cena" style={{ whiteSpace: 'nowrap', color: isApprovedByMe ? '#fbbf24' : 'inherit' }}>
                        {gift.price ? <strong style={{ color: isApprovedByMe ? '#fbbf24' : (isBoughtBySomeoneElse ? 'var(--text-secondary)' : 'var(--text-primary)') }}>{gift.price} zł</strong> : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                      </td>
                    )}
                    {!isSurprise && activeOccasion?.title !== '__PRZECHOWALNIA__' && (
                      <td data-label="Rezerwujący" style={{ color: isApprovedByMe ? '#fbbf24' : 'inherit' }}>
                        {bookersText}
                      </td>
                    )}
                    {isSurprise && (
                      <td data-label="Głosowanie" onClick={(e) => e.stopPropagation()}>
                        <button 
                          className={`btn ${hasUserVoted(gift.id, true) ? 'btn-primary' : 'btn-secondary'}`} 
                          style={{ 
                            padding: '0.25rem 0.5rem', 
                            fontSize: '0.8rem', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '0.3rem',
                            borderRadius: '6px'
                          }}
                          onClick={() => hasUserVoted(gift.id, true) ? handleUnvote(gift.id, true) : handleVote(gift.id, true)}
                          disabled={isBoughtBySomeoneElse}
                        >
                          👍 {getVoteCount(gift.id, true)}
                        </button>
                      </td>
                    )}
                    <td data-label="Czat" onClick={(e) => {
                      e.stopPropagation();
                      if (activeTab !== 'chat') {
                        setCameFromTab(activeTab);
                      }
                      setChatFilter(isSurprise ? `surprise:${gift.id}` : `gift:${gift.id}`);
                      setActiveTab('chat');
                      updateLastRead(isSurprise ? `surprise:${gift.id}` : `gift:${gift.id}`);
                    }} style={{ color: isApprovedByMe ? '#fbbf24' : 'inherit', whiteSpace: 'nowrap' }}>
                      💬 {chatStats.totalCount} {chatStats.unreadCount > 0 ? <span style={{ color: '#f87171', fontWeight: 'bold' }}>({chatStats.unreadCount})</span> : ''}
                    </td>
                    <td data-label="Szczegóły" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem', fontWeight: 'bold' }} 
                        onClick={() => {
                          if (isSurprise) {
                            setActiveSurpriseDetails(gift);
                          } else {
                            setActiveGiftDetails(gift);
                          }
                        }}
                      >
                        ...
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };



  // 0. App Initializing splash screen
  if (initializing) {
    return (
      <div className="auth-container">
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="empty-state-icon" style={{ animation: 'fadeIn 1s infinite alternate', fontSize: '3rem' }}>🎁</div>
          <h3 style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Ładowanie aplikacji...</h3>
        </div>
      </div>
    );
  }

  // 1. PIN Unlock screen
  if (!unlocked) {
    return (
      <div className="auth-container">
        <div className="glass-panel auth-card">
          <div className="auth-header">
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.5rem' }}>🎁</span>
            <h1>Gift Planner</h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0.5rem 0 1rem 0', fontStyle: 'italic', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto', lineHeight: '1.4' }}>
              Rodzinny planer prezentów i niespodzianek – planuj okazje, rezerwuj podarunki, organizuj wspólne składki i rozmawiaj na czacie bez wiedzy solenizanta!
            </p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0.5rem 0', opacity: 0.7 }}>
              v{versionInfo.version} ({versionInfo.date})
            </p>
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
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.5rem' }}>🎁</span>
            <h1>Gift Planner</h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0.5rem 0 1rem 0', fontStyle: 'italic', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto', lineHeight: '1.4' }}>
              Rodzinny planer prezentów i niespodzianek – planuj okazje, rezerwuj podarunki, organizuj wspólne składki i rozmawiaj na czacie bez wiedzy solenizanta!
            </p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0.5rem 0', opacity: 0.7 }}>
              v{versionInfo.version} ({versionInfo.date})
            </p>
            <h2 style={{ fontSize: '1.25rem', marginTop: '1rem', color: 'var(--text-primary)' }}>Kim jesteś?</h2>
            <p style={{ marginTop: '0.5rem' }}>Wybierz swoje imię z listy, aby wejść do aplikacji.</p>
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
              
              {Object.values(profiles).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                  Ładowanie listy profili...
                </div>
              ) : (
                <div className="profile-grid">
                  {Object.values(profiles).map(profile => (
                    <button 
                      key={profile.id}
                      className="btn btn-secondary" 
                      style={{ 
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.75rem 0.5rem',
                        height: '85px',
                        position: 'relative',
                        width: '100%'
                      }}
                      onClick={() => handleSelectProfile(profile)}
                      disabled={authLoading}
                    >
                      <span style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }}>👤</span>
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
              )}

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
          <div onClick={() => { setView('dashboard'); setActiveOccasion(null); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', cursor: 'pointer' }}>
            <span className="navbar-brand" style={{ fontSize: '1.25rem', fontWeight: 'bold', display: 'block', margin: 0 }}>🎁 Gift Planner</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 'normal', color: 'var(--text-secondary)', opacity: 0.7, paddingLeft: '0.2rem' }}>
              v{versionInfo.version} ({versionInfo.date})
            </span>
          </div>
          <div className="navbar-user">
            {isAdmin && (
              <>
                <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => setShowAddMemberModal(true)}>
                  👤 <span className="hide-mobile">Zarządzaj rodziną</span><span className="show-mobile-inline">Rodzina</span>
                </button>
                <button 
                  className={`btn ${view === 'login-logs' ? 'btn-primary' : 'btn-secondary'}`} 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }} 
                  onClick={() => {
                    setView('login-logs');
                    setActiveOccasion(null);
                    fetchLoginLogs();
                  }}
                >
                  📋 <span className="hide-mobile">Dziennik logowań</span><span className="show-mobile-inline">Logi</span>
                </button>
              </>
            )}
            <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
              <span className="hide-mobile">Cześć, </span>
              <strong>{userProfile?.display_name || user.email?.split('@')[0]}</strong>
              <span className="hide-mobile">!</span>
            </span>
            <button 
              className={`btn ${view === 'my-bookings' ? 'btn-primary' : 'btn-secondary'}`} 
              style={{ 
                padding: '0.5rem 1rem', 
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
              }} 
              onClick={openMyBookings}
            >
              <span>🛍️</span>
              <span className="hide-mobile">Moje rezerwacje</span>
              <span className="show-mobile-inline">Moje</span>
              {myRejectedBookingsCount > 0 && (
                <span 
                  style={{ 
                    background: 'var(--accent-red, #ef4444)', 
                    color: 'white', 
                    borderRadius: '50%', 
                    minWidth: '18px', 
                    height: '18px', 
                    padding: '0 4px',
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    boxShadow: '0 0 8px rgba(239, 68, 68, 0.5)'
                  }}
                  title={`Masz ${myRejectedBookingsCount} odrzuconych rezerwacji!`}
                >
                  {myRejectedBookingsCount}
                </span>
              )}
            </button>
            <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={handleLogout}>
              <span className="hide-mobile">Wyloguj</span>
              <span className="show-mobile-inline">🚪</span>
            </button>
          </div>
        </div>
      </nav>
    );
  };

  const getOccasionCategory = (occ: Occasion) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(occ.date);
    target.setHours(0, 0, 0, 0);
    const isPast = target.getTime() < today.getTime();
    return {
      isPast,
      isArchived: !!occ.is_archived
    };
  };

  const isUserInvited = (occ: Occasion) => {
    // Creator can always see their own occasions
    if (occ.creator_id === user.id) return true;

    // If it's a draft, only the creator and draft_allowed_user_ids can see it
    if (occ.is_draft) {
      return occ.draft_allowed_user_ids?.includes(user.id) || false;
    }

    // Otherwise, normal invited guests logic:
    if (occ.owner_id === user.id) return true;
    if (!occ.invited_user_ids) return true; // old events are public by default
    return occ.invited_user_ids.includes(user.id);
  };

  const upcomingOccasions = occasions
    .filter(isUserInvited)
    .filter(occ => occ.title !== '__PRZECHOWALNIA__')
    .filter(occ => {
      const { isPast, isArchived } = getOccasionCategory(occ);
      return !isPast && !isArchived;
    });

  const archivedOrPastOccasions = occasions
    .filter(isUserInvited)
    .filter(occ => occ.title !== '__PRZECHOWALNIA__')
    .filter(occ => {
      const { isPast, isArchived } = getOccasionCategory(occ);
      return isPast || isArchived;
    });

  const filteredOccasions = dashboardTab === 'upcoming' ? upcomingOccasions : archivedOrPastOccasions;

  const pastSolenizants = (() => {
    const list: { owner_name: string; owner_id: string }[] = [];
    const keys = new Set<string>();
    occasions.forEach(occ => {
      if (occ.title === '__PRZECHOWALNIA__') return;
      if (!occ.owner_name) return;
      const name = occ.owner_name.trim();
      const id = occ.owner_id || '';
      const key = `${name.toLowerCase()}||${id}`;
      if (hiddenSolenizants.includes(key)) return;
      if (!keys.has(key)) {
        keys.add(key);
        list.push({ owner_name: name, owner_id: id });
      }
    });
    return list;
  })();

  const isPastSolenizantSelected = !editingOccasion && (
    (newOccasionOwnerName.trim() && pastSolenizants.some(ps => ps.owner_name.toLowerCase() === newOccasionOwnerName.trim().toLowerCase())) ||
    (newOccasionOwnerId && pastSolenizants.some(ps => ps.owner_id === newOccasionOwnerId))
  );

  return (
    <>
      {renderNav()}
      
      {/* ----------------- LOGIN LOGS VIEW (ADMIN ONLY) ----------------- */}
      {view === 'login-logs' && (
        <main className="container">
          <div className="dashboard-header" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <button 
                className="back-link" 
                style={{ marginBottom: '0.75rem', display: 'block' }} 
                onClick={() => setView('dashboard')}
              >
                ← Powrót do pulpitu
              </button>
              <h1>Dziennik logowań użytkowników</h1>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                Historia logowań i wylogowań członków rodziny.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <label htmlFor="log_user_filter" style={{ margin: 0, textTransform: 'none', color: 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>Użytkownik:</label>
                <select 
                  id="log_user_filter"
                  className="form-control" 
                  value={selectedLogUserFilter} 
                  onChange={(e) => setSelectedLogUserFilter(e.target.value)}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', width: 'auto', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: 'white', minWidth: '150px' }}
                >
                  <option value="all">Wszyscy</option>
                  {Object.values(profiles).map(p => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
              </div>
              <button 
                className="btn btn-secondary" 
                onClick={fetchLoginLogs}
                disabled={loadingLogs}
                style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
              >
                🔄 Odśwież logi
              </button>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
            {loadingLogs ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                Ładowanie dziennika logowań...
              </div>
            ) : loginLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                Brak zapisanych logowań w bazie danych.
              </div>
            ) : (
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Użytkownik</th>
                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Data i godzina logowania</th>
                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Data i godzina wylogowania</th>
                    <th style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>Czas sesji</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filteredLogs = selectedLogUserFilter === 'all' 
                      ? loginLogs 
                      : loginLogs.filter(log => log.user_id === selectedLogUserFilter);
                    
                    if (filteredLogs.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                            Brak wpisów logowań dla wybranego filtru.
                          </td>
                        </tr>
                      );
                    }
                    
                    return filteredLogs.map(log => {
                      const profile = profiles[log.user_id];
                      const loginDate = new Date(log.login_at);
                      const logoutDate = log.logout_at ? new Date(log.logout_at) : null;
                      
                      let durationText = 'Aktywna sesja';
                      if (logoutDate) {
                        const diffMs = logoutDate.getTime() - loginDate.getTime();
                        const diffMins = Math.floor(diffMs / 60000);
                        const diffHours = Math.floor(diffMins / 60);
                        const remainingMins = diffMins % 60;
                        
                        if (diffHours > 0) {
                          durationText = `${diffHours} godz. ${remainingMins} min.`;
                        } else if (diffMins > 0) {
                          durationText = `${diffMins} min.`;
                        } else {
                          durationText = 'Krótka sesja (< 1 min)';
                        }
                      }

                      const formatDateTime = (date: Date) => {
                        return date.toLocaleString('pl-PL', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        });
                      };

                      return (
                        <tr 
                          key={log.id} 
                          style={{ 
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            transition: 'background 0.2s'
                          }}
                          className="table-row-hover"
                        >
                          <td style={{ padding: '1rem', fontWeight: '500' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              👤 {profile?.display_name || 'Nieznany użytkownik'}
                            </span>
                          </td>
                          <td style={{ padding: '1rem', color: 'var(--text-primary)' }}>
                            📅 {formatDateTime(loginDate)}
                          </td>
                          <td style={{ padding: '1rem', color: log.logout_at ? 'var(--text-primary)' : 'var(--success, #10b981)' }}>
                            {log.logout_at ? `🚪 ${formatDateTime(logoutDate!)}` : '🟢 Aktywna (lub zamknięta karta)'}
                          </td>
                          <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                            ⏱️ {durationText}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            )}
          </div>
        </main>
      )}

      {/* ----------------- MY RESERVATIONS VIEW ----------------- */}
      {view === 'my-bookings' && (
        <main className="container">
          <div className="dashboard-header" style={{ marginBottom: '1.5rem' }}>
            <div>
              <button 
                className="back-link" 
                style={{ marginBottom: '0.75rem', display: 'block' }} 
                onClick={() => setView('dashboard')}
              >
                ← Powrót do pulpitu
              </button>
              <h1>Moje Rezerwacje i Zakupy</h1>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                Lista prezentów, które rezerwujesz lub masz kupić w ramach zaplanowanych wydarzeń.
              </p>
            </div>
          </div>

          {loading && <div style={{ textAlign: 'center', padding: '2rem' }}>Ładowanie rezerwacji...</div>}

          {!loading && (() => {
            const myBookingsList = bookings.filter(b => b.user_id === user?.id);
            const myApprovedSurprises = allSurprises.filter(s => s.suggested_by === user?.id && s.is_approved);

            if (myBookingsList.length === 0 && myApprovedSurprises.length === 0) {
              return (
                <div className="glass-panel empty-state">
                  <div className="empty-state-icon">🛍️</div>
                  <h3>Brak aktywnych rezerwacji i zakupów</h3>
                  <p style={{ marginBottom: '1.5rem' }}>
                    Nie masz obecnie żadnych zarezerwowanych prezentów ani zatwierdzonych niespodzianek. Przejdź do aktywnego wydarzenia, aby zarezerwować prezent!
                  </p>
                  <button className="btn btn-primary" onClick={() => setView('dashboard')}>
                    Przeglądaj wydarzenia
                  </button>
                </div>
              );
            }

            const purchasesList = myBookingsList.filter(b => b.is_approved);
            const reservationsList = myBookingsList.filter(b => {
              if (b.is_approved) return false;
              if (b.gift_id) {
                return !bookings.some(bk => bk.gift_id === b.gift_id && bk.is_approved);
              } else if (b.surprise_id) {
                return !bookings.some(bk => bk.surprise_id === b.surprise_id && bk.is_approved);
              }
              return false;
            });
            const rejectedList = myBookingsList.filter(b => {
              if (b.is_approved) return false;
              if (b.gift_id) {
                return bookings.some(bk => bk.gift_id === b.gift_id && bk.is_approved);
              } else if (b.surprise_id) {
                return bookings.some(bk => bk.surprise_id === b.surprise_id && bk.is_approved);
              }
              return false;
            });

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                {/* 1. CONFIRMED PURCHASES */}
                <div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🛍️ Moje Zakupy (Do kupienia) <span className="occasion-badge" style={{ margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.85rem' }}>{purchasesList.length + myApprovedSurprises.length}</span>
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Organizator zatwierdził te rezerwacje i niespodzianki, zamieniając je w polecenie zakupu/realizacji. Kup te prezenty i zorganizuj niespodzianki!
                  </p>
                  
                  {purchasesList.length === 0 ? (
                    <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <p style={{ margin: 0 }}>Nie masz jeszcze żadnych zatwierdzonych zakupów.</p>
                    </div>
                  ) : (
                    <div className="table-responsive" style={{ marginTop: '0.5rem' }}>
                      <table className="compact-table">
                        <thead>
                          <tr>
                            <th>Prezent</th>
                            <th>Wydarzenie</th>
                            <th>Data</th>
                            <th>Cena</th>
                            <th>Typ</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Akcje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchasesList.map(b => {
                            const isSurprise = !!b.surprise_id;
                            const gift = isSurprise
                              ? allSurprises.find(s => s.id === b.surprise_id)
                              : allGifts.find(g => g.id === b.gift_id);
                            if (!gift) return null;
                            const occasion = occasions.find(o => o.id === gift.occasion_id);
                            if (!occasion) return null;

                            return (
                              <tr key={b.id}>
                                <td data-label="Prezent" style={{ fontWeight: 500 }}>
                                  {gift.name} {isSurprise && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>(Niespodzianka)</span>}
                                </td>
                                <td data-label="Wydarzenie">
                                  {occasion.title}
                                </td>
                                <td data-label="Data" style={{ whiteSpace: 'nowrap' }}>
                                  📅 {formatDate(occasion.date)}
                                </td>
                                <td data-label="Cena">
                                  {gift.price ? `${gift.price} zł` : '—'}
                                </td>
                                <td data-label="Typ">
                                  {(() => {
                                    if (!b.is_group) return <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>👤 Samodzielnie</span>;
                                    const groupMembers = bookings
                                      .filter(bk => bk.group_id === b.group_id)
                                      .map(bk => profiles[bk.user_id]?.display_name || 'Znajomy')
                                      .filter(name => name !== (profiles[user?.id]?.display_name || 'Ty'));
                                    return (
                                      <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
                                        👥 Składka{groupMembers.length > 0 ? ` z: ${groupMembers.join(', ')}` : ''}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td data-label="Status">
                                  <span 
                                    className="badge badge-success" 
                                    style={{ 
                                      background: 'rgba(16, 185, 129, 0.15)', 
                                      color: '#10b981', 
                                      border: '1px solid rgba(16, 185, 129, 0.2)',
                                      padding: '0.15rem 0.4rem',
                                      borderRadius: '4px'
                                    }}
                                  >
                                    ✓ Zatwierdzony zakup
                                  </span>
                                </td>
                                <td data-label="Akcje" style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                    <button 
                                      className="btn btn-primary" 
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                                      onClick={() => selectOccasion(occasion)}
                                    >
                                      Pokaż okazję
                                    </button>
                                    <button 
                                      className="btn btn-secondary" 
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                                      onClick={() => {
                                        setConfirmModal({
                                          show: true,
                                          title: 'Anuluj zakup',
                                          message: 'Czy na pewno chcesz anulować ten zakup? Organizator wydarzenia zatwierdził już tę rezerwację.',
                                          onConfirm: async () => {
                                            await handleUnbook(gift.id, isSurprise);
                                            await fetchMyBookingsData();
                                          }
                                        });
                                      }}
                                    >
                                      Anuluj
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {myApprovedSurprises.map(s => {
                            const occasion = occasions.find(o => o.id === s.occasion_id);
                            if (!occasion) return null;

                            return (
                              <tr key={s.id}>
                                <td data-label="Prezent" style={{ fontWeight: 500 }}>
                                  {s.name} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>(Niespodzianka)</span>
                                </td>
                                <td data-label="Wydarzenie">
                                  {occasion.title}
                                </td>
                                <td data-label="Data" style={{ whiteSpace: 'nowrap' }}>
                                  📅 {formatDate(occasion.date)}
                                </td>
                                <td data-label="Cena">
                                  —
                                </td>
                                <td data-label="Status">
                                  <span 
                                    className="badge badge-success" 
                                    style={{ 
                                      background: 'rgba(16, 185, 129, 0.15)', 
                                      color: '#10b981', 
                                      border: '1px solid rgba(16, 185, 129, 0.2)',
                                      padding: '0.15rem 0.4rem',
                                      borderRadius: '4px'
                                    }}
                                  >
                                    ✓ Zatwierdzony pomysł
                                  </span>
                                </td>
                                <td data-label="Akcje" style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                    <button 
                                      className="btn btn-primary" 
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                                      onClick={() => selectOccasion(occasion)}
                                    >
                                      Pokaż okazję
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 2. PENDING RESERVATIONS */}
                <div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ⏳ Moje Rezerwacje (W kolejce) <span className="occasion-badge" style={{ margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.85rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fba524' }}>{reservationsList.length}</span>
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Jesteś w kolejce rezerwujących do tych prezentów. Czekaj na decyzję organizatora, który przydzieli polecenie zakupu.
                  </p>

                  {reservationsList.length === 0 ? (
                    <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <p style={{ margin: 0 }}>Nie masz obecnie żadnych oczekujących rezerwacji w kolejce.</p>
                    </div>
                  ) : (
                    <div className="table-responsive" style={{ marginTop: '0.5rem' }}>
                      <table className="compact-table">
                        <thead>
                          <tr>
                            <th>Prezent</th>
                            <th>Wydarzenie</th>
                            <th>Pozycja w kolejce</th>
                            <th>Cena</th>
                            <th>Typ</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Akcje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reservationsList.map(b => {
                            const isSurprise = !!b.surprise_id;
                            const gift = isSurprise
                              ? allSurprises.find(s => s.id === b.surprise_id)
                              : allGifts.find(g => g.id === b.gift_id);
                            if (!gift) return null;
                            const occasion = occasions.find(o => o.id === gift.occasion_id);
                            if (!occasion) return null;

                            // Calculate queue position
                            const giftBookings = bookings
                              .filter(bk => isSurprise ? bk.surprise_id === gift.id : bk.gift_id === gift.id)
                              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                            const queuePos = giftBookings.findIndex(bk => bk.id === b.id) + 1;
                            const totalInQueue = giftBookings.length;

                            return (
                              <tr key={b.id}>
                                <td data-label="Prezent" style={{ fontWeight: 500 }}>
                                  {gift.name} {isSurprise && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>(Niespodzianka)</span>}
                                </td>
                                <td data-label="Wydarzenie">
                                  {occasion.title}
                                </td>
                                <td data-label="Pozycja w kolejce">
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                    #{queuePos}
                                  </span> z {totalInQueue}
                                </td>
                                <td data-label="Cena">
                                  {gift.price ? `${gift.price} zł` : '—'}
                                </td>
                                <td data-label="Typ">
                                  {(() => {
                                    if (!b.is_group) return <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>👤 Samodzielnie</span>;
                                    const groupMembers = bookings
                                      .filter(bk => bk.group_id === b.group_id)
                                      .map(bk => profiles[bk.user_id]?.display_name || 'Znajomy')
                                      .filter(name => name !== (profiles[user?.id]?.display_name || 'Ty'));
                                    return (
                                      <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
                                        👥 Składka{groupMembers.length > 0 ? ` z: ${groupMembers.join(', ')}` : ''}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td data-label="Status">
                                  <span 
                                    className="badge badge-warning" 
                                    style={{ 
                                      background: 'rgba(245, 158, 11, 0.15)', 
                                      color: '#fba524', 
                                      border: '1px solid rgba(245, 158, 11, 0.2)',
                                      padding: '0.15rem 0.4rem',
                                      borderRadius: '4px'
                                    }}
                                  >
                                    ⏳ W kolejce
                                  </span>
                                </td>
                                <td data-label="Akcje" style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                    <button 
                                      className="btn btn-primary" 
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                                      onClick={() => selectOccasion(occasion)}
                                    >
                                      Pokaż okazję
                                    </button>
                                    <button 
                                      className="btn btn-secondary" 
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                                      onClick={async () => {
                                        await handleUnbook(gift.id, isSurprise);
                                        await fetchMyBookingsData();
                                      }}
                                    >
                                      Anuluj rezerwację
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 3. REJECTED RESERVATIONS */}
                {rejectedList.length > 0 && (
                  <div>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-red, #f87171)' }}>
                      ❌ Odrzucone Rezerwacje <span className="occasion-badge" style={{ margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red, #ef4444)' }}>{rejectedList.length}</span>
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                      Organizator zatwierdził zakup tych prezentów przez innych uczestników. Twoje rezerwacje zostały odrzucone.
                    </p>

                    <div className="table-responsive" style={{ marginTop: '0.5rem' }}>
                      <table className="compact-table">
                        <thead>
                          <tr>
                            <th>Prezent</th>
                            <th>Wydarzenie</th>
                            <th>Status</th>
                            <th>Rezerwujący</th>
                            <th style={{ textAlign: 'right' }}>Akcje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rejectedList.map(b => {
                            const isSurprise = !!b.surprise_id;
                            const gift = isSurprise
                              ? allSurprises.find(s => s.id === b.surprise_id)
                              : allGifts.find(g => g.id === b.gift_id);
                            if (!gift) return null;
                            const occasion = occasions.find(o => o.id === gift.occasion_id);
                            if (!occasion) return null;

                            const approvedBooking = bookings.find(bk => 
                              (isSurprise ? bk.surprise_id === b.surprise_id : bk.gift_id === b.gift_id) && 
                              bk.is_approved
                            );
                            const approvedBuyerName = approvedBooking 
                              ? (profiles[approvedBooking.user_id]?.display_name || 'Znajomy')
                              : 'Ktoś inny';

                            return (
                              <tr key={b.id} style={{ opacity: 0.85 }}>
                                <td data-label="Prezent" style={{ fontWeight: 500, textDecoration: 'line-through', color: 'var(--text-secondary)' }}>
                                  {gift.name} {isSurprise && <span style={{ fontSize: '0.75rem', textDecoration: 'none', display: 'inline-block' }}>(Niespodzianka)</span>}
                                </td>
                                <td data-label="Wydarzenie">
                                  {occasion.title}
                                </td>
                                <td data-label="Status">
                                  <span 
                                    className="badge badge-danger" 
                                    style={{ 
                                      background: 'rgba(239, 68, 68, 0.15)', 
                                      color: 'var(--accent-red, #ef4444)', 
                                      border: '1px solid rgba(239, 68, 68, 0.2)',
                                      padding: '0.15rem 0.4rem',
                                      borderRadius: '4px'
                                    }}
                                  >
                                    ❌ Odrzucona
                                  </span>
                                </td>
                                <td data-label="Rezerwujący" style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                                  Rezerwuje: {approvedBuyerName}
                                </td>
                                <td data-label="Akcje" style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                    <button 
                                      className="btn btn-primary" 
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                                      onClick={() => selectOccasion(occasion)}
                                    >
                                      Pokaż okazję
                                    </button>
                                    <button 
                                      className="btn btn-secondary" 
                                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: 'var(--accent-red, #ef4444)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                      onClick={() => {
                                        setConfirmModal({
                                          show: true,
                                          title: 'Usuń odrzuconą rezerwację',
                                          message: 'Czy na pewno chcesz usunąć tę odrzuconą rezerwację ze swojej listy?',
                                          onConfirm: async () => {
                                            await handleUnbook(gift.id, isSurprise);
                                            await fetchMyBookingsData();
                                          }
                                        });
                                      }}
                                    >
                                      Usuń z listy
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </main>
      )}



      {/* ----------------- DASHBOARD VIEW ----------------- */}
      {view === 'dashboard' && (
        <main className="container">
          <div className="dashboard-header">
            <div>
              <h1>Listy Życzeń i Wydarzeń</h1>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                {dashboardTab === 'przechowalnia' 
                  ? 'Twórz listy życzeń dla dowolnej osoby bez przypisania do wydarzenia w kalendarzu.' 
                  : 'Przeglądaj wydarzenia znajomych i rodziny lub stwórz własne.'}
              </p>
            </div>
            <div>
              {dashboardTab === 'przechowalnia' ? (
                <button className="btn btn-primary" onClick={() => setShowCreateLockerModal(true)}>
                  ➕ Nowa Lista
                </button>
              ) : (
                <button className="btn btn-primary" onClick={openNewOccasionModal}>
                  ➕ Nowe Wydarzenie
                </button>
              )}
            </div>
          </div>

          {/* Dashboard Tabs & View Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="tab-nav" style={{ margin: 0 }}>
              <button 
                className={`tab-btn ${dashboardTab === 'upcoming' ? 'active' : ''}`} 
                onClick={() => setDashboardTab('upcoming')}
              >
                📅 Nadchodzące ({upcomingOccasions.length})
              </button>
              <button 
                className={`tab-btn ${dashboardTab === 'przechowalnia' ? 'active' : ''}`} 
                onClick={() => setDashboardTab('przechowalnia')}
              >
                📦 Przechowalnia ({occasions.filter(o => o.title === '__PRZECHOWALNIA__').length})
              </button>
              <button 
                className={`tab-btn ${dashboardTab === 'archived' ? 'active' : ''}`} 
                onClick={() => setDashboardTab('archived')}
              >
                🗄️ Archiwum i minione ({archivedOrPastOccasions.length})
              </button>
            </div>
          </div>

          {myRejectedBookingsCount > 0 && (
            <div 
              className="alert alert-warning" 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '1.5rem', 
                background: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid rgba(239, 68, 68, 0.25)', 
                color: 'var(--accent-red, #f87171)',
                padding: '0.8rem 1rem',
                borderRadius: '8px',
                fontSize: '0.9rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                <span>
                  Jedna lub więcej Twoich rezerwacji zostało <strong>odrzuconych</strong>, ponieważ organizator zatwierdził zakup przez inną osobę.
                </span>
              </div>
              <button 
                className="btn btn-secondary" 
                style={{ 
                  padding: '0.25rem 0.6rem', 
                  fontSize: '0.75rem', 
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  color: 'var(--text-primary, white)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer'
                }}
                onClick={openMyBookings}
              >
                Pokaż szczegóły
              </button>
            </div>
          )}

          {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}

          {loading && <div style={{ textAlign: 'center', padding: '2rem' }}>Ładowanie...</div>}

          {!loading && dashboardTab === 'przechowalnia' && (() => {
            const lockerOccasions = occasions.filter(occ => occ.title === '__PRZECHOWALNIA__');
            return lockerOccasions.length === 0 ? (
              <div className="glass-panel empty-state">
                <div className="empty-state-icon">📦</div>
                <h3>Brak list w Przechowalni</h3>
                <p style={{ marginBottom: '1.5rem' }}>
                  Nie utworzono jeszcze żadnej listy życzeń w Przechowalni.
                </p>
                <button className="btn btn-primary" onClick={() => setShowCreateLockerModal(true)}>
                  Utwórz pierwszą listę
                </button>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1.5rem',
                marginTop: '1.5rem'
              }}>
                {lockerOccasions.map(occ => {
                  const itemsCount = allGifts.filter(g => g.occasion_id === occ.id).length;
                  const creatorName = profiles[occ.creator_id]?.display_name || 'Użytkownik';
                  return (
                    <div 
                      key={occ.id}
                      className="glass-panel"
                      style={{
                        padding: '1.5rem',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '160px',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                      }}
                      onClick={() => {
                        setActiveOccasion(occ);
                        setView('occasion');
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 12px 20px rgba(0, 0, 0, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>📦</span>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            background: 'rgba(124, 58, 237, 0.15)', 
                            color: '#e0b0ff',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '12px',
                            border: '1px solid rgba(124, 58, 237, 0.3)'
                          }}>
                            {itemsCount} {itemsCount === 1 ? 'prezent' : (itemsCount > 1 && itemsCount < 5 ? 'prezenty' : 'prezentów')}
                          </span>
                        </div>
                        <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>{occ.owner_name}</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                          Stworzona przez: {creatorName}
                        </p>
                      </div>
                      
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'flex-end', 
                        marginTop: '1rem',
                        fontSize: '0.85rem',
                        color: 'var(--primary)',
                        fontWeight: 600
                      }}>
                        Zobacz listę →
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {!loading && dashboardTab !== 'przechowalnia' && filteredOccasions.length === 0 && (
            <div className="glass-panel empty-state">
              <div className="empty-state-icon">
                {dashboardTab === 'upcoming' ? '🎂' : '🗄️'}
              </div>
              <h3>
                {dashboardTab === 'upcoming' ? 'Brak zaplanowanych okazji' : 'Brak minionych lub zarchiwizowanych wydarzeń'}
              </h3>
              <p style={{ marginBottom: '1.5rem' }}>
                {dashboardTab === 'upcoming' 
                  ? 'Dodaj urodziny, rocznicę lub inną okazję, by bliscy wiedzieli jakich prezentów szukać!'
                  : 'Tutaj pojawią się wydarzenia, które już się odbyły lub zostały zarchiwizowane.'}
              </p>
              {dashboardTab === 'upcoming' && (
                <button className="btn btn-primary" onClick={openNewOccasionModal}>
                  Dodaj pierwsze wydarzenie
                </button>
              )}
            </div>
          )}

          {!loading && dashboardTab !== 'przechowalnia' && filteredOccasions.length > 0 && (
            <div className="table-responsive">
              <table className="compact-table">
                <thead>
                  <tr>
                    <th>Okazja</th>
                    <th>Data</th>
                    <th style={{ textAlign: 'right' }}>
                      <span className="hide-mobile">Szczegóły</span>
                      <span className="show-mobile-inline">...</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOccasions.map(occ => {
                    return (
                      <tr 
                        key={occ.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => selectOccasion(occ)}
                      >
                        <td data-label="Okazja" style={{ fontWeight: 500 }}>{occ.title}</td>
                        <td data-label="Data" style={{ whiteSpace: 'nowrap' }}>
                          📅 {formatDate(occ.date)} {occ.time && `o ${occ.time}`}
                          {occ.is_archived && (
                            <span 
                              className="badge badge-info" 
                              style={{ 
                                marginLeft: '0.5rem', 
                                background: 'rgba(255, 255, 255, 0.08)', 
                                color: 'var(--text-secondary)', 
                                border: '1px solid rgba(255, 255, 255, 0.1)' 
                              }}
                            >
                              Zarchiwizowane
                            </span>
                          )}
                          {occ.is_draft && (
                            <span 
                              className="badge badge-warning" 
                              style={{ 
                                marginLeft: '0.5rem', 
                                background: 'rgba(245, 158, 11, 0.15)', 
                                color: '#fba524', 
                                border: '1px solid rgba(245, 158, 11, 0.2)' 
                              }}
                            >
                              Robocze
                            </span>
                          )}
                        </td>
                        <td data-label="Szczegóły" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem', fontWeight: 'bold' }} 
                            onClick={() => setActiveOccasionDetails(occ)}
                          >
                            ...
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      )}

      {/* ----------------- OCCASION VIEW ----------------- */}
      {view === 'occasion' && activeOccasion && (
        <main className="container">
          <button className="back-link" onClick={() => { 
            if (activeOccasion.title === '__PRZECHOWALNIA__') {
              setDashboardTab('przechowalnia');
            }
            setView('dashboard');
            setActiveOccasion(null); 
          }}>
            {activeOccasion.title === '__PRZECHOWALNIA__' ? '← Powrót do Przechowalni' : '← Powrót do pulpitu'}
          </button>

          {activeOccasion.title !== '__PRZECHOWALNIA__' && activeOccasion.is_draft && (
            <div className="alert alert-warning" style={{ marginBottom: '1.5rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fba524', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
              🛠️ To wydarzenie jest w wersji roboczej (widoczne tylko dla organizatorów).
            </div>
          )}

          {activeOccasion.title !== '__PRZECHOWALNIA__' && activeOccasion.is_archived && (
            <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
              🗄️ To wydarzenie jest zarchiwizowane.
            </div>
          )}

          {activeOccasion.title !== '__PRZECHOWALNIA__' && (() => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const target = new Date(activeOccasion.date);
            target.setHours(0, 0, 0, 0);
            const isPast = target.getTime() < today.getTime();
            return isPast && !activeOccasion.is_archived;
          })() && (
            <div className="alert alert-success" style={{ marginBottom: '1.5rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', borderColor: 'rgba(255,255,255,0.08)' }}>
              📅 To wydarzenie już się odbyło.
            </div>
          )}

          <div className="glass-panel occasion-details-header">
            <div className="occasion-title-row">
              <div>
                {activeOccasion.title !== '__PRZECHOWALNIA__' && (
                  <div className="occasion-date">
                    📅 {formatDate(activeOccasion.date)} 
                    {activeOccasion.time && ` o ${activeOccasion.time}`} 
                    {` (${getDaysLeft(activeOccasion.date)})`}
                  </div>
                )}
                <h1 style={{ margin: '0 0 0.5rem 0' }}>
                  {activeOccasion.title === '__PRZECHOWALNIA__' ? `Lista życzeń: ${activeOccasion.owner_name}` : activeOccasion.title}
                </h1>
                
                {activeOccasion.title !== '__PRZECHOWALNIA__' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>
                      Okazja dla: <strong>{activeOccasion.owner_name}</strong> {isOwnerActiveOccasion && '(Ciebie)'}
                    </span>
                    {(activeOccasion.location || activeOccasion.google_maps_url) && (
                      <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        📍 Lokalizacja: {activeOccasion.location || 'Brak nazwy'}
                        {activeOccasion.google_maps_url && (
                          <a 
                            href={activeOccasion.google_maps_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="gift-link-tag" 
                            style={{ marginLeft: '0.5rem', padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}
                          >
                            🗺️ Zobacz w Google Maps
                          </a>
                        )}
                      </span>
                    )}
                  </div>
                ) : null}
                
                {activeOccasion.title !== '__PRZECHOWALNIA__' && activeOccasion.description && (
                  <p style={{ marginTop: '1rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                    "{activeOccasion.description}"
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {activeOccasion.creator_id === user.id && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', overflow: 'hidden', maxWidth: '100%' }}>
                    {activeOccasion.title !== '__PRZECHOWALNIA__' && activeOccasion.is_draft && (
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', border: '1px solid var(--accent-green)', color: 'var(--accent-green)', flexShrink: 0 }} 
                        onClick={() => handleApproveOccasion(activeOccasion.id, false)}
                      >
                        ✅ Zatwierdź
                      </button>
                    )}
                    <button className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', flexShrink: 0 }} onClick={() => startEditOccasion(activeOccasion)}>
                      ✏️ Edytuj
                    </button>
                    {activeOccasion.title !== '__PRZECHOWALNIA__' && (
                      <button className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', flexShrink: 0 }} onClick={() => handleToggleArchiveOccasion(activeOccasion)}>
                        {activeOccasion.is_archived ? '🗄️ Przywróć' : '🗄️ Zarchiwizuj'}
                      </button>
                    )}
                    <button className="btn btn-danger btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', flexShrink: 0 }} onClick={(e) => handleDeleteOccasion(activeOccasion.id, e)}>
                      🗑️ Usuń
                    </button>
                  </div>
                )}
                <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => openGiftModal(false)}>
                  🎁 Dodaj Prezent
                </button>
                {activeOccasion.title !== '__PRZECHOWALNIA__' && (
                  <>
                    <button 
                      className="btn btn-secondary" 
                      style={{ flexShrink: 0 }} 
                      onClick={() => {
                        const defaultLocker = occasions.find(occ => 
                          occ.title === '__PRZECHOWALNIA__' && 
                          ((activeOccasion.owner_id && occ.owner_id === activeOccasion.owner_id) || 
                           (occ.owner_name.trim().toLowerCase() === activeOccasion.owner_name.trim().toLowerCase()))
                        );
                        setAddFromLockerLockerId(defaultLocker?.id || '');
                        setAddFromLockerSelectedGifts([]);
                        setShowAddFromLockerModal(true);
                      }}
                    >
                      📦 Dodaj z Przechowalni
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ flexShrink: 0 }} 
                      onClick={() => {
                        setAddFromUnpurchasedSelectedGifts([]);
                        setShowAddFromUnpurchasedModal(true);
                      }}
                    >
                      📅 Dodaj z niekupionych
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Surprise Logic Warning or Info */}
          {activeOccasion.title !== '__PRZECHOWALNIA__' && isOwnerActiveOccasion && (
            <div className="alert alert-success" style={{ marginBottom: '2rem' }}>
              💡 To jest Twoja okazja! Rezerwacje prezentów i pomysły-niespodzianki dodane przez Twoich znajomych są przed Tobą ukryte, by nie psuć niespodzianki.
            </div>
          )}

          {/* Navigation Tabs and View Toggle */}
          {activeOccasion.title !== '__PRZECHOWALNIA__' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
              {!isOwnerActiveOccasion ? (
                <div className="tab-nav" style={{ margin: 0 }}>
                  <button className={`tab-btn ${activeTab === 'solenizant' ? 'active' : ''}`} onClick={() => setActiveTab('solenizant')}>
                    <span className="hide-mobile">Lista życzeń {activeOccasion.owner_name}</span>
                    <span className="show-mobile-inline">Lista życzeń</span> ({solenizantGifts.length})
                  </button>
                  <button className={`tab-btn ${activeTab === 'goscie' ? 'active' : ''}`} onClick={() => setActiveTab('goscie')}>
                    <span className="hide-mobile">Pomysły i niespodzianki gości</span>
                    <span className="show-mobile-inline">Niespodzianki</span> ({goscieGifts.length})
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`} 
                    onClick={() => {
                      setChatFilter('all');
                      setActiveTab('chat');
                    }}
                  >
                    💬 <span className="hide-mobile">Czat i dyskusja</span>
                    <span className="show-mobile-inline">Czat</span>
                  </button>
                </div>
              ) : (
                <div></div>
              )}
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
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button className="btn btn-primary" onClick={() => openGiftModal(false)}>
                          Dodaj prezent
                        </button>
                        {activeOccasion.title !== '__PRZECHOWALNIA__' && (
                          <>
                            <button 
                              className="btn btn-secondary" 
                              onClick={() => {
                                const defaultLocker = occasions.find(occ => 
                                  occ.title === '__PRZECHOWALNIA__' && 
                                  ((activeOccasion.owner_id && occ.owner_id === activeOccasion.owner_id) || 
                                   (occ.owner_name.trim().toLowerCase() === activeOccasion.owner_name.trim().toLowerCase()))
                                );
                                setAddFromLockerLockerId(defaultLocker?.id || '');
                                setAddFromLockerSelectedGifts([]);
                                setShowAddFromLockerModal(true);
                              }}
                            >
                              📦 Dodaj z Przechowalni
                            </button>
                            <button 
                              className="btn btn-secondary" 
                              onClick={() => {
                                setAddFromUnpurchasedSelectedGifts([]);
                                setShowAddFromUnpurchasedModal(true);
                              }}
                            >
                              📅 Dodaj z niekupionych
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    renderGiftsTable(solenizantGifts)
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
                      <button className="btn btn-primary" onClick={() => openGiftModal(true)}>
                        Zaproponuj niespodziankę
                      </button>
                    </div>
                  ) : (
                    renderGiftsTable(sortedGoscieGifts, true)
                  )}
                </div>
              )}

              {/* Tab 3: Chat */}
              {!isOwnerActiveOccasion && activeTab === 'chat' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="alert alert-info" style={{ margin: 0, background: 'rgba(170, 59, 255, 0.08)', borderColor: 'rgba(170, 59, 255, 0.15)', color: '#d8b4fe' }}>
                    💬 <strong>Czat wydarzenia</strong>: Rozmawiajcie ze sobą, ustalajcie szczegóły prezentów i niespodzianek. Czat jest w pełni ukryty przed solenizantem ({activeOccasion.owner_name})!
                  </div>

                  {/* Chat Controls: Filter and Search Toggle */}
                  <div className="glass-panel" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    
                    {/* Filter Dropdown */}
                    <div className="form-group" style={{ margin: 0, minWidth: '220px', flex: 1 }}>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem', display: 'block' }}>Pokazuj wątek:</label>
                      <select 
                        className="form-control" 
                        value={chatFilter} 
                        onChange={e => setChatFilter(e.target.value)}
                        style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.9rem' }}
                      >
                        <option value="all">💬 Wszystkie wiadomości (zbiorczy)</option>
                        <option value="general">📅 Tylko ogólna dyskusja o wydarzeniu</option>
                        {gifts.length > 0 && (
                          <optgroup label="🎁 Prezenty">
                            {gifts.map(g => (
                              <option key={g.id} value={`gift:${g.id}`}>🎁 {g.name}</option>
                            ))}
                          </optgroup>
                        )}
                        {surprises.length > 0 && (
                          <optgroup label="🤫 Niespodzianki">
                            {surprises.map(s => (
                              <option key={s.id} value={`surprise:${s.id}`}>🤫 {s.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    {/* Back to List button */}
                    {chatFilter !== 'all' && chatFilter !== 'general' && (
                      <button 
                        className="btn btn-secondary" 
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '0.4rem', 
                          padding: '0.5rem 1.25rem', 
                          fontSize: '0.9rem',
                          height: '40px',
                          marginTop: '1.25rem',
                          fontWeight: 500
                        }}
                        onClick={() => {
                          setActiveTab(cameFromTab || (chatFilter.startsWith('surprise:') ? 'goscie' : 'solenizant'));
                        }}
                      >
                        ← Wróć do listy
                      </button>
                    )}

                    {/* Search Field / Toggle Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      {showChatSearch ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input 
                            type="text" 
                            className="form-control" 
                            placeholder="Wyszukaj..." 
                            value={chatSearch} 
                            onChange={e => setChatSearch(e.target.value)} 
                            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.9rem', width: '180px' }}
                            autoFocus
                          />
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                            onClick={() => {
                              setShowChatSearch(false);
                              setChatSearch('');
                            }}
                            title="Zamknij wyszukiwanie"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}
                          onClick={() => setShowChatSearch(true)}
                        >
                          🔍 <span>Szukaj</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Messages list */}
                  <div 
                    className="glass-panel" 
                    style={{ 
                      maxHeight: '450px', 
                      overflowY: 'auto', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '1rem',
                      padding: '1.25rem',
                      borderRadius: '16px',
                      background: 'rgba(15, 12, 28, 0.4)'
                    }}
                  >
                    {(() => {
                      const filteredMessages = messages.filter(m => {
                        // 1. Filter by dropdown (thread)
                        if (chatFilter === 'general') {
                          if (m.gift_id || m.surprise_id) return false;
                        } else if (chatFilter.startsWith('gift:')) {
                          const targetGiftId = chatFilter.split(':')[1];
                          if (m.gift_id !== targetGiftId) return false;
                        } else if (chatFilter.startsWith('surprise:')) {
                          const targetSurpriseId = chatFilter.split(':')[1];
                          if (m.surprise_id !== targetSurpriseId) return false;
                        }

                        // 2. Filter by search query
                        if (!chatSearch.trim()) return true;
                        const query = chatSearch.toLowerCase();
                        const textMatch = (m.message || '').toLowerCase().includes(query);
                        const senderMatch = (profiles[m.user_id]?.display_name || '').toLowerCase().includes(query);
                        
                        // Check if the message is linked to a gift or surprise whose name contains the query
                        let refItemMatch = false;
                        if (m.gift_id) {
                          const refGift = gifts.find(g => g.id === m.gift_id);
                          if (refGift && refGift.name && refGift.name.toLowerCase().includes(query)) {
                            refItemMatch = true;
                          }
                        }
                        if (m.surprise_id) {
                          const refSurprise = surprises.find(s => s.id === m.surprise_id);
                          if (refSurprise && refSurprise.name && refSurprise.name.toLowerCase().includes(query)) {
                            refItemMatch = true;
                          }
                        }
                        
                        return textMatch || senderMatch || refItemMatch;
                      });

                      if (filteredMessages.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
                            {chatSearch ? 'Brak wiadomości spełniających kryteria wyszukiwania.' : 'Brak wiadomości w tym czacie. Napisz coś pierwszy!'}
                          </div>
                        );
                      }

                      return filteredMessages.map(m => {
                        const isMe = m.user_id === user?.id;
                        const senderName = profiles[m.user_id]?.display_name || 'Znajomy';
                        const isGiftMsg = !!m.gift_id;
                        const isSurpriseMsg = !!m.surprise_id;
                        
                        // Find referenced gift/surprise
                        const refGift = isGiftMsg ? gifts.find(g => g.id === m.gift_id) : null;
                        const refSurprise = isSurpriseMsg ? surprises.find(s => s.id === m.surprise_id) : null;
                        const refItem = refGift || refSurprise;

                        return (
                          <div 
                            key={m.id} 
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'column',
                              alignSelf: isMe ? 'flex-end' : 'flex-start',
                              maxWidth: '80%',
                              minWidth: '180px'
                            }}
                          >
                            <div style={{ 
                              fontSize: '0.75rem', 
                              color: 'var(--text-secondary)', 
                              marginBottom: '0.25rem',
                              alignSelf: isMe ? 'flex-end' : 'flex-start',
                              display: 'flex',
                              gap: '0.4rem'
                            }}>
                              <strong>{isMe ? 'Ty' : senderName}</strong>
                              <span>•</span>
                              <span>{formatMessageTime(m.created_at)}</span>
                            </div>

                            {(() => {
                              let bubbleStyle: React.CSSProperties = {};
                              if (isMe) {
                                  if (isGiftMsg) {
                                    bubbleStyle = {
                                      background: 'linear-gradient(135deg, #0891b2, #0284c7)', // Cyan/blue gradient
                                      boxShadow: '0 4px 12px rgba(8, 145, 178, 0.15)',
                                      border: 'none',
                                      color: 'white'
                                    };
                                  } else if (isSurpriseMsg) {
                                    bubbleStyle = {
                                      background: 'linear-gradient(135deg, #db2777, #7c3aed)', // Magenta/purple gradient
                                      boxShadow: '0 4px 12px rgba(219, 39, 119, 0.15)',
                                      border: 'none',
                                      color: 'white'
                                    };
                                  } else {
                                    bubbleStyle = {
                                      background: 'linear-gradient(135deg, var(--primary), var(--secondary))', // standard violet gradient
                                      boxShadow: '0 4px 12px rgba(170, 59, 255, 0.15)',
                                      border: 'none',
                                      color: 'white'
                                    };
                                  }
                              } else {
                                  if (isGiftMsg) {
                                    bubbleStyle = {
                                      background: 'rgba(8, 145, 178, 0.06)',
                                      border: '1px solid rgba(8, 145, 178, 0.25)',
                                      color: 'white'
                                    };
                                  } else if (isSurpriseMsg) {
                                    bubbleStyle = {
                                      background: 'rgba(219, 39, 119, 0.05)',
                                      border: '1px solid rgba(219, 39, 119, 0.25)',
                                      color: 'white'
                                    };
                                  } else {
                                    bubbleStyle = {
                                      background: 'rgba(255, 255, 255, 0.05)',
                                      border: '1px solid rgba(255, 255, 255, 0.06)',
                                      color: 'white'
                                    };
                                  }
                              }

                              return (
                                <div 
                                  style={{ 
                                    padding: '0.75rem 1rem',
                                    borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                    fontSize: '0.925rem',
                                    lineHeight: '1.4',
                                    wordBreak: 'break-word',
                                    ...bubbleStyle
                                  }}
                                >
                                  {m.message}
                                  
                                  {/* Reference badge */}
                                  {refItem ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                                      <div 
                                        onClick={() => {
                                          if (isSurpriseMsg) {
                                            setActiveSurpriseDetails(refItem);
                                          } else {
                                            setActiveGiftDetails(refItem);
                                          }
                                        }}
                                        style={{ 
                                          padding: '0.3rem 0.5rem', 
                                          background: 'rgba(0, 0, 0, 0.25)', 
                                          borderRadius: '6px', 
                                          fontSize: '0.75rem',
                                          color: isSurpriseMsg ? '#f472b6' : '#22d3ee',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.25rem',
                                          cursor: 'pointer',
                                          border: '1px solid rgba(255, 255, 255, 0.05)',
                                          alignSelf: 'flex-start'
                                        }}
                                      >
                                        {isSurpriseMsg ? '🤫 Niespodzianka: ' : '🎁 Prezent: '} 
                                        <strong>{refItem.name}</strong>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Input form */}
                  <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.75rem' }}>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Napisz wiadomość..." 
                      value={newMessage} 
                      onChange={e => setNewMessage(e.target.value)} 
                      style={{ padding: '0.75rem 1rem', borderRadius: '12px' }}
                      required
                    />
                    <button type="submit" className="btn btn-primary" style={{ flexShrink: 0, padding: '0 1.5rem' }}>
                      Wyślij
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </main>
      )}

      {/* ----------------- ADD OCCASION MODAL ----------------- */}
      {showOccasionModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>
                {editingOccasion?.title === '__PRZECHOWALNIA__' 
                  ? 'Edytuj Przechowalnię' 
                  : (editingOccasion ? 'Edytuj wydarzenie' : 'Dodaj nowe wydarzenie')}
              </h2>
              <button className="close-btn" onClick={closeOccasionModal}>×</button>
            </div>
            
            <form onSubmit={handleSaveOccasion}>
              {newOccasionTitle !== '__PRZECHOWALNIA__' && (
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
              )}

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

              {!editingOccasion && pastSolenizants.length > 0 && (
                <div style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Szybki wybór z poprzednich okazji:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.35rem' }}>
                    {pastSolenizants.map((ps, idx) => {
                      const userProfile = profiles[user?.id];
                      const isAdmin = userProfile?.is_admin;
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: '0.4rem 0.8rem',
                            fontSize: '0.85rem',
                            borderRadius: '20px',
                            background: 'rgba(170, 59, 255, 0.1)',
                            border: '1px solid rgba(170, 59, 255, 0.3)',
                            color: '#e0b0ff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <span 
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setNewOccasionOwnerName(ps.owner_name);
                              setNewOccasionOwnerId(ps.owner_id);
                            }}
                          >
                            👤 {ps.owner_name}
                          </span>
                          {isAdmin && (
                            <button
                              type="button"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '0 0.2rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                fontSize: '1rem',
                                fontWeight: 'bold'
                              }}
                              onClick={(e) => handleHideSolenizant(ps, e)}
                              title="Usuń z podpowiedzi"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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

              {newOccasionTitle !== '__PRZECHOWALNIA__' && isPastSolenizantSelected && (
                <div 
                  className="form-group" 
                  style={{ 
                    marginTop: '1rem', 
                    marginBottom: '1.25rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(170, 59, 255, 0.08)',
                    borderRadius: '10px',
                    border: '1px solid rgba(170, 59, 255, 0.2)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <label 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.75rem', 
                      cursor: 'pointer', 
                      textTransform: 'none', 
                      color: '#e0b0ff', 
                      fontWeight: 'normal',
                      margin: 0
                    }}
                  >
                    <input 
                      type="checkbox" 
                      checked={copyUnpurchasedGifts} 
                      onChange={e => setCopyUnpurchasedGifts(e.target.checked)}
                      style={{ 
                        width: '18px', 
                        height: '18px', 
                        accentColor: 'var(--primary)',
                        cursor: 'pointer' 
                      }}
                    />
                    czy dołożyć poprzednio niekupione prezenty do listy życzeń?
                  </label>
                </div>
              )}

              {newOccasionTitle !== '__PRZECHOWALNIA__' && (
                <>
                  <div className="form-row">
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
                      <label>Godzina (opcjonalnie)</label>
                      <input 
                        type="time" 
                        className="form-control" 
                        value={newOccasionTime} 
                        onChange={e => setNewOccasionTime(e.target.value)} 
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Lokalizacja (opcjonalnie)</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={newOccasionLocation} 
                      onChange={e => setNewOccasionLocation(e.target.value)} 
                      placeholder="np. Restauracja Pod Gruszą" 
                    />
                  </div>

                  <div className="form-group">
                    <label>Link do pinezki Google Maps (opcjonalnie)</label>
                    <input 
                      type="url" 
                      className="form-control" 
                      value={newOccasionGoogleMapsUrl} 
                      onChange={e => setNewOccasionGoogleMapsUrl(e.target.value)} 
                      placeholder="https://maps.google.com/..." 
                    />
                  </div>

                  <div className="form-group">
                    <label>Status wydarzenia *</label>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, textTransform: 'none', cursor: 'pointer', color: 'white' }}>
                        <input 
                          type="radio" 
                          name="is_draft" 
                          checked={newOccasionIsDraft} 
                          onChange={() => setNewOccasionIsDraft(true)}
                          style={{ width: '18px', height: '18px' }}
                        />
                        🛠️ Wersja robocza (ukryta przed gośćmi)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, textTransform: 'none', cursor: 'pointer', color: 'white' }}>
                        <input 
                          type="radio" 
                          name="is_draft" 
                          checked={!newOccasionIsDraft} 
                          onChange={() => setNewOccasionIsDraft(false)}
                          style={{ width: '18px', height: '18px' }}
                        />
                        ✅ Zatwierdzone (widoczne dla gości)
                      </label>
                    </div>
                  </div>

                  {newOccasionIsDraft && (
                    <div className="form-group" style={{ marginTop: '0.75rem' }}>
                      <label>Kto ma współtworzyć / widzieć tę wersję roboczą?</label>
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '0.5rem', 
                        background: 'rgba(0, 0, 0, 0.2)', 
                        padding: '0.75rem', 
                        borderRadius: '10px', 
                        border: '1px solid var(--card-border)',
                        maxHeight: '120px',
                        overflowY: 'auto'
                      }}>
                        {Object.values(profiles).filter(p => p.id !== user.id).map(p => {
                          const isChecked = newOccasionDraftAllowedIds.includes(p.id);
                          return (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <input 
                                type="checkbox" 
                                id={`draft-invite-${p.id}`}
                                checked={isChecked}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setNewOccasionDraftAllowedIds([...newOccasionDraftAllowedIds, p.id]);
                                  } else {
                                    setNewOccasionDraftAllowedIds(newOccasionDraftAllowedIds.filter(id => id !== p.id));
                                  }
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              <label 
                                htmlFor={`draft-invite-${p.id}`} 
                                style={{ margin: 0, textTransform: 'none', fontSize: '0.9rem', color: 'white', cursor: 'pointer' }}
                              >
                                {p.display_name}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Zaproszeni członkowie (kto ma widzieć wydarzenie) *</label>
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.5rem', 
                      background: 'rgba(0, 0, 0, 0.2)', 
                      padding: '0.75rem', 
                      borderRadius: '10px', 
                      border: '1px solid var(--card-border)',
                      maxHeight: '150px',
                      overflowY: 'auto'
                    }}>
                      {Object.values(profiles).map(p => {
                        const isChecked = newOccasionInvitedIds.includes(p.id);
                        return (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input 
                              type="checkbox" 
                              id={`invite-${p.id}`}
                              checked={isChecked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setNewOccasionInvitedIds([...newOccasionInvitedIds, p.id]);
                                } else {
                                  setNewOccasionInvitedIds(newOccasionInvitedIds.filter(id => id !== p.id));
                                }
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <label 
                              htmlFor={`invite-${p.id}`} 
                              style={{ margin: 0, textTransform: 'none', fontSize: '0.9rem', color: 'white', cursor: 'pointer' }}
                            >
                              {p.display_name} {p.id === user.id && '(Ty)'}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => setNewOccasionInvitedIds(Object.keys(profiles))}
                      >
                        Zaznacz wszystkich
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => setNewOccasionInvitedIds([])}
                      >
                        Odznacz wszystkich
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Krótki opis / Uwagi (np. rozmiar ubrań, preferencje)</label>
                    <textarea 
                      className="form-control" 
                      rows={3}
                      value={newOccasionDesc} 
                      onChange={e => setNewOccasionDesc(e.target.value)} 
                      placeholder="np. Rozmiar koszulki M, lubi książki kryminalne..."
                    />
                  </div>
                </>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeOccasionModal}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  Zapisz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- ADD/EDIT GIFT MODAL ----------------- */}
      {showGiftModal && activeOccasion && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h2>{editingGift ? (giftModalIsSurprise ? 'Edytuj niespodziankę' : 'Edytuj prezent') : (giftModalIsSurprise ? 'Zaproponuj niespodziankę' : 'Dodaj propozycję prezentu')}</h2>
              <button className="close-btn" onClick={() => setShowGiftModal(false)}>×</button>
            </div>

            <form onSubmit={handleSaveGift}>
              {!editingGift && (
                <div className="form-group autofill-section" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                  <label style={{ fontWeight: 600, color: 'var(--primary)' }}>Szybkie dodawanie z linku (Autouzupełnianie)</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <input 
                      type="url" 
                      className="form-control" 
                      placeholder="Wklej link do sklepu (np. Allegro, Amazon, itp.)"
                      value={autofillUrl}
                      onChange={e => setAutofillUrl(e.target.value)}
                    />
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ flexShrink: 0 }}
                      onClick={handleAutofillFromUrl}
                      disabled={scraping || !autofillUrl.trim()}
                    >
                      {scraping ? 'Uzupełnianie...' : 'Uzupełnij'}
                    </button>
                  </div>
                  <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block', fontSize: '0.8rem' }}>
                    Automatycznie pobierze nazwę, cenę, krótki opis i doda link do wariantów.
                  </small>
                </div>
              )}

              <div className="form-group">
                <label>{giftModalIsSurprise ? 'Nazwa niespodzianki *' : 'Nazwa prezentu *'}</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={newGiftName} 
                  onChange={e => setNewGiftName(e.target.value)} 
                  placeholder={giftModalIsSurprise ? "np. Wspólny lot balonem" : "np. Klocki LEGO Technic 42115"} 
                  required 
                />
              </div>

              {!giftModalIsSurprise && (
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
              )}

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
                  placeholder={giftModalIsSurprise ? "Dodatkowe informacje o niespodziance..." : "Dodatkowe informacje dla rezerwujących..."} 
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowGiftModal(false)}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {editingGift ? 'Zapisz' : 'Dodaj'}
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

      {/* ----------------- EVENT DETAILS MODAL ----------------- */}
      {activeOccasionDetails && (
        <div className="modal-overlay" style={{ zIndex: 1900 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Szczegóły wydarzenia</h2>
              <button className="close-btn" onClick={() => setActiveOccasionDetails(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', textAlign: 'left' }}>
              {activeOccasionDetails.is_draft && (
                <div className="alert alert-warning" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fba524', borderColor: 'rgba(245, 158, 11, 0.2)', padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  🛠️ Wersja robocza (widoczna tylko dla organizatorów).
                </div>
              )}
              <div>
                <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Nazwa okazji:</strong>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'white', marginTop: '0.15rem' }}>{activeOccasionDetails.title}</div>
              </div>
              <div>
                <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Dla kogo:</strong>
                <div style={{ fontSize: '1rem', marginTop: '0.15rem' }}>{activeOccasionDetails.owner_name}</div>
              </div>
              <div>
                <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Kiedy:</strong>
                <div style={{ fontSize: '1rem', marginTop: '0.15rem' }}>
                  📅 {formatDate(activeOccasionDetails.date)} {activeOccasionDetails.time && `o godz. ${activeOccasionDetails.time}`}
                  <span className="badge badge-info" style={{ marginLeft: '0.5rem' }}>{getDaysLeft(activeOccasionDetails.date)}</span>
                </div>
              </div>
              {activeOccasionDetails.location && (
                <div>
                  <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Lokalizacja:</strong>
                  <div style={{ fontSize: '1rem', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    📍 {activeOccasionDetails.location}
                    {activeOccasionDetails.google_maps_url && (
                      <a href={activeOccasionDetails.google_maps_url} target="_blank" rel="noopener noreferrer" className="gift-link-tag" style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}>
                        🗺️ Pokaż na mapie
                      </a>
                    )}
                  </div>
                </div>
              )}
              {activeOccasionDetails.description && (
                <div>
                  <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Opis / Uwagi:</strong>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.15rem', fontStyle: 'italic', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    "{activeOccasionDetails.description}"
                  </div>
                </div>
              )}
              <div>
                <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Stworzył:</strong>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  {profiles[activeOccasionDetails.creator_id]?.display_name || 'Ktoś'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.5rem', alignItems: 'center' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flexShrink: 0 }}
                onClick={() => setActiveOccasionDetails(null)}
              >
                Zamknij
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ flexShrink: 0 }}
                onClick={() => {
                  selectOccasion(activeOccasionDetails);
                  setActiveOccasionDetails(null);
                }}
              >
                Wejdź do środka
              </button>
              {activeOccasionDetails.creator_id === user?.id && (
                <>
                  {activeOccasionDetails.is_draft && (
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ border: '1px solid var(--accent-green)', color: 'var(--accent-green)', flexShrink: 0 }}
                      onClick={() => handleApproveOccasion(activeOccasionDetails.id, true)}
                    >
                      ✅ Zatwierdź
                    </button>
                  )}
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ flexShrink: 0 }}
                    onClick={() => {
                      startEditOccasion(activeOccasionDetails);
                      setActiveOccasionDetails(null);
                    }}
                  >
                    ✏️ Edytuj
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ flexShrink: 0 }}
                    onClick={() => {
                      handleToggleArchiveOccasion(activeOccasionDetails);
                    }}
                  >
                    {activeOccasionDetails.is_archived ? '🗄️ Przywróć' : '🗄️ Zarchiwizuj'}
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-danger btn-secondary" 
                    style={{ flexShrink: 0 }}
                    onClick={(e) => {
                      handleDeleteOccasion(activeOccasionDetails.id, e);
                      setActiveOccasionDetails(null);
                    }}
                  >
                    Usuń
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- GIFT DETAILS MODAL ----------------- */}
      {activeGiftDetails && (
        <div className="modal-overlay" style={{ zIndex: 1900 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>Szczegóły prezentu</h2>
              <button className="close-btn" onClick={() => setActiveGiftDetails(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', textAlign: 'left' }}>
              <div>
                <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Nazwa prezentu:</strong>
                <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'white', marginTop: '0.15rem' }}>{activeGiftDetails.name}</div>
              </div>
              {activeGiftDetails.description && (
                <div>
                  <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Opis:</strong>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.15rem', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    {activeGiftDetails.description}
                  </div>
                </div>
              )}
              <div>
                <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Cena:</strong>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white', marginTop: '0.15rem' }}>
                  {activeGiftDetails.price ? `${activeGiftDetails.price} zł` : '—'}
                </div>
              </div>
              <div>
                <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Linki do sklepów:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem' }}>
                  {activeGiftDetails.urls && activeGiftDetails.urls.length > 0 ? (
                    activeGiftDetails.urls.map((link: { label: string; url: string }, idx: number) => (
                      <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="gift-link-tag">
                        🔗 {link.label}
                      </a>
                    ))
                  ) : (
                    activeGiftDetails.url ? (
                      <a href={activeGiftDetails.url} target="_blank" rel="noopener noreferrer" className="gift-link-tag">
                        🔗 Sklep
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>Brak linków</span>
                    )
                  )}
                </div>
              </div>
              <div>
                <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Zaproponował:</strong>
                <div style={{ fontSize: '0.9rem', marginTop: '0.15rem' }}>
                  {profiles[activeGiftDetails.suggested_by || '']?.display_name || 'Solenizant'}
                </div>
              </div>
              
              {!isOwnerActiveOccasion && (
                <div>
                  <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Status / Zakup:</strong>
                  <div style={{ marginTop: '0.35rem' }}>
                    {renderGiftBookingsCell(activeGiftDetails, false)}
                  </div>
                </div>
              )}

              {!isOwnerActiveOccasion && (
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '1rem', marginTop: '1rem' }}>
                  <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
                    💬 Czat / komentarze do prezentu:
                  </strong>
                  
                  {/* Messages list for this gift */}
                  <div 
                    style={{ 
                      maxHeight: '180px', 
                      overflowY: 'auto', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      marginBottom: '0.75rem',
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    {(() => {
                      const itemMessages = messages.filter(m => m.gift_id === activeGiftDetails.id);

                      if (itemMessages.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '1rem 0' }}>
                            Brak komentarzy. Napisz coś!
                          </div>
                        );
                      }

                      return itemMessages.map(m => {
                        const isMe = m.user_id === user?.id;
                        const senderName = profiles[m.user_id]?.display_name || 'Znajomy';
                        return (
                          <div 
                            key={m.id} 
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'column',
                              alignSelf: isMe ? 'flex-end' : 'flex-start',
                              maxWidth: '85%'
                            }}
                          >
                            <div style={{ 
                              fontSize: '0.7rem', 
                              color: 'var(--text-secondary)', 
                              marginBottom: '0.15rem',
                              alignSelf: isMe ? 'flex-end' : 'flex-start'
                            }}>
                              <strong>{isMe ? 'Ty' : senderName}</strong> • {formatMessageTime(m.created_at)}
                            </div>
                            <div 
                              style={{ 
                                background: isMe ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 'rgba(255, 255, 255, 0.05)',
                                color: 'white',
                                padding: '0.5rem 0.75rem',
                                borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                fontSize: '0.85rem',
                                border: isMe ? 'none' : '1px solid rgba(255, 255, 255, 0.05)',
                                wordBreak: 'break-word'
                              }}
                            >
                              {m.message}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Send comment form */}
                  <form onSubmit={(e) => handleSendComment(e, activeGiftDetails.id, false)} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Dodaj komentarz..." 
                      value={newComment} 
                      onChange={e => setNewComment(e.target.value)} 
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem' }}
                      required
                    />
                    <button type="submit" className="btn btn-primary" style={{ padding: '0 1rem', fontSize: '0.85rem' }}>
                      Wyślij
                    </button>
                  </form>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setActiveGiftDetails(null)}
              >
                Zamknij
              </button>
              {(activeGiftDetails.suggested_by === user?.id || profiles[user?.id]?.is_admin) && (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => startEditGift(activeGiftDetails, false)}
                >
                  ✏️ Edytuj
                </button>
              )}
              {(activeGiftDetails.suggested_by === user?.id || activeOccasion?.creator_id === user?.id || profiles[user?.id]?.is_admin) && (
                <button 
                  type="button" 
                  className="btn btn-danger btn-secondary" 
                  onClick={() => {
                    handleDeleteItem(activeGiftDetails.id, false);
                    setActiveGiftDetails(null);
                  }}
                >
                  Usuń prezent
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- SURPRISE DETAILS MODAL ----------------- */}
      {activeSurpriseDetails && (
        <div className="modal-overlay" style={{ zIndex: 1900 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>Szczegóły niespodzianki</h2>
              <button className="close-btn" onClick={() => setActiveSurpriseDetails(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', textAlign: 'left' }}>
              <div>
                <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Nazwa niespodzianki:</strong>
                <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'white', marginTop: '0.15rem' }}>{activeSurpriseDetails.name}</div>
              </div>
              {activeSurpriseDetails.description && (
                <div>
                  <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Opis:</strong>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.15rem', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    {activeSurpriseDetails.description}
                  </div>
                </div>
              )}
              <div>
                <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Zaproponował:</strong>
                <div style={{ fontSize: '0.9rem', marginTop: '0.15rem' }}>
                  {profiles[activeSurpriseDetails.suggested_by || '']?.display_name || 'Znajomy'}
                </div>
              </div>
              <div>
                <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Linki do sklepów:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem' }}>
                  {activeSurpriseDetails.urls && activeSurpriseDetails.urls.length > 0 ? (
                    activeSurpriseDetails.urls.map((link: { label: string; url: string }, idx: number) => (
                      <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="gift-link-tag">
                        🔗 {link.label}
                      </a>
                    ))
                  ) : (
                    activeSurpriseDetails.url ? (
                      <a href={activeSurpriseDetails.url} target="_blank" rel="noopener noreferrer" className="gift-link-tag">
                        🔗 Sklep
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>Brak linków</span>
                    )
                  )}
                </div>
              </div>

              {!isOwnerActiveOccasion && (
                <div>
                  <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Status / Zatwierdzenie:</strong>
                  <div style={{ marginTop: '0.35rem' }}>
                    {renderGiftBookingsCell(activeSurpriseDetails, true)}
                  </div>
                </div>
              )}

              {!isOwnerActiveOccasion && (
                <div>
                  <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Polubienia / Głosy:</strong>
                  <div style={{ marginTop: '0.35rem' }}>
                    <button 
                      className={`btn ${hasUserVoted(activeSurpriseDetails.id, true) ? 'btn-primary' : 'btn-secondary'}`} 
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                      onClick={() => hasUserVoted(activeSurpriseDetails.id, true) ? handleUnvote(activeSurpriseDetails.id, true) : handleVote(activeSurpriseDetails.id, true)}
                    >
                      👍 {getVoteCount(activeSurpriseDetails.id, true)} Głosów
                    </button>
                  </div>
                </div>
              )}

              {!isOwnerActiveOccasion && (
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '1rem', marginTop: '1rem' }}>
                  <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
                    💬 Czat / komentarze do niespodzianki:
                  </strong>
                  
                  {/* Messages list for this surprise */}
                  <div 
                    style={{ 
                      maxHeight: '180px', 
                      overflowY: 'auto', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      marginBottom: '0.75rem',
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    {(() => {
                      const itemMessages = messages.filter(m => m.surprise_id === activeSurpriseDetails.id);

                      if (itemMessages.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '1rem 0' }}>
                            Brak komentarzy. Napisz coś!
                          </div>
                        );
                      }

                      return itemMessages.map(m => {
                        const isMe = m.user_id === user?.id;
                        const senderName = profiles[m.user_id]?.display_name || 'Znajomy';
                        return (
                          <div 
                            key={m.id} 
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'column',
                              alignSelf: isMe ? 'flex-end' : 'flex-start',
                              maxWidth: '85%'
                            }}
                          >
                            <div style={{ 
                              fontSize: '0.7rem', 
                              color: 'var(--text-secondary)', 
                              marginBottom: '0.15rem',
                              alignSelf: isMe ? 'flex-end' : 'flex-start'
                            }}>
                              <strong>{isMe ? 'Ty' : senderName}</strong> • {formatMessageTime(m.created_at)}
                            </div>
                            <div 
                              style={{ 
                                background: isMe ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 'rgba(255, 255, 255, 0.05)',
                                color: 'white',
                                padding: '0.5rem 0.75rem',
                                borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                fontSize: '0.85rem',
                                border: isMe ? 'none' : '1px solid rgba(255, 255, 255, 0.05)',
                                wordBreak: 'break-word'
                              }}
                            >
                              {m.message}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Send comment form */}
                  <form onSubmit={(e) => handleSendComment(e, activeSurpriseDetails.id, true)} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Dodaj komentarz..." 
                      value={newComment} 
                      onChange={e => setNewComment(e.target.value)} 
                      style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem' }}
                      required
                    />
                    <button type="submit" className="btn btn-primary" style={{ padding: '0 1rem', fontSize: '0.85rem' }}>
                      Wyślij
                    </button>
                  </form>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setActiveSurpriseDetails(null)}
              >
                Zamknij
              </button>
              {(activeSurpriseDetails.suggested_by === user?.id || profiles[user?.id]?.is_admin) && (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => startEditGift(activeSurpriseDetails, true)}
                >
                  ✏️ Edytuj
                </button>
              )}
              {(activeSurpriseDetails.suggested_by === user?.id || activeOccasion?.creator_id === user?.id || profiles[user?.id]?.is_admin) && (
                <button 
                  type="button" 
                  className="btn btn-danger btn-secondary" 
                  onClick={() => {
                    handleDeleteItem(activeSurpriseDetails.id, true);
                    setActiveSurpriseDetails(null);
                  }}
                >
                  Usuń niespodziankę
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- BOOKING MODAL ----------------- */}
      {bookingModal?.show && (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '450px', textAlign: 'center' }}>
            <div className="modal-header" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>🎁 Rezerwacja prezentu</h2>
            </div>
            {!isSelectingSkladkaUsers ? (
              <>
                <div className="modal-body" style={{ marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: '1.5' }}>
                  Chcesz zarezerwować prezent <strong>{bookingModal.giftName}</strong>.
                  <br />
                  Wybierz, czy rezerwujesz go samodzielnie, czy chcesz zorganizować składkę:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <button 
                    className="btn btn-primary" 
                    onClick={async () => {
                      const gId = bookingModal.giftId;
                      const isS = !!bookingModal.isSurprise;
                      setBookingModal(null);
                      await handleBook(gId, false, null, isS);
                    }}
                  >
                    👤 Rezerwuję sam
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    style={{ border: '1px solid var(--primary)' }}
                    onClick={() => {
                      setIsSelectingSkladkaUsers(true);
                      setSkladkaSelectedUsers([]);
                    }}
                  >
                    👥 Składka (organizuję składkę grupową)
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => setBookingModal(null)}
                  >
                    Anuluj
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-body" style={{ marginBottom: '1rem', fontSize: '0.95rem', lineHeight: '1.5' }}>
                  Wybierz innych uczestników składki na <strong>{bookingModal.giftName}</strong>:
                </div>
                {(() => {
                  const solenizantId = activeOccasion?.owner_id;
                  const selectableUserIds = (activeOccasion?.invited_user_ids && activeOccasion.invited_user_ids.length > 0)
                    ? activeOccasion.invited_user_ids.filter(id => id !== user?.id && id !== solenizantId)
                    : Object.keys(profiles).filter(id => id !== user?.id && id !== solenizantId);

                  return (
                    <div style={{ maxHeight: '200px', overflowY: 'auto', textAlign: 'left', margin: '1rem 0', padding: '0.5rem', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {selectableUserIds.length === 0 ? (
                        <div style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.9rem' }}>
                          Brak innych zaproszonych uczestników do wyboru.
                        </div>
                      ) : (
                        selectableUserIds.map(uid => {
                          const p = profiles[uid];
                          if (!p) return null;
                          const isChecked = skladkaSelectedUsers.includes(uid);
                          return (
                            <label key={uid} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem', cursor: 'pointer', color: 'white', textTransform: 'none', margin: 0, fontSize: '0.925rem' }}>
                              <input 
                                type="checkbox" 
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setSkladkaSelectedUsers(skladkaSelectedUsers.filter(id => id !== uid));
                                  } else {
                                    setSkladkaSelectedUsers([...skladkaSelectedUsers, uid]);
                                  }
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              <span>{p.display_name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ flex: 1 }}
                    onClick={() => {
                      setIsSelectingSkladkaUsers(false);
                      setSkladkaSelectedUsers([]);
                    }}
                  >
                    Wstecz
                  </button>
                  <button 
                    className="btn btn-primary" 
                    style={{ flex: 1 }}
                    onClick={async () => {
                      const gId = bookingModal.giftId;
                      const isS = !!bookingModal.isSurprise;
                      const users = skladkaSelectedUsers;
                      setBookingModal(null);
                      setIsSelectingSkladkaUsers(false);
                      setSkladkaSelectedUsers([]);
                      await handleBook(gId, true, generateUUID(), isS, users);
                    }}
                  >
                    Stwórz składkę
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* ----------------- CREATE LOCKER MODAL ----------------- */}
      {showCreateLockerModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>Nowa lista w Przechowalni</h2>
              <button className="close-btn" onClick={() => setShowCreateLockerModal(false)}>×</button>
            </div>
            
            <form onSubmit={handleCreateLocker}>
              <div className="form-group">
                <label>Dla kogo jest ta lista? (Właściciel) *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={newLockerOwnerName} 
                  onChange={e => setNewLockerOwnerName(e.target.value)} 
                  placeholder="np. Tomek" 
                  required 
                />
              </div>

              {pastSolenizants.length > 0 && (
                <div style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Sugerowane z poprzednich okazji:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.35rem' }}>
                    {pastSolenizants.map((ps, idx) => {
                      const userProfile = profiles[user?.id];
                      const isAdmin = userProfile?.is_admin;
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: '0.4rem 0.8rem',
                            fontSize: '0.85rem',
                            borderRadius: '20px',
                            background: 'rgba(170, 59, 255, 0.1)',
                            border: '1px solid rgba(170, 59, 255, 0.3)',
                            color: '#e0b0ff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <span 
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setNewLockerOwnerName(ps.owner_name);
                              setNewLockerOwnerId(ps.owner_id);
                            }}
                          >
                            👤 {ps.owner_name}
                          </span>
                          {isAdmin && (
                            <button
                              type="button"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '0 0.2rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                fontSize: '1rem',
                                fontWeight: 'bold'
                              }}
                              onClick={(e) => handleHideSolenizant(ps, e)}
                              title="Usuń z podpowiedzi"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Konto solenizanta w aplikacji (opcjonalnie)</label>
                <select 
                  className="form-control"
                  value={newLockerOwnerId}
                  onChange={e => setNewLockerOwnerId(e.target.value)}
                >
                  <option value="">-- Wybierz profil (lub pozostaw puste) --</option>
                  {Object.values(profiles).map(p => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateLockerModal(false)}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Tworzenie...' : 'Utwórz listę'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MOVE GIFTS MODAL ----------------- */}
      {showMoveModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>Przenieś prezenty do Przechowalni</h2>
              <button className="close-btn" onClick={() => setShowMoveModal(false)}>×</button>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              await handleMoveGifts(moveTargetId, moveNewOwnerName, moveNewOwnerId);
            }}>
              <div className="form-group">
                <label>Wybierz docelową Przechowalnię</label>
                <select 
                  className="form-control"
                  value={moveTargetId}
                  onChange={e => setMoveTargetId(e.target.value)}
                  required
                >
                  <option value="">-- Wybierz listę --</option>
                  {occasions.filter(o => o.title === '__PRZECHOWALNIA__').map(o => (
                    <option key={o.id} value={o.id}>{o.owner_name}</option>
                  ))}
                  <option value="new">-- Utwórz nową listę dla... --</option>
                </select>
              </div>

              {moveTargetId === 'new' && (
                <div style={{ animation: 'fadeIn 0.2s ease' }}>
                  <div className="form-group">
                    <label>Dla kogo? (Właściciel nowej listy) *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={moveNewOwnerName} 
                      onChange={e => setMoveNewOwnerName(e.target.value)} 
                      placeholder="np. Tomek" 
                      required 
                    />
                  </div>

                  {pastSolenizants.length > 0 && (
                    <div style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Sugerowane z poprzednich okazji:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.35rem' }}>
                        {pastSolenizants.map((ps, idx) => {
                          const userProfile = profiles[user?.id];
                          const isAdmin = userProfile?.is_admin;
                          return (
                            <div
                              key={idx}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                borderRadius: '20px',
                                background: 'rgba(170, 59, 255, 0.1)',
                                border: '1px solid rgba(170, 59, 255, 0.3)',
                                padding: '0.2rem 0.5rem 0.2rem 0.8rem',
                                gap: '0.3rem',
                                color: '#e0b0ff',
                                fontSize: '0.85rem'
                              }}
                            >
                              <span 
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setMoveNewOwnerName(ps.owner_name);
                                  setMoveNewOwnerId(ps.owner_id);
                                }}
                              >
                                👤 {ps.owner_name}
                              </span>
                              {isAdmin && (
                                <button
                                  type="button"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    padding: '0 0.25rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    fontSize: '0.8rem',
                                    fontWeight: 'bold'
                                  }}
                                  onClick={(e) => handleHideSolenizant(ps, e)}
                                  title="Usuń z podpowiedzi"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label>Konto użytkownika w aplikacji (opcjonalnie)</label>
                    <select 
                      className="form-control"
                      value={moveNewOwnerId}
                      onChange={e => setMoveNewOwnerId(e.target.value)}
                    >
                      <option value="">-- Wybierz profil --</option>
                      {Object.values(profiles).map(p => (
                        <option key={p.id} value={p.id}>{p.display_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMoveModal(false)}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Przenoszenie...' : 'Przenieś'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- ADD FROM LOCKER MODAL ----------------- */}
      {showAddFromLockerModal && activeOccasion && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>Dodaj prezenty z Przechowalni</h2>
              <button className="close-btn" onClick={() => setShowAddFromLockerModal(false)}>×</button>
            </div>
            
            <div className="form-group">
              <label>Wybierz Przechowalnię</label>
              <select
                className="form-control"
                value={addFromLockerLockerId}
                onChange={e => {
                  setAddFromLockerLockerId(e.target.value);
                  setAddFromLockerSelectedGifts([]);
                }}
              >
                <option value="">-- Wybierz Przechowalnię --</option>
                {occasions.filter(o => o.title === '__PRZECHOWALNIA__').map(o => (
                  <option key={o.id} value={o.id}>{o.owner_name}</option>
                ))}
              </select>
            </div>

            {addFromLockerLockerId && (() => {
              const lockerGifts = getLockerGiftsForSolenizant(addFromLockerLockerId);
              return (
                <div style={{ marginTop: '1rem' }}>
                  {lockerGifts.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center', margin: '2rem 0' }}>
                      Brak prezentów w wybranej Przechowalni.
                    </p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', justifyContent: 'flex-end' }}>
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} 
                          onClick={() => setAddFromLockerSelectedGifts(lockerGifts.map(g => g.id))}
                        >
                          Zaznacz wszystkie
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} 
                          onClick={() => setAddFromLockerSelectedGifts([])}
                        >
                          Odznacz wszystkie
                        </button>
                      </div>
                      <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.5rem', background: 'rgba(0,0,0,0.1)' }}>
                        {lockerGifts.map(g => (
                          <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'white', textTransform: 'none', margin: 0 }}>
                            <input 
                              type="checkbox"
                              checked={addFromLockerSelectedGifts.includes(g.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setAddFromLockerSelectedGifts([...addFromLockerSelectedGifts, g.id]);
                                } else {
                                  setAddFromLockerSelectedGifts(addFromLockerSelectedGifts.filter(id => id !== g.id));
                                }
                              }}
                              style={{ width: '18px', height: '18px' }}
                            />
                            <div>
                              <strong>{g.name}</strong>
                              {g.price ? <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({g.price} zł)</span> : null}
                              {g.description ? <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>{g.description}</p> : null}
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddFromLockerModal(false)}>
                Anuluj
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                disabled={loading || addFromLockerSelectedGifts.length === 0} 
                onClick={handleAddFromLocker}
              >
                {loading ? 'Dodawanie...' : `Dodaj zaznaczone (${addFromLockerSelectedGifts.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- ADD FROM UNPURCHASED MODAL ----------------- */}
      {showAddFromUnpurchasedModal && activeOccasion && (() => {
        const unpurchasedGifts = getUnpurchasedGiftsForSolenizant(activeOccasion.owner_name, activeOccasion.owner_id || null);
        return (
          <div className="modal-overlay">
            <div className="glass-panel modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="modal-header">
                <h2>Dodaj z niekupionych prezentów starych wydarzeń</h2>
                <button className="close-btn" onClick={() => setShowAddFromUnpurchasedModal(false)}>×</button>
              </div>
              
              <div style={{ marginTop: '0.5rem' }}>
                {unpurchasedGifts.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', margin: '2rem 0' }}>
                    Brak niekupionych prezentów z poprzednich wydarzeń tego solenizanta.
                  </p>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', justifyContent: 'flex-end' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} 
                        onClick={() => setAddFromUnpurchasedSelectedGifts(unpurchasedGifts.map(g => g.id))}
                      >
                        Zaznacz wszystkie
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} 
                        onClick={() => setAddFromUnpurchasedSelectedGifts([])}
                      >
                        Odznacz wszystkie
                      </button>
                    </div>
                    <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.5rem', background: 'rgba(0,0,0,0.1)' }}>
                      {unpurchasedGifts.map(g => {
                        const occ = occasions.find(o => o.id === g.occasion_id);
                        const occInfo = occ ? `${occ.title} (${formatDate(occ.date)})` : 'Poprzednie wydarzenie';
                        return (
                          <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.5rem', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'white', textTransform: 'none', margin: 0 }}>
                            <input 
                              type="checkbox"
                              checked={addFromUnpurchasedSelectedGifts.includes(g.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setAddFromUnpurchasedSelectedGifts([...addFromUnpurchasedSelectedGifts, g.id]);
                                } else {
                                  setAddFromUnpurchasedSelectedGifts(addFromUnpurchasedSelectedGifts.filter(id => id !== g.id));
                                }
                              }}
                              style={{ width: '18px', height: '18px' }}
                            />
                            <div>
                              <strong>{g.name}</strong>
                              {g.price ? <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>({g.price} zł)</span> : null}
                              <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '0.15rem' }}>z: {occInfo}</div>
                              {g.description ? <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>{g.description}</p> : null}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddFromUnpurchasedModal(false)}>
                  Anuluj
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  disabled={loading || addFromUnpurchasedSelectedGifts.length === 0} 
                  onClick={handleAddFromUnpurchased}
                >
                  {loading ? 'Dodawanie...' : `Dodaj zaznaczone (${addFromUnpurchasedSelectedGifts.length})`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setConfirmModal({ ...confirmModal, show: false })}
              >
                Anuluj
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
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
