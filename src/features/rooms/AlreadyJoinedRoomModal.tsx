import { useMutation } from '@tanstack/react-query';
import { DoorOpen } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoomStatus } from '@/entities/room';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { useSingleFlight } from '@/shared/hooks/use-single-flight';
import { Modal } from '@/shared/ui/Modal';
import { currentRoomStorage } from './current-room-storage';
import { roomApi } from './room-api';

export function AlreadyJoinedRoomModal({
  open,
  roomId,
  onClose,
}: {
  open: boolean;
  roomId: number | null;
  status?: RoomStatus | null;
  onClose: () => void;
}) {
  const runOnce = useSingleFlight();
  const navigate = useNavigate();
  const [notice, setNotice] = useState('');
  const leaveMutation = useMutation({
    mutationFn: () => roomApi.leave(roomId ?? 0),
    onSuccess: () => {
      currentRoomStorage.clear();
      onClose();
    },
  });

  const moveToRoom = async () => {
    if (!roomId) {
      onClose();
      return;
    }
    try {
      const currentRoom = await roomApi.current();
      if (currentRoom.roomId !== roomId) {
        currentRoomStorage.clear();
        setNotice('이미 나간 방이거나 더 이상 참여 중인 방이 아닙니다.');
        return;
      }
      currentRoomStorage.write(roomId);
      onClose();
      navigate(currentRoom.status === 'PLAYING' ? '/play' : '/room');
    } catch {
      currentRoomStorage.clear();
      setNotice('이미 나간 방이거나 더 이상 참여 중인 방이 아닙니다.');
    }
  };

  return (
    <Modal
      open={open}
      title="이미 참여 중인 방이 있습니다"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          {roomId && (
            <Button variant="secondary" disabled={leaveMutation.isPending} onClick={() => runOnce('joined-room-leave', () => leaveMutation.mutateAsync())}>
              참여 중인 방 나가기
            </Button>
          )}
          <Button icon={<DoorOpen size={17} />} onClick={moveToRoom}>
            {roomId ? '참여 중인 방으로 이동' : '확인'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">
          새 방을 만들거나 다른 방에 입장하려면 현재 참여 중인 방을 먼저 정리해야 합니다.
          {'\n'}다른 탭에서 게임 중이라면 그 탭에서 계속 진행하거나 방을 나가주세요.
        </p>
        {notice && <Alert tone="danger">{notice}</Alert>}
        {leaveMutation.isError && <Alert tone="danger">참여 중인 방에서 나가지 못했습니다. 잠시 후 다시 시도해주세요.</Alert>}
      </div>
    </Modal>
  );
}
