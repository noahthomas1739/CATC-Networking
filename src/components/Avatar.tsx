/* eslint-disable @next/next/no-img-element */
export function Avatar({ userId, name, hasPhoto, large }: { userId: string; name: string; hasPhoto: boolean; large?: boolean }) {
  const cls = large ? 'avatar avatar-lg' : 'avatar';
  if (hasPhoto) {
    return <img className={cls} src={`/api/photos/${userId}`} alt="" width={large ? 120 : 64} height={large ? 120 : 64} />;
  }
  return <span className={cls} aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>;
}
