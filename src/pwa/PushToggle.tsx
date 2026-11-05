import { useEffect, useState } from 'react';
import { errorMessage } from '../api';
import { Checkbox } from '../components/Input';
import { useToast } from '../components/Toast';
import { currentSubscription, disablePush, enablePush, pushSupported } from './push';

/** On this device only. The notification shows a generic message and opens the app; no content is stored. */
export function PushToggle() {
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void currentSubscription().then((s) => setOn(!!s)); }, []);
  if (!pushSupported()) return <p className="text-2">This browser does not support push notifications.</p>;
  return (
    <Checkbox
      label="Notify me on this device"
      hint="Shows that something needs your attention. Details stay inside the app."
      checked={on}
      disabled={busy}
      onChange={async (e) => {
        const want = e.target.checked;
        setBusy(true);
        try {
          if (want) await enablePush(); else await disablePush();
          setOn(want);
        } catch (x) { toast(errorMessage(x), 'error'); } finally { setBusy(false); }
      }}
    />
  );
}
