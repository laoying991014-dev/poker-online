import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface RoomRealtimeEvent {
  data: {
    type: 'room-updated' | 'heartbeat';
    roomId?: string;
    emittedAt?: string;
  };
}

interface RoomEventChannel {
  subject: Subject<RoomRealtimeEvent>;
  subscribers: number;
}

@Injectable()
export class GameRealtimeService {
  private readonly channels = new Map<string, RoomEventChannel>();

  streamRoom(roomId: string): Observable<RoomRealtimeEvent> {
    return new Observable<RoomRealtimeEvent>((subscriber) => {
      let channel = this.channels.get(roomId);
      if (!channel) {
        channel = { subject: new Subject<RoomRealtimeEvent>(), subscribers: 0 };
        this.channels.set(roomId, channel);
      }

      channel.subscribers += 1;
      const subscription = channel.subject.subscribe(subscriber);
      const heartbeat = setInterval(() => {
        subscriber.next({ data: { type: 'heartbeat' } });
      }, 20_000);

      return () => {
        clearInterval(heartbeat);
        subscription.unsubscribe();

        const activeChannel = this.channels.get(roomId);
        if (activeChannel !== channel) return;

        channel!.subscribers -= 1;
        if (channel!.subscribers <= 0) {
          channel!.subject.complete();
          this.channels.delete(roomId);
        }
      };
    });
  }

  publishRoomUpdate(roomId: string): void {
    this.channels.get(roomId)?.subject.next({
      data: {
        type: 'room-updated',
        roomId,
        emittedAt: new Date().toISOString(),
      },
    });
  }
}
