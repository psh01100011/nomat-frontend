import { DoorOpen, Map, PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styles from './home.module.css';

export function HomePage() {
  const navigate = useNavigate();

  return (
    <section className={styles.home}>
      <div className={styles.hero}>
        <h1>NOMAT</h1>
      </div>
      <div className={styles.actionGrid}>
        <button className={styles.primaryCard} type="button" onClick={() => navigate('/maps')}>
          <Map size={30} />
          <span>맵</span>
          <strong>퀴즈 찾기</strong>
        </button>
        <button className={styles.roomCard} type="button" onClick={() => navigate('/rooms')}>
          <DoorOpen size={30} />
          <span>게임방</span>
          <strong>게임 참여</strong>
        </button>
        <button className={styles.createCard} type="button" onClick={() => navigate('/maps/new')}>
          <PenLine size={30} />
          <span>맵 제작</span>
          <strong>문제 만들기</strong>
        </button>
      </div>
    </section>
  );
}
