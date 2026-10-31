import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchStoreProfile, type StoreProfile } from '../lib/api';

const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function StorePage() {
  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchStoreProfile().then(setProfile).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <section className="page"><h1>Our store</h1><p role="alert" className="error-text">{error}</p></section>;
  if (!profile) return <section className="page"><h1>Our store</h1><p>Loading store information…</p></section>;

  const mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(profile.streetAddress)}`;
  return (
    <section className="page info-page">
      <h1>{profile.name}</h1>
      <p className="info-description">{profile.description}</p>
      <div className="info-grid">
        <section className="card">
          <h2>Visit us</h2>
          <p><a href={mapUrl} target="_blank" rel="noreferrer">{profile.streetAddress}</a></p>
          <p className="muted small">Select the address for directions in Google Maps or its installed app.</p>
          <h2>Contact</h2>
          <p>Telephone: <a href={`tel:${profile.phone.replace(/[^+\d]/g, '')}`}>{profile.phone}</a></p>
          {profile.email && <p>Email: <a href={`mailto:${profile.email}`}>{profile.email}</a></p>}
        </section>
        <section className="card">
          <h2>Opening hours</h2>
          <dl className="hours-list">
            {dayOrder.map((day) => (
              <div key={day}><dt>{day[0].toUpperCase() + day.slice(1)}</dt><dd>{profile.openingHours[day] || 'Hours not listed'}</dd></div>
            ))}
          </dl>
        </section>
      </div>
      <p><Link to="/gallery">See our photo gallery</Link></p>
    </section>
  );
}
