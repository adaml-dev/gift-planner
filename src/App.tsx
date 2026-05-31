import { useState, useEffect } from 'react';
import { supabase, authAdminClient } from './supabase';
import giftBanner from './assets/gift_banner.png';
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
  gift_id: string;
  user_id: string;
  created_at: string;
  is_group?: boolean;
  group_id?: string | null;
  is_approved?: boolean;
}

interface Vote {
  id: string;
  gift_id: string;
  user_id: string;
  created_at: string;
}

function App() {
  const [occasionsView, setOccasionsView] = useState<'table' | 'grid'>(
    () => (localStorage.getItem('gp_occasions_view') as 'table' | 'grid') || 'table'
  );
  const [giftsView, setGiftsView] = useState<'table' | 'grid'>(
    () => (localStorage.getItem('gp_gifts_view') as 'table' | 'grid') || 'table'
  );
  const [user, setUser] = useState<any>(null);
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem('gp_unlocked') === 'true');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // App navigation & core state
  const [view, setView] = useState<'dashboard' | 'occasion' | 'my-bookings'>('dashboard');
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [activeOccasion, setActiveOccasion] = useState<Occasion | null>(null);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [allGifts, setAllGifts] = useState<Gift[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  
  // Tab control in Occasion view
  const [activeTab, setActiveTab] = useState<'solenizant' | 'goscie'>('solenizant');

  // Modals / Form states
  const [showOccasionModal, setShowOccasionModal] = useState(false);
  const [editingOccasion, setEditingOccasion] = useState<Occasion | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'upcoming' | 'archived'>('upcoming');
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
  const [bookingModal, setBookingModal] = useState<{ show: boolean; giftId: string; giftName: string } | null>(null);
  const [activeOccasionDetails, setActiveOccasionDetails] = useState<Occasion | null>(null);
  const [activeGiftDetails, setActiveGiftDetails] = useState<Gift | null>(null);
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

  // Find bookings of the current user that are rejected (i.e. not approved, but someone else has an approved booking for the same gift)
  const myRejectedBookings = user ? bookings.filter(b => {
    if (b.user_id !== user.id) return false;
    if (b.is_approved) return false;
    return bookings.some(otherB => otherB.gift_id === b.gift_id && otherB.is_approved);
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
      fetchAllGifts()
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
      const { error } = await supabase
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
        });

      if (error) {
        setToast({ message: 'Nie udało się utworzyć okazji: ' + error.message, type: 'error' });
      } else {
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
      await fetchGifts(activeOccasion.id);
      await fetchAllGifts();
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
    } else {
      if (activeOccasion) {
        fetchBookings(activeOccasion.id);
      }
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
  // - If current user is the owner, only gifts suggested/added by the owner.
  // - Otherwise, all gifts that are not marked as secret (is_secret = false).
  const solenizantGifts = gifts.filter(g => {
    if (isOwnerActiveOccasion) {
      return g.suggested_by === user?.id;
    }
    return !g.is_secret;
  });

  // Guest tab (Pomysły gości) includes:
  // - Gifts marked as secret (is_secret = true)
  // - These are only shown if current user is NOT the owner of this occasion
  const goscieGifts = isOwnerActiveOccasion ? [] : gifts.filter(g => g.is_secret);

  // Sort goscieGifts by votes count
  const getVoteCount = (giftId: string) => votes.filter(v => v.gift_id === giftId).length;
  const hasUserVoted = (giftId: string) => votes.some(v => v.gift_id === giftId && v.user_id === user?.id);
  
  const sortedGoscieGifts = [...goscieGifts].sort((a, b) => getVoteCount(b.id) - getVoteCount(a.id));

  const handleToggleApproveBooking = async (bookingId: string, approve: boolean) => {
    setLoading(true);
    const { error } = await supabase
      .from('gp_bookings')
      .update({ is_approved: approve })
      .eq('id', bookingId);

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

  const renderGiftQueueAndActions = (gift: Gift) => {
    const giftBookings = bookings.filter(b => b.gift_id === gift.id);
    
    const myBooking = giftBookings.find(b => b.user_id === user?.id);
    const hasMyBooking = !!myBooking;
    const approvedBooking = giftBookings.find(b => b.is_approved);
    const hasApproved = !!approvedBooking;
    const isOrganizer = activeOccasion?.creator_id === user?.id;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
        {giftBookings.length > 0 && (
          <div className="bookings-queue" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {giftBookings.map((b, idx) => {
              const isMyBooking = b.user_id === user?.id;
              const displayName = profiles[b.user_id]?.display_name || 'Znajomy';

              return (
                <div 
                  key={b.id} 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '0.35rem', 
                    background: b.is_approved 
                      ? 'rgba(16, 185, 129, 0.08)' 
                      : (hasApproved ? 'rgba(239, 68, 68, 0.03)' : 'rgba(255, 255, 255, 0.02)'), 
                    padding: '0.6rem 0.8rem', 
                    borderRadius: '8px', 
                    border: b.is_approved 
                      ? '1px solid rgba(16, 185, 129, 0.25)' 
                      : (hasApproved ? '1px solid rgba(239, 68, 68, 0.15)' : '1px solid rgba(255, 255, 255, 0.05)'),
                    fontSize: '0.85rem',
                    opacity: (!b.is_approved && hasApproved) ? 0.75 : 1
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                      #{idx + 1} {b.is_group ? '👥 Składka' : '👤 Rezerwacja'}
                    </span>
                    {b.is_approved ? (
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
                        ✓ Polecenie zakupu
                      </span>
                    ) : hasApproved ? (
                      <span 
                        className="badge badge-danger" 
                        style={{ 
                          fontSize: '0.7rem', 
                          background: 'rgba(239, 68, 68, 0.15)', 
                          color: 'var(--accent-red, #ef4444)', 
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px'
                        }}
                      >
                        ❌ Odrzucona
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
                        ⏳ W kolejce
                      </span>
                    )}
                  </div>
                  
                  <div style={{ color: 'white', fontWeight: 500 }}>
                    Kupujący: <strong style={{ color: 'var(--text-primary)' }}>{isMyBooking ? 'Ty' : displayName}</strong>
                  </div>

                  {!b.is_approved && hasApproved && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent-red, #fca5a5)', fontStyle: 'italic' }}>
                      Organizator zatwierdził zakup przez: {approvedBooking ? (profiles[approvedBooking.user_id]?.display_name || 'innego uczestnika') : 'innego uczestnika'}
                    </div>
                  )}

                  {/* Actions for this specific booking item */}
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                    {isOrganizer && (
                      <>
                        {b.is_approved ? (
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }} 
                            onClick={() => handleToggleApproveBooking(b.id, false)}
                          >
                            🔄 Cofnij zatwierdzenie
                          </button>
                        ) : (
                          !hasApproved && (
                            <button 
                              className="btn btn-primary" 
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#10b981', borderColor: '#10b981' }} 
                              onClick={() => handleToggleApproveBooking(b.id, true)}
                            >
                              ✅ Zatwierdź zakup
                            </button>
                          )
                        )}
                      </>
                    )}

                    {isMyBooking && (
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} 
                        onClick={() => handleUnbook(gift.id)}
                      >
                        {b.is_approved ? 'Anuluj zakup' : (b.is_group ? 'Opuść składkę' : 'Anuluj rezerwację')}
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
                onClick={() => setBookingModal({ show: true, giftId: gift.id, giftName: gift.name })}
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
  const renderGiftBookingsCell = (gift: Gift) => {
    return renderGiftQueueAndActions(gift);
  };

  // Render list of gifts in a compact table view
  const renderGiftsTable = (giftsList: Gift[], isSurprise: boolean = false) => {
    return (
      <div className="table-responsive">
        <table className="compact-table">
          <thead>
            <tr>
              <th>Prezent</th>
              {isSurprise && <th>Zaproponował</th>}
              <th>Cena</th>
              <th style={{ textAlign: 'right' }}>
                <span className="hide-mobile">Szczegóły</span>
                <span className="show-mobile-inline">...</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {giftsList.map(gift => {
              const giftBookings = bookings.filter(b => b.gift_id === gift.id);
              const approvedBooking = giftBookings.find(b => b.is_approved);
              const isBoughtBySomeoneElse = !isOwnerActiveOccasion && approvedBooking && approvedBooking.user_id !== user?.id;
              const approvedBuyerName = approvedBooking 
                ? (profiles[approvedBooking.user_id]?.display_name || 'Znajomy')
                : 'Ktoś inny';

              const suggestedByName = profiles[gift.suggested_by || '']?.display_name || 'Solenizant';

              return (
                <tr 
                  key={gift.id} 
                  style={isBoughtBySomeoneElse ? { 
                    opacity: 0.55, 
                    filter: 'grayscale(100%)', 
                    background: 'rgba(255, 255, 255, 0.01)',
                    color: 'var(--text-secondary)'
                  } : undefined}
                >
                  <td data-label="Prezent" style={{ fontWeight: 500 }}>
                    {gift.name} {isBoughtBySomeoneElse && <span style={{ fontSize: '0.75rem', fontWeight: 'normal', fontStyle: 'italic', marginLeft: '0.4rem', color: 'var(--text-secondary)' }}>(Kupuje: {approvedBuyerName})</span>}
                  </td>
                  {isSurprise && (
                    <td data-label="Zaproponował" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      👤 {suggestedByName}
                    </td>
                  )}
                  <td data-label="Cena" style={{ whiteSpace: 'nowrap' }}>
                    {gift.price ? <strong style={{ color: isBoughtBySomeoneElse ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{gift.price} zł</strong> : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                  </td>
                  <td data-label="Szczegóły" style={{ textAlign: 'right' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem', fontWeight: 'bold' }} 
                      onClick={() => setActiveGiftDetails(gift)}
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
    );
  };

  // Render a single gift card (for tiles view)
  const renderGiftCard = (gift: Gift, isGuestTab: boolean) => {
    const isGiftCreator = gift.suggested_by === user?.id;

    const votesCount = getVoteCount(gift.id);
    const userVoted = hasUserVoted(gift.id);

    const giftBookings = bookings.filter(b => b.gift_id === gift.id);
    const approvedBooking = giftBookings.find(b => b.is_approved);
    const isBoughtBySomeoneElse = !isOwnerActiveOccasion && approvedBooking && approvedBooking.user_id !== user?.id;
    const approvedBuyerName = approvedBooking 
      ? (profiles[approvedBooking.user_id]?.display_name || 'Znajomy')
      : 'Ktoś inny';

    return (
      <div 
        key={gift.id} 
        className="glass-panel gift-card" 
        style={{ 
          position: 'relative',
          ...(isBoughtBySomeoneElse ? {
            opacity: 0.55,
            filter: 'grayscale(100%)',
            background: 'rgba(0, 0, 0, 0.15)',
            borderColor: 'rgba(255, 255, 255, 0.02)',
            color: 'var(--text-secondary)'
          } : {})
        }}
      >
        {isGuestTab ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', paddingRight: (isGiftCreator || activeOccasion?.creator_id === user?.id) ? '40px' : '0' }}>
            <h3 style={{ margin: 0 }}>
              {gift.name} {isBoughtBySomeoneElse && <span style={{ fontSize: '0.8rem', fontWeight: 'normal', fontStyle: 'italic', color: 'var(--text-secondary)' }}>(Kupuje: {approvedBuyerName})</span>}
            </h3>
            <div className="vote-section" style={{ flexShrink: 0 }}>
              <button 
                className={`btn ${userVoted ? 'btn-primary' : 'btn-secondary'}`} 
                style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                onClick={() => userVoted ? handleUnvote(gift.id) : handleVote(gift.id)}
                disabled={isBoughtBySomeoneElse}
              >
                👍 {votesCount}
              </button>
            </div>
          </div>
        ) : (
          <h3>
            {gift.name} {isBoughtBySomeoneElse && <span style={{ fontSize: '0.8rem', fontWeight: 'normal', fontStyle: 'italic', color: 'var(--text-secondary)' }}>(Kupuje: {approvedBuyerName})</span>}
          </h3>
        )}

        {gift.description && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>{gift.description}</p>}
        
        {gift.price && <div className="gift-price" style={{ color: isBoughtBySomeoneElse ? 'var(--text-secondary)' : 'inherit' }}>{gift.price} zł</div>}
        
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
            {renderGiftQueueAndActions(gift)}
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
            <img src={giftBanner} alt="Gift Planner Logo" width="300" height="200" style={{ objectFit: 'cover' }} />
            <h1>Gift Planner</h1>
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
            <img src={giftBanner} alt="Gift Planner Logo" width="300" height="200" style={{ objectFit: 'cover' }} />
            <h1>Gift Planner</h1>
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
          <div className="navbar-brand" onClick={() => { setView('dashboard'); setActiveOccasion(null); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', cursor: 'pointer' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>🎁 Gift Planner</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 'normal', color: 'var(--text-secondary)', opacity: 0.7 }}>
              v{versionInfo.version} ({versionInfo.date})
            </span>
          </div>
          <div className="navbar-user">
            {isAdmin && (
              <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => setShowAddMemberModal(true)}>
                👤 <span className="hide-mobile">Zarządzaj rodziną</span><span className="show-mobile-inline">Rodzina</span>
              </button>
            )}
            <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              Cześć, <strong>{userProfile?.display_name || user.email?.split('@')[0]}</strong>!
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
              Wyloguj
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
    .filter(occ => {
      const { isPast, isArchived } = getOccasionCategory(occ);
      return !isPast && !isArchived;
    });

  const archivedOrPastOccasions = occasions
    .filter(isUserInvited)
    .filter(occ => {
      const { isPast, isArchived } = getOccasionCategory(occ);
      return isPast || isArchived;
    });

  const filteredOccasions = dashboardTab === 'upcoming' ? upcomingOccasions : archivedOrPastOccasions;

  return (
    <>
      {renderNav()}
      
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
            if (myBookingsList.length === 0) {
              return (
                <div className="glass-panel empty-state">
                  <div className="empty-state-icon">🛍️</div>
                  <h3>Brak aktywnych rezerwacji i zakupów</h3>
                  <p style={{ marginBottom: '1.5rem' }}>
                    Nie masz obecnie żadnych zarezerwowanych prezentów. Przejdź do aktywnego wydarzenia, aby zarezerwować prezent!
                  </p>
                  <button className="btn btn-primary" onClick={() => setView('dashboard')}>
                    Przeglądaj wydarzenia
                  </button>
                </div>
              );
            }

            const purchasesList = myBookingsList.filter(b => b.is_approved);
            const reservationsList = myBookingsList.filter(b => 
              !b.is_approved && !bookings.some(bk => bk.gift_id === b.gift_id && bk.is_approved)
            );
            const rejectedList = myBookingsList.filter(b => 
              !b.is_approved && bookings.some(bk => bk.gift_id === b.gift_id && bk.is_approved)
            );

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                {/* 1. CONFIRMED PURCHASES */}
                <div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🛍️ Moje Zakupy (Do kupienia) <span className="occasion-badge" style={{ margin: 0, padding: '0.2rem 0.6rem', fontSize: '0.85rem' }}>{purchasesList.length}</span>
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Organizator zatwierdził te rezerwacje i zamienił je w polecenie zakupu. Kup te prezenty!
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
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Akcje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchasesList.map(b => {
                            const gift = allGifts.find(g => g.id === b.gift_id);
                            if (!gift) return null;
                            const occasion = occasions.find(o => o.id === gift.occasion_id);
                            if (!occasion) return null;

                            return (
                              <tr key={b.id}>
                                <td data-label="Prezent" style={{ fontWeight: 500 }}>
                                  {gift.name}
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
                                            await handleUnbook(gift.id);
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
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Akcje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reservationsList.map(b => {
                            const gift = allGifts.find(g => g.id === b.gift_id);
                            if (!gift) return null;
                            const occasion = occasions.find(o => o.id === gift.occasion_id);
                            if (!occasion) return null;

                            // Calculate queue position
                            const giftBookings = bookings
                              .filter(bk => bk.gift_id === gift.id)
                              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                            const queuePos = giftBookings.findIndex(bk => bk.id === b.id) + 1;
                            const totalInQueue = giftBookings.length;

                            return (
                              <tr key={b.id}>
                                <td data-label="Prezent" style={{ fontWeight: 500 }}>
                                  {gift.name}
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
                                        await handleUnbook(gift.id);
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
                            <th>Kupujący</th>
                            <th style={{ textAlign: 'right' }}>Akcje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rejectedList.map(b => {
                            const gift = allGifts.find(g => g.id === b.gift_id);
                            if (!gift) return null;
                            const occasion = occasions.find(o => o.id === gift.occasion_id);
                            if (!occasion) return null;

                            const approvedBooking = bookings.find(bk => bk.gift_id === b.gift_id && bk.is_approved);
                            const approvedBuyerName = approvedBooking 
                              ? (profiles[approvedBooking.user_id]?.display_name || 'Znajomy')
                              : 'Ktoś inny';

                            return (
                              <tr key={b.id} style={{ opacity: 0.85 }}>
                                <td data-label="Prezent" style={{ fontWeight: 500, textDecoration: 'line-through', color: 'var(--text-secondary)' }}>
                                  {gift.name}
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
                                <td data-label="Kupujący" style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                                  Kupuje: {approvedBuyerName}
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
                                            await handleUnbook(gift.id);
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
              <h1>Planowane Okazje</h1>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                Przeglądaj wydarzenia znajomych i rodziny lub stwórz własne.
              </p>
            </div>
            <div>
              <button className="btn btn-primary" onClick={openNewOccasionModal}>
                ➕ Nowe Wydarzenie
              </button>
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
                className={`tab-btn ${dashboardTab === 'archived' ? 'active' : ''}`} 
                onClick={() => setDashboardTab('archived')}
              >
                🗄️ Archiwum i minione ({archivedOrPastOccasions.length})
              </button>
            </div>

            <div className="view-toggle" style={{ flexShrink: 0 }}>
              <button 
                className={`view-toggle-btn ${occasionsView === 'table' ? 'active' : ''}`}
                onClick={() => {
                  setOccasionsView('table');
                  localStorage.setItem('gp_occasions_view', 'table');
                }}
              >
                📊 Lista
              </button>
              <button 
                className={`view-toggle-btn ${occasionsView === 'grid' ? 'active' : ''}`}
                onClick={() => {
                  setOccasionsView('grid');
                  localStorage.setItem('gp_occasions_view', 'grid');
                }}
              >
                🎴 Kafle
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

          {loading && <div style={{ textAlign: 'center', padding: '2rem' }}>Ładowanie wydarzeń...</div>}

          {!loading && filteredOccasions.length === 0 && (
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

          {occasionsView === 'table' ? (
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
                      <tr key={occ.id}>
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
                        <td data-label="Szczegóły" style={{ textAlign: 'right' }}>
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
          ) : (
            <div className="occasions-grid">
              {filteredOccasions.map(occ => {
                const daysLeft = getDaysLeft(occ.date);
                const isCreator = occ.creator_id === user.id;
                const isOwner = occ.owner_id === user.id;

                return (
                  <div key={occ.id} className="glass-panel occasion-card" onClick={() => selectOccasion(occ)}>
                    <div 
                      className="occasion-badge" 
                      style={occ.is_archived ? { background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-secondary)' } : (occ.is_draft ? { background: 'rgba(245, 158, 11, 0.15)', color: '#fba524' } : undefined)}
                    >
                      {occ.is_archived ? '🗄️ Zarchiwizowane' : (occ.is_draft ? '🛠️ Robocze' : daysLeft)}
                    </div>
                    <h3>{occ.title}</h3>
                    <div className="occasion-meta">
                      📅 {formatDate(occ.date)} {occ.time && `o ${occ.time}`}
                      <br />
                      👤 Dla: <strong>{occ.owner_name}</strong> {isOwner && '(To Ty!)'}
                      {occ.location && (
                        <>
                          <br />
                          📍 {occ.location}
                        </>
                      )}
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
                        <div style={{ display: 'flex', gap: '0.35rem' }} onClick={e => e.stopPropagation()}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }} 
                            onClick={() => startEditOccasion(occ)}
                            title="Edytuj"
                          >
                            ✏️
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }} 
                            onClick={() => handleToggleArchiveOccasion(occ)}
                            title={occ.is_archived ? "Przywróć" : "Zarchiwizuj"}
                          >
                            🗄️
                          </button>
                          <button 
                            className="btn btn-danger btn-secondary" 
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }} 
                            onClick={(e) => handleDeleteOccasion(occ.id, e)}
                            title="Usuń"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* ----------------- OCCASION VIEW ----------------- */}
      {view === 'occasion' && activeOccasion && (
        <main className="container">
          <button className="back-link" onClick={() => { setView('dashboard'); setActiveOccasion(null); }}>
            ← Powrót do pulpitu
          </button>

           {activeOccasion.is_draft && (
            <div className="alert alert-warning" style={{ marginBottom: '1.5rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fba524', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
              🛠️ To wydarzenie jest w wersji roboczej (widoczne tylko dla organizatorów).
            </div>
          )}

          {activeOccasion.is_archived && (
            <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
              🗄️ To wydarzenie jest zarchiwizowane.
            </div>
          )}

          {(() => {
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
                <div className="occasion-date">
                  📅 {formatDate(activeOccasion.date)} 
                  {activeOccasion.time && ` o ${activeOccasion.time}`} 
                  {` (${getDaysLeft(activeOccasion.date)})`}
                </div>
                <h1 style={{ margin: '0 0 0.5rem 0' }}>{activeOccasion.title}</h1>
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
                {activeOccasion.description && (
                  <p style={{ marginTop: '1rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                    "{activeOccasion.description}"
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {activeOccasion.creator_id === user.id && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {activeOccasion.is_draft && (
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', border: '1px solid var(--accent-green)', color: 'var(--accent-green)' }} 
                        onClick={() => handleApproveOccasion(activeOccasion.id, false)}
                      >
                        ✅ Zatwierdź
                      </button>
                    )}
                    <button className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem' }} onClick={() => startEditOccasion(activeOccasion)}>
                      ✏️ Edytuj
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem' }} onClick={() => handleToggleArchiveOccasion(activeOccasion)}>
                      {activeOccasion.is_archived ? '🗄️ Przywróć' : '🗄️ Zarchiwizuj'}
                    </button>
                    <button className="btn btn-danger btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem' }} onClick={(e) => handleDeleteOccasion(activeOccasion.id, e)}>
                      🗑️ Usuń
                    </button>
                  </div>
                )}
                <button className="btn btn-primary" onClick={openGiftModal}>
                  {activeTab === 'goscie' ? '🎉 Zaproponuj Niespodziankę' : '🎁 Dodaj Prezent'}
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

          {/* Navigation Tabs and View Toggle */}
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
              </div>
            ) : (
              <div></div>
            )}

            <div className="view-toggle" style={{ flexShrink: 0 }}>
              <button 
                className={`view-toggle-btn ${giftsView === 'table' ? 'active' : ''}`}
                onClick={() => {
                  setGiftsView('table');
                  localStorage.setItem('gp_gifts_view', 'table');
                }}
              >
                📊 Lista
              </button>
              <button 
                className={`view-toggle-btn ${giftsView === 'grid' ? 'active' : ''}`}
                onClick={() => {
                  setGiftsView('grid');
                  localStorage.setItem('gp_gifts_view', 'grid');
                }}
              >
                🎴 Kafle
              </button>
            </div>
          </div>

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
                    giftsView === 'table' ? (
                      renderGiftsTable(solenizantGifts)
                    ) : (
                      <div className="gifts-grid">
                        {solenizantGifts.map(gift => renderGiftCard(gift, false))}
                      </div>
                    )
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
                        Zaproponuj niespodziankę
                      </button>
                    </div>
                  ) : (
                    giftsView === 'table' ? (
                      renderGiftsTable(sortedGoscieGifts, true)
                    ) : (
                      <div className="gifts-grid">
                        {sortedGoscieGifts.map(gift => renderGiftCard(gift, true))}
                      </div>
                    )
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
              <h2>{editingOccasion ? 'Edytuj wydarzenie' : 'Dodaj nowe wydarzenie'}</h2>
              <button className="close-btn" onClick={closeOccasionModal}>×</button>
            </div>
            
            <form onSubmit={handleSaveOccasion}>
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

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowGiftModal(false)}>
                  Anuluj
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
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
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setActiveOccasionDetails(null)}
              >
                Zamknij
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
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
                      style={{ border: '1px solid var(--accent-green)', color: 'var(--accent-green)' }}
                      onClick={() => handleApproveOccasion(activeOccasionDetails.id, true)}
                    >
                      ✅ Zatwierdź
                    </button>
                  )}
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
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
                    onClick={() => {
                      handleToggleArchiveOccasion(activeOccasionDetails);
                    }}
                  >
                    {activeOccasionDetails.is_archived ? '🗄️ Przywróć' : '🗄️ Zarchiwizuj'}
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-danger btn-secondary" 
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
          <div className="glass-panel modal-content" style={{ maxWidth: '500px' }}>
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
                    activeGiftDetails.urls.map((link, idx) => (
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
                    {renderGiftBookingsCell(activeGiftDetails)}
                  </div>
                </div>
              )}

              {(!isOwnerActiveOccasion && activeTab === 'goscie') && (
                <div>
                  <strong style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Głosowanie:</strong>
                  <div style={{ marginTop: '0.35rem' }}>
                    <button 
                      className={`btn ${hasUserVoted(activeGiftDetails.id) ? 'btn-primary' : 'btn-secondary'}`} 
                      style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                      onClick={() => hasUserVoted(activeGiftDetails.id) ? handleUnvote(activeGiftDetails.id) : handleVote(activeGiftDetails.id)}
                    >
                      👍 {getVoteCount(activeGiftDetails.id)} Głosów
                    </button>
                  </div>
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
              {(activeGiftDetails.suggested_by === user?.id || activeOccasion?.creator_id === user?.id) && (
                <button 
                  type="button" 
                  className="btn btn-danger btn-secondary" 
                  onClick={() => {
                    handleDeleteGift(activeGiftDetails.id);
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

      {/* ----------------- BOOKING MODAL ----------------- */}
      {bookingModal?.show && (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
          <div className="glass-panel modal-content" style={{ maxWidth: '450px', textAlign: 'center' }}>
            <div className="modal-header" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>🎁 Rezerwacja prezentu</h2>
            </div>
            <div className="modal-body" style={{ marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: '1.5' }}>
              Chcesz zarezerwować prezent <strong>{bookingModal.giftName}</strong>.
              <br />
              Wybierz, czy kupujesz go samodzielnie, czy chcesz zorganizować składkę:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button 
                className="btn btn-primary" 
                onClick={async () => {
                  const gId = bookingModal.giftId;
                  setBookingModal(null);
                  await handleBook(gId, false, null);
                }}
              >
                👤 Rezerwuję sam (kupuję samodzielnie)
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ border: '1px solid var(--primary)' }}
                onClick={async () => {
                  const gId = bookingModal.giftId;
                  setBookingModal(null);
                  await handleBook(gId, true, generateUUID());
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
