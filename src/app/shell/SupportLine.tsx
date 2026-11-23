import type { PublicConfig } from '../../lib/config';

export function SupportLine({ cfg }: { cfg: PublicConfig }) {
  const { supportEmail, supportPhone, helpUrl } = cfg.brand;
  if (!supportEmail && !supportPhone && !helpUrl) return null;
  return (
    <p className="text-xs text-3 support-line">
      Need help?
      {supportEmail && <> <a href={`mailto:${supportEmail}`}>{supportEmail}</a></>}
      {supportPhone && <> · <a href={`tel:${supportPhone.replace(/[^+\d]/g, '')}`}>{supportPhone}</a></>}
      {helpUrl && <> · <a href={helpUrl} target="_blank" rel="noreferrer noopener">Help centre</a></>}
    </p>
  );
}
