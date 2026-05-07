import type { EventEmitter2 } from '@nestjs/event-emitter';

// ─────────────────────────────────────────────────────────────────────────────
// EventEmitter2 stub.
//
// Services emit events post-commit. Tests verify the event was emitted with
// the right name + payload, but never await listeners (those are integration
// concerns).
// ─────────────────────────────────────────────────────────────────────────────

export function createMockEvents(): jest.Mocked<Pick<EventEmitter2, 'emit'>> {
    return {
        emit: jest.fn().mockReturnValue(true),
    };
}
