import { UserRound } from 'lucide-react';
import { UserType } from '@/entities/user';
import { displayNickname } from '@/shared/format/display-labels';
import styles from './user-name.module.css';

export function UserName({
  nickname,
  userType,
  className = '',
}: {
  nickname: string | null | undefined;
  userType?: UserType | null;
  className?: string;
}) {
  const name = displayNickname(nickname);
  const isGuest = userType === 'GUEST';

  return (
    <span className={`${styles.userName} ${className}`.trim()} title={isGuest ? `${name} · 게스트 사용자` : name}>
      <span className={styles.nickname}>{name}</span>
      {isGuest && (
        <span className={styles.guestMark} aria-label="게스트 사용자" role="img">
          <UserRound aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
