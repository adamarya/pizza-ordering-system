import { useEffect, useState, type FormEvent } from 'react';
import { fetchStoreProfile, saveStoreProfile, type StoreProfile } from '../lib/api';

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const emptyProfile: StoreProfile = {
  name: '', description: '', streetAddress: '', phone: '', email: '',
  openingHours: Object.fromEntries(days.map((day) => [day, ''])) as Record<string, string>,
};

export function StoreSettingsPage() {
  const [profile, setProfile] = useState<StoreProfile>(emptyProfile);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStoreProfile()
      .then((data) => setProfile({ ...emptyProfile, ...data, openingHours: { ...emptyProfile.openingHours, ...data.openingHours } }))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const update = (field: keyof Omit<StoreProfile, 'openingHours'>, value: string) =>
    setProfile((current) => ({ ...current, [field]: value }));
  const updateHours = (day: string, value: string) =>
    setProfile((current) => ({ ...current, openingHours: { ...current.openingHours, [day]: value } }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage(''); setError('');
    try {
      const saved = await saveStoreProfile(profile, token);
      setProfile(saved);
      setMessage('Store settings saved. The public store page now uses these values.');
      setToken('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="page"><h1>Store settings</h1><p>Loading current settings…</p></section>;
  return (
    <section className="page">
      <h1>Store settings</h1>
      <p className="muted">Manager-only editor for the public restaurant profile. Changes are saved to the server database.</p>
      <form className="card settings-form" onSubmit={submit}>
        <label className="field">Manager settings token
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="current-password" required />
        </label>
        <p className="muted small">The token must be configured as MANAGER_SETTINGS_TOKEN in the server environment. It is sent only with this save request and is not stored in the browser.</p>
        <label className="field">Restaurant name
          <input value={profile.name} maxLength={120} onChange={(e) => update('name', e.target.value)} required />
        </label>
        <label className="field">Description
          <textarea value={profile.description} maxLength={2000} rows={4} onChange={(e) => update('description', e.target.value)} required />
        </label>
        <label className="field">Street address
          <input value={profile.streetAddress} maxLength={300} onChange={(e) => update('streetAddress', e.target.value)} required />
        </label>
        <div className="info-grid">
          <label className="field">Telephone
            <input type="tel" value={profile.phone} maxLength={40} onChange={(e) => update('phone', e.target.value)} required />
          </label>
          <label className="field">Email
            <input type="email" value={profile.email} maxLength={254} onChange={(e) => update('email', e.target.value)} />
          </label>
        </div>
        <fieldset>
          <legend>Opening hours</legend>
          <div className="hours-editor">
            {days.map((day) => (
              <label className="field" key={day}>{day[0].toUpperCase() + day.slice(1)}
                <input value={profile.openingHours[day] ?? ''} maxLength={100} placeholder="e.g. 11:00 AM – 9:00 PM" onChange={(e) => updateHours(day, e.target.value)} />
              </label>
            ))}
          </div>
        </fieldset>
        {message && <p role="status" className="success-text">{message}</p>}
        {error && <p role="alert" className="error-text">{error}</p>}
        <button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save store settings'}</button>
      </form>
    </section>
  );
}
