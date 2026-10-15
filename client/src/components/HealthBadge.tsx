import { useEffect, useState } from 'react';

type Health = { status: string; version: string; database: string };

// Shows which build is running and whether the API can reach the database (PB-01).
export function HealthBadge() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <small>API unreachable</small>;
  if (!health) return <small>Checking API…</small>;
  return (
    <small>
      Build {health.version} · database {health.database}
    </small>
  );
}
