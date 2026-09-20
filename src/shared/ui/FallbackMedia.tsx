import { CircleUserRound, FileText, Image as ImageIcon, Music, Sparkles, UserRound } from 'lucide-react';
import { QuestionType } from '@/entities/map';
import { UserType } from '@/entities/user';
import { displayNickname } from '@/shared/format/display-labels';
import styles from './fallback-media.module.css';

export function MapArtwork({
  title,
  type,
  imageUrl,
}: {
  title: string;
  type?: QuestionType | null;
  imageUrl?: string | null;
}) {
  if (imageUrl) return <img alt={title} src={imageUrl} />;

  const Icon = type === 'AUDIO' ? Music : type === 'IMAGE' ? ImageIcon : type === 'TEXT' ? FileText : Sparkles;
  const className = [styles.artwork, type ? styles[type.toLowerCase()] : styles.default].filter(Boolean).join(' ');

  return (
    <div className={className} aria-label={`${title} 기본 이미지`}>
      <Icon size={34} />
      <span>{type === 'AUDIO' ? '오디오 맵' : type === 'IMAGE' ? '이미지 맵' : type === 'TEXT' ? '텍스트 맵' : 'NOMAT'}</span>
    </div>
  );
}

export function UserAvatar({
  nickname,
  imageUrl,
  size = 'md',
  userType,
}: {
  nickname: string;
  imageUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  userType?: UserType | null;
}) {
  const name = displayNickname(nickname);
  const isGuest = userType === 'GUEST';
  const className = [
    styles.avatar,
    isGuest ? styles.avatarGuest : '',
    size === 'xs' ? styles.avatarXs : '',
    size === 'sm' ? styles.avatarSm : '',
    size === 'lg' ? styles.avatarLg : '',
  ].filter(Boolean).join(' ');

  return (
    <span className={className} aria-label={isGuest ? `${name}, 게스트 사용자` : undefined} role={isGuest ? 'img' : undefined} title={isGuest ? '게스트 사용자' : undefined}>
      {isGuest ? (
        <UserRound size={size === 'xs' ? 15 : size === 'sm' ? 18 : size === 'lg' ? 38 : 24} aria-hidden="true" />
      ) : imageUrl ? (
        <img alt={name} src={imageUrl} />
      ) : (
        <CircleUserRound size={size === 'xs' ? 17 : size === 'sm' ? 20 : size === 'lg' ? 42 : 26} />
      )}
    </span>
  );
}
